(function () {
  const $ = s => document.querySelector(s);
  const MAX_ROWS = 400;
  const SEATS = [1, 2, 3, 4, 5];

  const state = {
    sess: null, room: null, me: null, opp: null, players: [],
    scrambles: new Map(),
    solves: new Map(),
    byRound: new Map(),
    seatById: new Map(),
    rounds: [],
    rowEls: new Map(),
    round: 0, activeRound: 0,
    locked: false, modalOpen: false, modalId: null,
    playerSolvedThisRound: false,
    isHost: false
  };

  const pendingScrambles = new Set();
  let timer = null, dbChannel = null, presChannel = null;

  if (window.initTheme) initTheme();

  boot();
  async function boot() {
    const loadingMsg = $('#loadingMsg');
    const setLoading = txt => { if (loadingMsg) loadingMsg.textContent = txt; };
    try {
      const raw = sessionStorage.getItem('cd.session');
      if (!raw) return goHome('No active room.');
      state.sess = JSON.parse(raw);
      document.title = `Room ${state.sess.code} — CubeDuel`;
      $('#roomCode').textContent = state.sess.code;

      // ---- Preflight: connection -> auth -> database (bug 1.6) ----
      // Fail fast with a specific, actionable message at each stage instead
      // of one generic error once everything has already been attempted.
      setLoading('Checking connection…');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('No internet connection. Check your network and try again.');
      }

      setLoading('Checking authentication…');
      try {
        await SB.ensureAuth();
      } catch (authErr) {
        console.error('[CubeDuel] Auth failed:', authErr);
        throw new Error(authErr.message || 'Authentication failed. Reload and try again.');
      }

      setLoading('Checking database…');
      try {
        state.room = await API.findRoom(state.sess.code);
      } catch (dbErr) {
        console.error('[CubeDuel] Database check failed:', dbErr);
        throw new Error('Could not reach the database: ' + (dbErr.message || 'unknown error'));
      }
      if (!state.room) throw new Error('Room no longer exists.');
      $('#cubeBadge').textContent = state.room.cube_type === '222' ? '2×2×2' : '3×3×3';

      setLoading('Loading room…');
      state.players = await API.getPlayers(state.room.id);
      state.players.forEach(p => state.seatById.set(p.id, p.player_number));
      state.me = state.players.find(p => p.id === SB.uid());
      if (!state.me) {
        sessionStorage.setItem('cd.prefill', state.sess.code);
        throw new Error('Your seat was removed. Join again.');
      }
      state.isHost = !!state.room.created_by && state.room.created_by === SB.uid();
      $('#btnForceRound')?.classList.toggle('hidden', !state.isHost);
      $('#btnResolve')?.classList.toggle('hidden', true);

      const [scrs, solvs] = await Promise.all([
        API.getScrambles(state.room.id), API.getSolves(state.room.id)
      ]);
      scrs.forEach(s => { state.scrambles.set(s.solve_number, s); if (s.solve_number > state.round) state.round = s.solve_number; });
      solvs.forEach(s => { state.solves.set(s.id, s); indexSolve(s); });

      renderPlayers();
      buildAllRows();
      renderScramble();
      renderStats();
      setupTimer();
      setupActions();
      setupRealtime();
      initChat();

      if (state.round === 0) await createNextScramble(1);
      maybeAdvanceRound(state.round);

      const alreadySolved = [...state.solves.values()]
        .some(s => s.player_id === SB.uid() && s.solve_number === state.round);
      state.playerSolvedThisRound = alreadySolved;
      updateResolveButton();

      $('#loading').classList.add('hidden');
    } catch (e) {
      console.error('[CubeDuel] Failed to join room:', e);
      $('#loading').classList.add('hidden');
      $('#errMsg').textContent = e.message;
      $('#errOv').classList.remove('hidden');
    }
  }

  function goHome(msg) {
    if (msg) sessionStorage.setItem('cd.msg', msg);
    sessionStorage.removeItem('cd.session');
    location.href = 'index.html';
  }
  $('#errHome').addEventListener('click', () => goHome());

  function initChat() {
    Chat.init({
      roomId: state.room.id,
      myId: SB.uid(),
      players: playersById()
    });
  }

  function playersById() {
    const map = {};
    for (const p of state.players) {
      map[p.id] = { name: p.name, color: getVar('--p' + p.player_number), seat: p.player_number };
    }
    return map;
  }

  // ---------- Realtime ----------
  function setupRealtime() {
    const rid = state.room.id;
    dbChannel = SB.client.channel('cd-db-' + rid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solves', filter: 'room_id=eq.' + rid }, p => {
        if (p.eventType === 'DELETE') applyDelete(p.old);
        else if (p.eventType === 'UPDATE') applySolveUpdate(p.new);
        else applySolve(p.new, true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scrambles', filter: 'room_id=eq.' + rid }, p => {
        applyScramble(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'room_id=eq.' + rid }, () => {
        refreshPlayers();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms', filter: 'id=eq.' + rid }, () => {
        toast('Room was closed.', 'err');
        setTimeout(() => goHome(), 1500);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + rid }, p => {
        Chat.onRealtimeInsert(p.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: 'room_id=eq.' + rid }, p => {
        Chat.onRealtimeDelete(p.old);
      })
      .subscribe();

    presChannel = SB.client.channel('cd-presence-' + state.sess.code, {
      config: { presence: { key: SB.uid() } }
    });
    presChannel.on('presence', { event: 'sync' }, () => renderPresence(presChannel.presenceState()));
    presChannel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await presChannel.track({ name: state.me.name, seat: state.me.player_number });
      }
    });
  }

  async function refreshPlayers() {
    try {
      const before = state.players.length;
      state.players = await API.getPlayers(state.room.id);
      state.players.forEach(p => state.seatById.set(p.id, p.player_number));
      state.me = state.players.find(p => p.id === SB.uid());
      if (!state.me) { toast('Removed from room.', 'err'); setTimeout(() => goHome(), 1200); return; }
      if (state.players.length < before) toast('A player left the room.', 'info');
      if (state.players.length > before) {
        toast('A player joined! (' + state.players.length + '/5)', 'ok');
      }
      Chat.setPlayers(playersById());
      renderPlayers();
      for (const n of state.rounds) upsertRow(n);
      // A player leaving/joining can change whether the current round is
      // "complete" — re-check so the room doesn't stay stuck waiting on
      // someone who's no longer here (bug 1.4).
      maybeAdvanceRound(state.round);
    } catch (e) {
      console.error('[CubeDuel] Failed to refresh players:', e);
      toast(e.message, 'err');
    }
  }

  function renderPresence(ps) {
    const entries = Object.values(ps || {}).flat();
    const others = entries.filter(e => e.seat && e.seat !== state.me.player_number);
    const on = others.length > 0;
    $('#oppDot').className = 'dot ' + (on ? 'on' : 'off');
    if (on) {
      const names = others.map(e => e.name).filter(Boolean).slice(0, 3).join(', ');
      $('#oppStatus').textContent = names + (others.length > 3 ? '…' : '') + ' · online';
    } else {
      $('#oppStatus').textContent = state.players.length > 1 ? 'Others offline' : 'Waiting…';
    }
    // update per-seat presence dots
    for (const seat of SEATS) {
      const dot = $('#p' + seat + 'dot');
      if (!dot) continue;
      const seated = state.players.some(p => p.player_number === seat);
      const online = others.some(e => e.seat === seat) || (seat === state.me.player_number);
      dot.className = 'dot ' + (seated && online ? 'on' : 'off');
    }
  }

  // ---------- Scrambles / Auto Round ----------
  function applyScramble(row) {
    if (!row || state.scrambles.has(row.solve_number)) return;
    state.scrambles.set(row.solve_number, row);
    if (row.solve_number > state.round) {
      state.round = row.solve_number;
      state.playerSolvedThisRound = false;
      updateResolveButton();
      renderScramble();
      toast('Round ' + row.solve_number, 'info');
    }
  }

  function maybeAdvanceRound(roundNumber) {
    const cell = state.byRound.get(roundNumber);
    if (!cell || !state.players.length) return;
    const allSolved = state.players.every(p => cell[p.player_number]);
    if (!allSolved) return;
    const nextN = roundNumber + 1;
    if (state.scrambles.has(nextN)) return;
    createNextScramble(nextN);
  }

  // Host-only escape hatch for bug 1.4: if a player goes quiet mid-round
  // (didn't join in time, tab crashed, never pressed the timer) the round
  // would otherwise be stuck forever, since maybeAdvanceRound only fires
  // once *every* current player has a solve logged for it.
  async function forceNextRound() {
    if (!state.isHost) return;
    if (!confirm('Skip to the next round even though not everyone has solved this one?')) return;
    const nextN = state.round + 1;
    if (state.scrambles.has(nextN)) { toast('Already on round ' + nextN, 'info'); return; }
    await createNextScramble(nextN);
  }

  async function createNextScramble(n) {
    if (state.scrambles.has(n) || pendingScrambles.has(n)) return;
    pendingScrambles.add(n);
    try {
      const sc = ScrambleGen.generate(state.room.cube_type);
      const row = await API.addScramble(state.room.id, n, sc, state.room.cube_type);
      applyScramble(row);
    } catch (e) {
      console.error('[CubeDuel] Failed to create next scramble:', e);
      toast('Round advance failed: ' + e.message, 'err');
    } finally {
      pendingScrambles.delete(n);
    }
  }

  function renderScramble() {
    const s = state.scrambles.get(state.round);
    $('#scrambleText').textContent = s ? s.scramble : 'Generating…';
    $('#roundBadge').textContent = `Solve ${state.round || 1} / ∞`;
    $('#solveStamp').textContent = state.round ? 'Round #' + state.round : '';
  }

  // ---------- Timer ----------
  function setupTimer() {
    timer = new CubeTimer({
      digits: $('#timerDigits'),
      pill: $('#timerPill'),
      deck: $('#timerDeck'),
      isLocked: () => state.locked || state.modalOpen || state.playerSolvedThisRound,
      onStart: () => { state.activeRound = state.round; $('#solveStamp').textContent = 'Solving #' + state.activeRound; },
      onFinish: saveSolve
    });
    $('#chkInspection').addEventListener('change', e => timer.setInspection(e.target.checked));
  }

  async function saveSolve({ rawMs, forced }) {
    if (state.locked) return;
    state.locked = true;
    const n = state.activeRound || state.round;
    let optimisticRow = null;
    try {
      if (!n) throw new Error('No scramble yet.');
      const scrRow = state.scrambles.get(n);
      const penalty = forced || 'none';
      const row = {
        id: uuid(), room_id: state.room.id, player_id: SB.uid(),
        solve_number: n, raw_time: Math.round(rawMs), penalty,
        final_time: API.computeFinal(Math.round(rawMs), penalty),
        scramble: scrRow ? scrRow.scramble : '', cube_type: state.room.cube_type,
        created_at: new Date().toISOString()
      };
      optimisticRow = row;
      applySolve(row, false);
      await API.insertSolve(row);
      state.playerSolvedThisRound = true;
      updateResolveButton();
      maybeAdvanceRound(n);
      toast(`Logged #${n}: ${row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time)}`, 'ok');
    } catch (e) {
      console.error('[CubeDuel] Failed to save solve:', e);
      if (optimisticRow) rollbackSolve(optimisticRow);
      toast(e.message, 'err');
    } finally {
      state.locked = false;
      $('#solveStamp').textContent = 'Round #' + state.round;
    }
  }

  function rollbackSolve(row) {
    state.solves.delete(row.id);
    const cell = state.byRound.get(row.solve_number);
    if (cell) { const s = seatOf(row.player_id); if (s != null) cell[s] = null; }
    upsertRow(row.solve_number);
    renderStats();
  }

  // ---------- Re-solve this round (bug 1.5) ----------
  // If a scramble was misread, a solve was mis-logged, or the connection
  // hiccuped, the player would otherwise be stuck locked out of the round
  // (playerSolvedThisRound never resets). This discards their existing
  // solve for the current round and re-opens the timer for it.
  function myCurrentRoundSolve() {
    const cell = state.byRound.get(state.round);
    if (!cell) return null;
    const seat = state.me.player_number;
    return cell[seat] || null;
  }

  function updateResolveButton() {
    const btn = $('#btnResolve');
    if (!btn) return;
    btn.classList.toggle('hidden', !state.playerSolvedThisRound || !myCurrentRoundSolve());
  }

  async function resolveRound() {
    const row = myCurrentRoundSolve();
    if (!row) return;
    if (!confirm('Discard your time for round #' + state.round + ' and solve it again?')) return;
    state.locked = true;
    try {
      await API.deleteSolve(row.id);
      applyDelete(row);
      state.playerSolvedThisRound = false;
      updateResolveButton();
      toast('Round #' + state.round + ' cleared — go again.', 'info');
    } catch (e) {
      console.error('[CubeDuel] Failed to clear solve for re-solve:', e);
      toast('Could not clear solve: ' + e.message, 'err');
    } finally {
      state.locked = false;
    }
  }
  $('#btnResolve')?.addEventListener('click', resolveRound);
  $('#btnForceRound')?.addEventListener('click', forceNextRound);

  // ---------- Solves ----------
  // Returns the player's seat number, or null if they're not (or no longer)
  // seated in this room — never a falsy-but-truthy-adjacent 0 (bug 2.2).
  function seatOf(pid) {
    if (pid === SB.uid()) return state.me.player_number;
    const seat = state.seatById.get(pid);
    return seat !== undefined ? seat : null;
  }

  function indexSolve(row) {
    let cell = state.byRound.get(row.solve_number);
    if (!cell) { cell = {}; state.byRound.set(row.solve_number, cell); }
    const s = seatOf(row.player_id);
    if (s != null) cell[s] = row;
  }

  function applySolve(row, confirmed) {
    if (state.solves.has(row.id)) return false;
    state.solves.set(row.id, row);
    indexSolve(row);
    ensureRoundInList(row.solve_number);
    upsertRow(row.solve_number);
    renderStats();
    updateLastLine(row);
    $('#emptyNote').classList.add('hidden');
    if (state.modalOpen && state.modalId === row.id) fillModal(row);
    if (confirmed) maybeAdvanceRound(row.solve_number);
    return true;
  }

  function applySolveUpdate(row) {
    state.solves.set(row.id, row);
    indexSolve(row);
    upsertRow(row.solve_number);
    renderStats();
    updateLastLine(row);
    if (state.modalOpen && state.modalId === row.id) fillModal(row);
  }

  function applyDelete(row) {
    state.solves.delete(row.id);
    const cell = state.byRound.get(row.solve_number);
    if (cell) { const s = seatOf(row.player_id); if (s != null) cell[s] = null; }
    upsertRow(row.solve_number);
    renderStats();
    if (row.solve_number === state.round && row.player_id === SB.uid()) {
      state.playerSolvedThisRound = false;
      updateResolveButton();
    }
    if (state.modalOpen && state.modalId === row.id) closeModal();
  }

  function ensureRoundInList(n) {
    if (!state.rounds.includes(n)) {
      state.rounds.push(n);
      state.rounds.sort((a, b) => a - b);
    }
  }

  function buildAllRows() {
    const all = new Set([...state.scrambles.keys(), ...state.byRound.keys()]);
    state.rounds = [...all].sort((a, b) => a - b);
    const shown = state.rounds.slice(-MAX_ROWS);
    if (state.rounds.length > MAX_ROWS) addTruncationNote();
    for (const n of shown) upsertRow(n);
    if (state.solves.size) $('#emptyNote').classList.add('hidden');
  }

  function addTruncationNote() {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="trunc">… earlier rounds hidden</td>';
    $('#rowsBody').appendChild(tr);
  }

  function upsertRow(n) {
    let tr = state.rowEls.get(n);
    const body = $('#rowsBody');
    if (!tr) {
      tr = document.createElement('tr');
      tr.innerHTML = `<td class="c-n">${n}</td>` + SEATS.map(s => `<td class="c-p p${s}"></td>`).join('');
      state.rowEls.set(n, tr);
      const nextN = state.rounds.find(r => r > n && state.rowEls.has(r));
      if (nextN) body.insertBefore(tr, state.rowEls.get(nextN));
      else body.appendChild(tr);
      if (state.rowEls.size > MAX_ROWS) {
        const oldest = state.rounds.find(r => state.rowEls.has(r));
        if (oldest != null) { state.rowEls.get(oldest).remove(); state.rowEls.delete(oldest); }
      }
    }
    const cell = state.byRound.get(n) || {};
    const filled = SEATS.map(s => cell[s]).filter(Boolean);
    let bestTime = null;
    for (const row of filled) {
      if (row.final_time != null && (bestTime == null || row.final_time < bestTime)) bestTime = row.final_time;
    }
    SEATS.forEach((s, i) => {
      const td = tr.children[i + 1];
      const row = cell[s];
      td.innerHTML = cellHTML(row, bestTime, filled.length > 1);
      td.dataset.rid = row ? row.id : '';
    });
  }

  function cellHTML(row, bestTime, hasRivals) {
    if (!row) return '<span class="cell none">—</span>';
    const cls = row.penalty === 'dnf' ? 'dnf' : row.penalty === '+2' ? 'plus' : 'ok';
    const txt = row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time);
    let winCls = '', title = '';
    if (hasRivals && bestTime != null && row.final_time === bestTime) {
      winCls = ' win';
      title = 'Fastest this round';
    }
    return `<span class="cell ${cls}${winCls}" title="${title}">${txt}</span>`;
  }

  $('#rowsBody').addEventListener('click', e => {
    const td = e.target.closest('td[data-rid]');
    if (!td || !td.dataset.rid) return;
    const row = state.solves.get(td.dataset.rid);
    if (row) openModal(row);
  });

  // ---------- Stats ----------
  function rendersStatsFor(seat) {
    return [...state.solves.values()]
      .filter(s => seatOf(s.player_id) === seat)
      .sort((a, b) => a.solve_number - b.solve_number);
  }

  function fillStatsCard(seat, st) {
    const f = v => v == null ? '—' : fmtMs(v);
    const fa = v => Stats.fmtAvg(v);
    const row = (k, v, hl) => `<div class="st-row${hl ? ' hl' : ''}"><span>${k}</span><b>${v}</b></div>`;
    $('#p' + seat + 'stats').innerHTML =
      row('Solves', st.count) + row('DNF', st.dnf) +
      row('Mean', f(st.mean)) + row('Best', f(st.best)) + row('Worst', f(st.worst)) +
      '<div class="st-cap">Current</div>' +
      row('Ao5', fa(st.ao5)) + row('Ao12', fa(st.ao12)) + row('Ao50', fa(st.ao50)) + row('Ao100', fa(st.ao100)) +
      '<div class="st-cap">Best</div>' +
      row('Best Ao5', fa(st.bao5), true) + row('Best Ao12', fa(st.bao12), true) +
      row('Best Ao50', fa(st.bao50), true) + row('Best Ao100', fa(st.bao100), true);
  }

  function renderStats() {
    const series = [];
    for (const seat of SEATS) {
      const list = rendersStatsFor(seat);
      const st = Stats.compute(list);
      fillStatsCard(seat, st);
      $('#p' + seat + 'best').textContent = st.best != null ? 'best ' + fmtMs(st.best) : '';
      series.push({
        name: 'P' + seat, color: getVar('--p' + seat),
        points: Stats.progression(list, 5).map(p => ({ x: p.x, y: isFinite(p.y) ? p.y : null }))
      });
    }
    Chart.draw($('#chart'), series);
    $('#solveCount').textContent = state.solves.size + ' solves · round ' + (state.round || 1);
  }

  function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
  }

  function updateLastLine(row) {
    const nm = row.player_id === SB.uid() ? state.me.name : (nameOfSeat(seatOf(row.player_id)) || 'Opponent');
    $('#lastLine').textContent = `Last: ${nm} — ${row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time)} (#${row.solve_number})`;
  }

  // ---------- Players ----------
  function renderPlayers() {
    state.opp = state.players.find(p => p.id !== SB.uid()) || null;
    for (const seat of SEATS) {
      const p = state.players.find(x => x.player_number === seat);
      const label = p ? p.name : (seat === state.me.player_number ? state.sess.name : 'Waiting…');
      $('#p' + seat + 'name').textContent = label;
      $('#p' + seat + 'name2').textContent = label;
      $('#lg' + seat).textContent = label;
    }
  }
  function nameOfSeat(seat) {
    const p = state.players.find(x => x.player_number === seat);
    return p ? p.name : null;
  }

  // ---------- Modal ----------
  function openModal(row) {
    state.modalOpen = true; state.modalId = row.id;
    fillModal(row);
    $('#modalOv').classList.remove('hidden');
  }
  function closeModal() {
    state.modalOpen = false; state.modalId = null;
    $('#modalOv').classList.add('hidden');
    resetDeleteBtn();
  }

  function fillModal(row) {
    const seat = seatOf(row.player_id);
    const own = row.player_id === SB.uid();
    $('#mTitle').textContent = 'Solve #' + row.solve_number;
    $('#mTime').textContent = row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time);
    const chip = $('#mStatus');
    chip.textContent = row.penalty === 'none' ? 'Normal' : row.penalty;
    chip.className = 'status-chip ' + (row.penalty === 'dnf' ? 'dnf' : row.penalty === '+2' ? 'plus' : 'ok');
    $('#mRaw').textContent = fmtMs(row.raw_time);
    $('#mFinal').textContent = row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time);
    $('#mPlayer').textContent = (own ? state.me.name : nameOfSeat(seat)) || 'Player ' + seat;
    $('#mCube').textContent = row.cube_type === '222' ? '2×2×2' : '3×3×3';
    $('#mDate').textContent = fmtDate(row.created_at);
    $('#mClock').textContent = fmtClock(row.created_at);
    $('#mScramble').textContent = row.scramble || '—';

    const cell = state.byRound.get(row.solve_number) || {};
    const others = SEATS.filter(s => s !== seat && cell[s]).map(s => cell[s]);
    const vs = $('#mVs');
    if (!others.length) {
      vs.textContent = "No one else has solved this round yet.";
      vs.className = 'm-vs';
    } else {
      const parts = others.map(o => {
        const nm = nameOfSeat(seatOf(o.player_id)) || 'Player ' + seatOf(o.player_id);
        if (row.final_time != null && o.final_time != null) {
          const d = row.final_time - o.final_time;
          return `${nm}: ${fmtSigned(d)}`;
        }
        return `${nm}: ${o.penalty === 'dnf' ? 'DNF' : fmtMs(o.final_time)}`;
      });
      const anyFaster = others.some(o => row.final_time != null && o.final_time != null && o.final_time < row.final_time);
      vs.textContent = parts.join(' · ');
      vs.className = 'm-vs ' + (row.final_time != null && !anyFaster ? 'good' : '');
    }

    const actions = $('#mActions');
    actions.classList.toggle('hidden', !own);
    if (own) {
      document.querySelectorAll('.penalty-seg button').forEach(b => {
        b.classList.toggle('active', b.dataset.p === row.penalty);
      });
      resetDeleteBtn();
    }
  }

  function resetDeleteBtn() {
    const b = $('#mDelete');
    b.textContent = 'Delete Solve';
    b.dataset.armed = '';
  }

  document.querySelectorAll('.penalty-seg button').forEach(b => {
    b.addEventListener('click', async () => {
      const row = state.solves.get(state.modalId);
      if (!row) return;
      const p = b.dataset.p;
      const fin = API.computeFinal(row.raw_time, p);
      applySolveUpdate({ ...row, penalty: p, final_time: fin });
      try { await API.updateSolvePenalty(row.id, p, fin); }
      catch (e) { console.error('[CubeDuel] Failed to update penalty:', e); toast('Update failed: ' + e.message, 'err'); }
    });
  });

  $('#mDelete').addEventListener('click', async () => {
    const b = $('#mDelete');
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'Confirm?';
      setTimeout(resetDeleteBtn, 3000);
      return;
    }
    const row = state.solves.get(state.modalId);
    if (!row) return;
    try {
      await API.deleteSolve(row.id);
      applyDelete(row);
      closeModal();
      toast('Solve deleted.', 'info');
    } catch (e) { console.error('[CubeDuel] Failed to delete solve:', e); toast(e.message, 'err'); }
  });

  $('#mClose').addEventListener('click', closeModal);
  $('#modalOv').addEventListener('click', e => { if (e.target === $('#modalOv')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.modalOpen) closeModal(); });

  // ---------- Actions ----------
  function setupActions() {
    $('#btnCopyCode').addEventListener('click', async () =>
      toast((await copyText(state.sess.code)) ? 'Code copied!' : 'Copy failed', 'ok'));
    $('#btnCopyScr').addEventListener('click', async () => {
      const s = state.scrambles.get(state.round);
      toast(s && (await copyText(s.scramble)) ? 'Scramble copied!' : 'Nothing to copy', 'ok');
    });
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#btnLeave').addEventListener('click', leaveRoom);
  }

  function exportCsv() {
    const rows = [['solve_number', 'player_number', 'name', 'cube_type', 'raw_ms', 'penalty', 'final_ms', 'scramble', 'created_at']];
    [...state.solves.values()]
      .sort((a, b) => a.solve_number - b.solve_number || seatOf(a.player_id) - seatOf(b.player_id))
      .forEach(s => rows.push([
        s.solve_number, seatOf(s.player_id),
        seatOf(s.player_id) === state.me.player_number ? state.me.name : (nameOfSeat(seatOf(s.player_id)) || ''),
        s.cube_type, s.raw_time, s.penalty, s.final_time ?? '', s.scramble, s.created_at
      ]));
    downloadCSV(`cubeduel-${state.sess.code}.csv`, rows);
  }

  async function leaveRoom() {
    if (!confirm('Leave this room?')) return;
    try {
      await API.leaveRoomCleanup(state.room.id);
    } catch (e) {
      console.error('[CubeDuel] leave_and_cleanup RPC failed, falling back:', e);
      try { await API.removePlayer(state.room.id); }
      catch (e2) { console.error('[CubeDuel] Fallback removePlayer failed:', e2); toast(e2.message, 'err'); }
    }
    if (dbChannel) SB.client.removeChannel(dbChannel);
    if (presChannel) SB.client.removeChannel(presChannel);
    goHome('You left the room.');
  }
})();
