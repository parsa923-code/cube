// Room page: realtime battle, timer integration, stats, modal
(function () {
    const $ = s => document.querySelector(s);
    const MAX_ROWS = 400;
  
    const state = {
      sess: null, room: null, me: null, opp: null, players: [],
      scrambles: new Map(),   // round -> scramble row
      solves: new Map(),      // id -> solve row
      byRound: new Map(),     // round -> {1: row|null, 2: row|null}
      seatById: new Map(),    // player uid -> seat (never shrinks, so old solves resolve)
      rounds: [],             // sorted round numbers shown in the table
      rowEls: new Map(),      // round -> <tr>
      round: 0, activeRound: 0,
      locked: false, modalOpen: false, modalId: null
    };
  
    let timer = null, dbChannel = null, presChannel = null;
  
    // ---------- boot ----------
    boot();
    async function boot() {
      try {
        const raw = sessionStorage.getItem('cd.session');
        if (!raw) return goHome('No active room — create or join one.');
        state.sess = JSON.parse(raw);
        document.title = `Room ${state.sess.code} — CubeDuel`;
        $('#roomCode').textContent = state.sess.code;
  
        await SB.ensureAuth();
        state.room = await API.findRoom(state.sess.code);
        if (!state.room) throw new Error('This room no longer exists.');
        $('#cubeBadge').textContent = state.room.cube_type === '222' ? '2×2×2' : '3×3×3';
  
        state.players = await API.getPlayers(state.room.id);
        state.players.forEach(p => state.seatById.set(p.id, p.player_number));
        state.me = state.players.find(p => p.id === SB.uid());
        if (!state.me) {
          sessionStorage.setItem('cd.prefill', state.sess.code);
          throw new Error('Your seat in this room was removed. Join again from the lobby.');
        }
  
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
  
        if (state.round === 0) await nextScramble(); // first scramble, race-safe
        $('#loading').classList.add('hidden');
      } catch (e) {
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
    
    // ---------- realtime ----------
    function setupRealtime() {
      const rid = state.room.id;
      dbChannel = SB.client.channel('cd-db-' + rid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'solves', filter: 'room_id=eq.' + rid }, p => {
            if (p.eventType === 'DELETE') applyDelete(p.old);
            else applySolve(p.new, p.eventType === 'INSERT');
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scrambles', filter: 'room_id=eq.' + rid }, p => {
          applyScramble(p.new);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'room_id=eq.' + rid }, () => {
          refreshPlayers();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms', filter: 'id=eq.' + rid }, () => {
          toast('Room was closed by its creator.', 'err');
          setTimeout(() => goHome(), 1500);
        })
        .subscribe();
  
      // presence: opponent online/offline
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
        if (!state.me) { toast('You were removed from the room.', 'err'); setTimeout(() => goHome(), 1200); return; }
        if (before === 2 && state.players.length === 1) toast('Your opponent left the room.', 'info');
        if (before === 1 && state.players.length === 2) toast('Your opponent joined — good luck!', 'ok');
        renderPlayers();
        // seats may have changed visually; rebuild cells
        for (const n of state.rounds) upsertRow(n);
      } catch (e) { toast(e.message, 'err'); }
    }
  
    function renderPresence(ps) {
      const entries = Object.values(ps || {}).flat();
      const oppEntry = entries.find(e => e.seat && e.seat !== state.me.player_number);
      const on = !!oppEntry;
      $('#oppDot').className = 'dot ' + (on ? 'on' : 'off');
      $('#oppStatus').textContent = on
        ? (oppEntry.name + ' · online')
        : (state.opp ? state.opp.name + ' · offline' : 'waiting for opponent…');
      const oppSeat = state.me.player_number === 1 ? 2 : 1;
      const oppDot = $('#p' + oppSeat + 'dot');
      if (oppDot) oppDot.className = 'dot ' + (on ? 'on' : 'off');
    }
  
    // ---------- scrambles ----------
    function applyScramble(row) {
      if (!row || state.scrambles.has(row.solve_number)) return;
      state.scrambles.set(row.solve_number, row);
      if (row.solve_number > state.round) {
        state.round = row.solve_number;
        renderScramble();
        toast('New scramble — round ' + row.solve_number, 'info');
      }
    }
  
    async function nextScramble() {
      try {
        const n = state.round + 1;
        const sc = ScrambleGen.generate(state.room.cube_type);
        const row = await API.addScramble(state.room.id, n, sc, state.room.cube_type);
        applyScramble(row);
      } catch (e) { toast('Next scramble failed: ' + e.message, 'err'); }
    }
  
    function renderScramble() {
      const s = state.scrambles.get(state.round);
      $('#scrambleText').textContent = s ? s.scramble : 'Generating…';
      $('#roundBadge').textContent = `SOLVE ${state.round || 1} / ∞`;
      $('#solveStamp').textContent = state.round ? 'Round #' + state.round : '';
    }
  
    // ---------- timer ----------
    function setupTimer() {
      timer = new CubeTimer({
        digits: $('#timerDigits'), pill: $('#timerPill'), deck: $('#timerDeck'),
        btn: $('#btnStartStop'), resetBtn: $('#btnReset'),
        isLocked: () => state.locked || state.modalOpen,
        onStart: () => { state.activeRound = state.round; $('#solveStamp').textContent = 'Solving round #' + state.activeRound; },
        onFinish: ({ rawMs, forced }) => recordSolve(rawMs, forced, state.activeRound || state.round)
      });
      $('#chkInspection').addEventListener('change', e => timer.setInspection(e.target.checked));
    }
     // optimistic
    async function recordSolve(rawMs, forced, round) {
        if (state.locked) return;
        state.locked = true;
        try {
          const n = round || state.round;
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
          applySolve(row, true);
          try {
            await API.insertSolve(row);
            toast(`Saved #${n}: ${row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time)}`, 'ok');
          } catch (e) {
            applyDelete(row); // rollback ردیف خوش‌بینانه
            toast(e.message, 'err');
          }
        } catch (e) {
          toast(e.message, 'err');
        } finally {
          state.locked = false;
          const ss = $('#solveStamp'); if (ss) ss.textContent = 'Round #' + state.round;
        }
      }
  
    // ---------- solves: index + table ----------
    function seatOf(pid) {
      if (pid === SB.uid()) return state.me.player_number;
      return state.seatById.get(pid) || (state.me.player_number === 1 ? 2 : 1);
    }
  
    function indexSolve(row) {
      let cell = state.byRound.get(row.solve_number);
      if (!cell) { cell = { 1: null, 2: null }; state.byRound.set(row.solve_number, cell); }
      cell[seatOf(row.player_id)] = row;
    }
  
    function applySolve(row, isNew) {
        state.solves.set(row.id, row);
        indexSolve(row);
        ensureRoundInList(row.solve_number);
        upsertRow(row.solve_number);
        renderStats();
        if (isNew) updateLastLine(row);
        $('#emptyNote').classList.add('hidden');
        if (state.modalOpen && state.modalId === row.id) fillModal(row);
        if (isNew) maybeAutoAdvance(row.solve_number);
      }
        
      // فقط وقتی هر دو بازیکن راند فعلی را ثبت کردند، راند بعد ساخته شود
      function maybeAutoAdvance(n) {
        if (n !== state.round) return;               // راند قبلاً جلو رفته
        const cell = state.byRound.get(n);
        if (!cell || !cell[1] || !cell[2]) return;   // هنوز هر دو حل نکرده‌اند
        if (state.scrambles.has(n + 1)) return;      // راند بعد موجود است
        nextScramble();
      }
  
    function applyDelete(row) {
      state.solves.delete(row.id);
      const cell = state.byRound.get(row.solve_number);
      if (cell) cell[seatOf(row.player_id)] = null;
      upsertRow(row.solve_number);
      renderStats();
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
      tr.innerHTML = '<td colspan="3" class="trunc">… earlier rounds hidden — export CSV for the full history</td>';
      $('#rowsBody').appendChild(tr);
    }
  
    function upsertRow(n) {
      let tr = state.rowEls.get(n);
      const body = $('#rowsBody');
      if (!tr) {
        tr = document.createElement('tr');
        tr.innerHTML = `<td class="c-n">${n}</td><td class="c-p p1"></td><td class="c-p p2"></td>`;
        state.rowEls.set(n, tr);
        // keep ascending order
        const nextN = state.rounds.find(r => r > n && state.rowEls.has(r));
        if (nextN) body.insertBefore(tr, state.rowEls.get(nextN));
        else body.appendChild(tr);
        // cap rendered rows
        if (state.rowEls.size > MAX_ROWS) {
          const oldest = state.rounds.find(r => state.rowEls.has(r));
          if (oldest != null) { state.rowEls.get(oldest).remove(); state.rowEls.delete(oldest); }
        }
      }
      const cell = state.byRound.get(n) || { 1: null, 2: null };
      const td1 = tr.children[1], td2 = tr.children[2];
      td1.innerHTML = cellHTML(cell[1], cell[2]); td1.dataset.rid = cell[1] ? cell[1].id : '';
      td2.innerHTML = cellHTML(cell[2], cell[1]); td2.dataset.rid = cell[2] ? cell[2].id : '';
    }
  
    function cellHTML(row, other) {
      if (!row) return '<span class="cell none">—</span>';
      const cls = row.penalty === 'dnf' ? 'dnf' : row.penalty === '+2' ? 'plus' : 'ok';
      const txt = row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time);
      let winCls = '', title = '';
      if (other && row.final_time != null && other.final_time != null) {
        const d = row.final_time - other.final_time;
        title = 'vs opponent: ' + fmtSigned(d);
        if (d < 0) winCls = ' win';
      }
      return `<span class="cell ${cls}${winCls}" title="${title}">${txt}</span>`;
    }
  
    // delegated click -> modal
    $('#rowsBody').addEventListener('click', e => {
      const td = e.target.closest('td[data-rid]');
      if (!td || !td.dataset.rid) return;
      const row = state.solves.get(td.dataset.rid);
      if (row) openModal(row);
    });
  
    // ---------- stats + chart ----------
    function rendersStatsFor(seat) {
      const list = [...state.solves.values()]
        .filter(s => seatOf(s.player_id) === seat)
        .sort((a, b) => a.solve_number - b.solve_number);
      return list;
    }
  
    function fillStatsCard(seat, st) {
      const f = v => v == null ? '—' : fmtMs(v);
      const fa = v => Stats.fmtAvg(v);
      const row = (k, v, hl) => `<div class="st-row${hl ? ' hl' : ''}"><span>${k}</span><b>${v}</b></div>`;
      $('#p' + seat + 'stats').innerHTML =
        row('Solves', st.count) + row('DNF', st.dnf) +
        row('Mean', f(st.mean)) + row('Best solve', f(st.best)) + row('Worst solve', f(st.worst)) +
        '<div class="st-cap">Current</div>' +
        row('Ao5', fa(st.ao5)) + row('Ao12', fa(st.ao12)) + row('Ao50', fa(st.ao50)) + row('Ao100', fa(st.ao100)) +
        '<div class="st-cap">Best ever</div>' +
        row('Best Ao5', fa(st.bao5), true) + row('Best Ao12', fa(st.bao12), true) +
        row('Best Ao50', fa(st.bao50), true) + row('Best Ao100', fa(st.bao100), true);
    }
  
    function renderStats() {
      const series = [];
      const colors = { 1: getVar('--p1'), 2: getVar('--p2') };
      for (const seat of [1, 2]) {
        const list = rendersStatsFor(seat);
        const st = Stats.compute(list);
        fillStatsCard(seat, st);
        $('#p' + seat + 'best').textContent = st.best != null ? 'best ' + fmtMs(st.best) : '';
        series.push({
          name: 'P' + seat, color: colors[seat],
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
      $('#lastLine').textContent = `Last solve: ${nm} — ${row.penalty === 'dnf' ? 'DNF' : fmtMs(row.final_time)} (#${row.solve_number})`;
    }
  
    // ---------- players / names ----------
    function renderPlayers() {
      state.opp = state.players.find(p => p.id !== SB.uid()) || null;
      for (const seat of [1, 2]) {
        const p = state.players.find(x => x.player_number === seat);
        const label = p ? p.name : (seat === state.me.player_number ? state.sess.name : 'Waiting… share the code');
        $('#p' + seat + 'name').textContent = label;
        $('#p' + seat + 'name2').textContent = label;
        $('#lg' + seat).textContent = label;
      }
    }
    function nameOfSeat(seat) {
      const p = state.players.find(x => x.player_number === seat);
      return p ? p.name : null;
    }
  
    // ---------- modal ----------
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
      const other = cell[seat === 1 ? 2 : 1];
      const vs = $('#mVs');
      if (other && row.final_time != null && other.final_time != null) {
        const d = row.final_time - other.final_time;
        vs.textContent = (d < 0 ? 'You were faster by ' : 'Opponent was faster by ') +
          (Math.abs(d) / 1000).toFixed(2) + 's';
        vs.className = 'm-vs ' + (d < 0 ? 'good' : 'bad');
      } else if (other) {
        vs.textContent = 'Opponent: ' + (other.penalty === 'dnf' ? 'DNF' : fmtMs(other.final_time));
        vs.className = 'm-vs';
      } else {
        vs.textContent = 'Opponent has not solved this round yet.';
        vs.className = 'm-vs';
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
      b.textContent = 'Delete solve';
      b.dataset.armed = '';
    }
  
    document.querySelectorAll('.penalty-seg button').forEach(b => {
      b.addEventListener('click', async () => {
        const row = state.solves.get(state.modalId);
        if (!row) return;
        const p = b.dataset.p;
        const fin = API.computeFinal(row.raw_time, p);
        applySolve({ ...row, penalty: p, final_time: fin }, false);
        try { await API.updateSolvePenalty(row.id, p, fin); }
        catch (e) { toast('Update failed: ' + e.message, 'err'); }
      });
    });
    
    $('#mDelete').addEventListener('click', async () => {
      const b = $('#mDelete');
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Click again to confirm';
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
      } catch (e) { toast(e.message, 'err'); }
    });
  
    $('#mClose').addEventListener('click', closeModal);
    $('#modalOv').addEventListener('click', e => { if (e.target === $('#modalOv')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.modalOpen) closeModal(); });
  
    // ---------- header actions ----------
    function setupActions() {
        $('#btnCopyCode').addEventListener('click', async () =>
          toast((await copyText(state.sess.code)) ? 'Room code copied!' : 'Copy failed', 'ok'));
        $('#btnCopyScr').addEventListener('click', async () => {
          const s = state.scrambles.get(state.round);
          toast(s && (await copyText(s.scramble)) ? 'Scramble copied!' : 'Nothing to copy', 'ok');
        });
        $('#btnCsv').addEventListener('click', exportCsv);
        $('#btnLeave').addEventListener('click', leaveRoom);
        setupManualEntry();
      }
    
      function setupManualEntry() {
        const inp = $('#manualTime');
        if (!inp) return;
        const submit = () => {
          const ms = parseManualTime(inp.value);
          if (ms == null || ms <= 0) { toast('Invalid time — e.g. type 1537 for 15.37', 'err'); return; }
          inp.value = '';
          inp.blur();
          recordSolve(ms, null, state.round);
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        const btn = $('#btnManualSave');
        if (btn) btn.addEventListener('click', submit);
      }
  
    function exportCsv() {
      const rows = [[
        'solve_number', 'player_number', 'name', 'cube_type',
        'raw_ms', 'penalty', 'final_ms', 'scramble', 'created_at'
      ]];
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
      if (!confirm('Leave this room? Your solves stay saved.')) return;
      try {
        await API.removePlayer(state.room.id);
        if (state.room.created_by === SB.uid()) {
          const left = await API.getPlayers(state.room.id);
          if (left.length === 0) await API.deleteRoom(state.room.id).catch(() => {});
        }
      } catch (e) { toast(e.message, 'err'); }
      if (dbChannel) SB.client.removeChannel(dbChannel);
      if (presChannel) SB.client.removeChannel(presChannel);
      goHome('You left the room.');
    }
  })();