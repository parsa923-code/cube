// Lobby: create / join rooms
(function () {
    const $ = s => document.querySelector(s);
    const errBox = $('#errBox');
  
    function err(msg) { errBox.textContent = msg; errBox.classList.add('show'); }
    function clearErr() { errBox.textContent = ''; errBox.classList.remove('show'); }
    function busy(btn, on) { btn.disabled = on; btn.dataset.busy = on ? '1' : ''; }
    const name = () => $('#inpName').value.trim();
    const code = () => $('#inpCode').value.trim().toUpperCase();
    const cubeType = () => document.querySelector('input[name="cube"]:checked').value;
  
    function saveSession(room, seat, nm) {
      sessionStorage.setItem('cd.session', JSON.stringify({
        code: room.room_code, roomId: room.id, cubeType: room.cube_type,
        seat, name: nm, playerId: SB.uid()
      }));
    }
    function goRoom() { location.href = 'room.html'; }
  
    async function createRoom() {
      clearErr();
      const nm = name();
      if (!nm) return err('Please enter your name first.');
      localStorage.setItem('cd.name', nm);
      busy($('#btnCreate'), true);
      try {
        await SB.ensureAuth();
        let room, tries = 0;
        do {
          room = await API.createRoom(API.genCode(), cubeType()).catch(e => {
            if (String(e.message).includes('Conflict') && ++tries < 5) return null;
            throw e;
          });
        } while (!room);
        try {
          await API.addPlayer(room.id, 1, nm);
        } catch (e) {
          await API.deleteRoom(room.id).catch(() => {});
          throw e;
        }
        saveSession(room, 1, nm);
        goRoom();
      } catch (e) { err(e.message); busy($('#btnCreate'), false); }
    }
  
    async function joinRoom() {
      clearErr();
      const nm = name();
      if (!nm) return err('Please enter your name first.');
      const c = code();
      if (!/^[A-Z2-9]{5,8}$/.test(c)) return err('Room code looks invalid (letters & digits only).');
      localStorage.setItem('cd.name', nm);
      busy($('#btnJoin'), true);
      try {
        await SB.ensureAuth();
        const room = await API.findRoom(c);
        if (!room) throw new Error('Room not found. Check the code with your opponent.');
        let players = await API.getPlayers(room.id);
        let me = players.find(p => p.id === SB.uid());
        let seat;
        if (me) {
          seat = me.player_number; // rejoining after refresh / left-and-back
        } else {
          if (players.length >= 2) throw new Error('This room is full (2/2 players).');
          seat = players.some(p => p.player_number === 1) ? 2 : 1;
          try {
            await API.addPlayer(room.id, seat, nm);
          } catch (e) {
            if (String(e.message).includes('Conflict')) {
              players = await API.getPlayers(room.id); // seat race — re-check
              me = players.find(p => p.id === SB.uid());
              if (me) seat = me.player_number;
              else if (players.length >= 2) throw new Error('This room is full (2/2 players).');
              else {
                seat = players.some(p => p.player_number === 1) ? 2 : 1;
                await API.addPlayer(room.id, seat, nm);
              }
            } else throw e;
          }
        }
        saveSession(room, seat, nm);
        goRoom();
      } catch (e) { err(e.message); busy($('#btnJoin'), false); }
    }
  
    // decorative scramble ticker
    function fillTicker() {
      const t = $('#ticker'); if (!t) return;
      let html = '';
      for (let i = 0; i < 6; i++)
        html += `<span class="tk">${ScrambleGen.generate(i % 2 ? '222' : '333')}</span><span class="tk-sep">✦</span>`;
      t.innerHTML = html + html; // duplicated for a seamless loop
    }
  
    // tiny self-running demo timer in the entry panel
    function demoTimer() {
      const el = $('#demoTime'); if (!el) return;
      let t0 = performance.now();
      let target = 8000 + Math.random() * 6000;
      let pauseUntil = 0;
      setInterval(() => {
        const now = performance.now();
        if (now < pauseUntil) { el.textContent = '0.00'; return; }
        if (!t0) t0 = now;
        const e = now - t0;
        if (e >= target) {
          t0 = 0; target = 8000 + Math.random() * 6000;
          pauseUntil = now + 1500; el.textContent = '0.00'; return;
        }
        el.textContent = (e / 1000).toFixed(2);
      }, 50);
    }
  
    // init
    const savedName = localStorage.getItem('cd.name');
    if (savedName) $('#inpName').value = savedName;
    const prefill = sessionStorage.getItem('cd.prefill');
    if (prefill) { $('#inpCode').value = prefill; sessionStorage.removeItem('cd.prefill'); }
    const msg = sessionStorage.getItem('cd.msg');
    if (msg) { toast(msg, 'info'); sessionStorage.removeItem('cd.msg'); }
  
    $('#inpCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
    $('#btnCreate').addEventListener('click', createRoom);
    $('#btnJoin').addEventListener('click', joinRoom);
    $('#inpCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    fillTicker();
    demoTimer();
  })();
(function () {
  let currentSession = null, timer = null, currentScramble = '';

  function init() {
    const data = Storage.getActiveSession();
    currentSession = data.sessions.find(s => s.id === data.activeSessionId) || data.sessions[0];
    renderSessionSelect(); renderPuzzleSelect(); generateScramble(); renderSolves(); renderStats(); setupTimer(); setupEventListeners();
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  function renderSessionSelect() {
    const data = Storage.load(); const sel = $('#sessionSelect'); sel.innerHTML = '';
    data.sessions.forEach(s => {
      const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name;
      if (s.id === currentSession.id) opt.selected = true; sel.appendChild(opt);
    });
  }
  function renderPuzzleSelect() { $('#puzzleSelect').value = currentSession.puzzle || '333'; }
  
  function generateScramble() {
    const puzzle = $('#puzzleSelect').value;
    currentScramble = ScrambleGen.generate(puzzle);
    const el = $('#scrambleText'); el.textContent = currentScramble; el.classList.remove('expanded');
    $('#btnExpandScramble').classList.toggle('hidden', currentScramble.length <= 60);
    $('#btnExpandScramble').textContent = 'نمایش بیشتر';
  }

  function setupTimer() {
    timer = new CubeTimer({
      digits: $('#timerDigits'), pill: $('#timerPill'), deck: $('#timerDeck'), isLocked: () => false,
      onStart: () => { $('#timerPill').textContent = 'در حال حل...'; },
      onFinish: ({ rawMs, forced }) => { saveSolve(rawMs, forced); }
    });
    timer.setInspection($('#chkInspection').checked);
  }

  function saveSolve(rawMs, forced) {
    const puzzle = $('#puzzleSelect').value;
    const penalty = forced || 'none';
    const final_time = penalty === 'dnf' ? null : (penalty === '+2' ? rawMs + 2000 : rawMs);
    const solve = { id: uuid(), solve_number: currentSession.solves.length + 1, time: rawMs, final_time, penalty, scramble: currentScramble, puzzle_type: puzzle, date: new Date().toISOString() };
    Storage.addSolve(currentSession.id, solve); currentSession.solves.push(solve);
    renderSolves(); renderStats(); generateScramble();
    toast(`حل ذخیره شد: ${penalty === 'dnf' ? 'DNF' : fmtMs(final_time)}`, 'ok');
  }

  function renderSolves() {
    const list = $('#solvesList'); list.innerHTML = '';
    const solves = [...currentSession.solves].sort((a, b) => b.solve_number - a.solve_number);
    $('#solveCount').textContent = `${solves.length} حل`;
    solves.forEach(s => {
      const div = document.createElement('div'); div.className = 'solve-item'; div.dataset.id = s.id;
      let timeClass = '', timeText = fmtMs(s.final_time);
      if (s.penalty === 'dnf') { timeClass = 'dnf'; timeText = 'DNF'; }
      else if (s.penalty === '+2') { timeClass = 'plus'; }
      div.innerHTML = `<span class="solve-num">#${s.solve_number}</span><span class="solve-time ${timeClass}">${timeText}</span>`;
      div.addEventListener('click', () => openModal(s)); list.appendChild(div);
    });
  }

  function renderStats() {
    const solves = [...currentSession.solves].sort((a, b) => a.solve_number - b.solve_number);
    const st = Stats.compute(solves);
    $('#statsGrid').innerHTML = `
      <div class="stat-item"><div class="stat-label">تعداد</div><div class="stat-value">${st.count}</div></div>
      <div class="stat-item"><div class="stat-label">DNF</div><div class="stat-value">${st.dnf}</div></div>
      <div class="stat-item"><div class="stat-label">میانگین</div><div class="stat-value">${st.mean ? fmtMs(st.mean) : '—'}</div></div>
      <div class="stat-item"><div class="stat-label">بهترین</div><div class="stat-value">${st.best ? fmtMs(st.best) : '—'}</div></div>
      <div class="stat-item"><div class="stat-label">Ao5</div><div class="stat-value">${Stats.fmtAvg(st.ao5)}</div></div>
      <div class="stat-item"><div class="stat-label">Ao12</div><div class="stat-value">${Stats.fmtAvg(st.ao12)}</div></div>
      <div class="stat-item"><div class="stat-label">Ao25</div><div class="stat-value">${Stats.fmtAvg(st.ao25)}</div></div>
      <div class="stat-item"><div class="stat-label">Ao50</div><div class="stat-value">${Stats.fmtAvg(st.ao50)}</div></div>
      <div class="stat-item"><div class="stat-label">Ao100</div><div class="stat-value">${Stats.fmtAvg(st.ao100)}</div></div>
    `;
  }

  function openModal(solve) {
    $('#modalOv').classList.remove('hidden');
    $('#mTitle').textContent = `حل شماره ${solve.solve_number}`;
    $('#mTime').textContent = solve.penalty === 'dnf' ? 'DNF' : fmtMs(solve.final_time);
    const chip = $('#mStatus'); chip.textContent = solve.penalty === 'none' ? 'عادی' : (solve.penalty === '+2' ? '+2' : 'DNF');
    chip.className = 'status-chip ' + (solve.penalty === 'none' ? 'ok' : (solve.penalty === '+2' ? 'plus' : 'dnf'));
    $('#mRaw').textContent = fmtMs(solve.time); $('#mFinal').textContent = chip.textContent === 'DNF' ? 'DNF' : fmtMs(solve.final_time);
    $('#mPenalty').textContent = chip.textContent; $('#mSolveNum').textContent = solve.solve_number;
    $('#mDate').textContent = fmtDate(solve.date); $('#mClock').textContent = fmtClock(solve.date);
    $('#mScramble').textContent = solve.scramble;
    document.querySelectorAll('.penalty-seg button').forEach(b => {
      b.classList.toggle('active', b.dataset.p === solve.penalty);
      b.onclick = () => updatePenalty(solve.id, b.dataset.p);
    });
    $('#mDelete').onclick = () => {
      if (confirm('آیا از حذف این حل اطمینان دارید؟')) {
        Storage.deleteSolve(currentSession.id, solve.id);
        currentSession.solves = currentSession.solves.filter(s => s.id !== solve.id);
        closeModal(); renderSolves(); renderStats(); toast('حل حذف شد', 'info');
      }
    };
  }

  function updatePenalty(solveId, newPenalty) {
    const solve = currentSession.solves.find(s => s.id === solveId); if (!solve) return;
    const newFinal = newPenalty === 'dnf' ? null : (newPenalty === '+2' ? solve.time + 2000 : solve.time);
    Storage.updateSolve(currentSession.id, solveId, { penalty: newPenalty, final_time: newFinal });
    solve.penalty = newPenalty; solve.final_time = newFinal;
    openModal(solve); renderSolves(); renderStats();
  }

  function closeModal() { $('#modalOv').classList.add('hidden'); }

  function setupEventListeners() {
    $('#sessionSelect').addEventListener('change', e => {
      const data = Storage.load(); data.activeSessionId = e.target.value; Storage.save(data);
      currentSession = data.sessions.find(s => s.id === e.target.value);
      renderPuzzleSelect(); generateScramble(); renderSolves(); renderStats();
    });
    $('#btnNewSession').addEventListener('click', () => {
      const name = prompt('نام جلسه جدید:');
      if (name) { currentSession = Storage.createSession(name); renderSessionSelect(); renderPuzzleSelect(); generateScramble(); renderSolves(); renderStats(); toast('جلسه جدید ایجاد شد', 'ok'); }
    });
    $('#btnRenameSession').addEventListener('click', () => {
      const name = prompt('نام جدید جلسه:', currentSession.name);
      if (name && name !== currentSession.name) { Storage.renameSession(currentSession.id, name); currentSession.name = name; renderSessionSelect(); toast('نام جلسه تغییر کرد', 'ok'); }
    });
    $('#btnDeleteSession').addEventListener('click', () => {
      if (confirm('آیا از حذف این جلسه و تمام رکوردهای آن اطمینان دارید؟')) {
        Storage.deleteSession(currentSession.id);
        const data = Storage.getActiveSession(); currentSession = data.sessions.find(s => s.id === data.activeSessionId) || data.sessions[0];
        renderSessionSelect(); renderPuzzleSelect(); generateScramble(); renderSolves(); renderStats(); toast('جلسه حذف شد', 'info');
      }
    });
    $('#puzzleSelect').addEventListener('change', e => { Storage.setSessionPuzzle(currentSession.id, e.target.value); currentSession.puzzle = e.target.value; generateScramble(); });
    $('#btnNewScramble').addEventListener('click', generateScramble);
    $('#btnExpandScramble').addEventListener('click', () => {
      $('#scrambleText').classList.toggle('expanded');
      $('#btnExpandScramble').textContent = $('#scrambleText').classList.contains('expanded') ? 'نمایش کمتر' : 'نمایش بیشتر';
    });
    $('#chkInspection').addEventListener('change', e => { timer.setInspection(e.target.checked); });
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next); localStorage.setItem('theme', next);
    });
    $('#btnExport').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ name: currentSession.name, puzzle: currentSession.puzzle, solves: currentSession.solves }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `session-${currentSession.name}.json`; a.click(); toast('خروجی با موفقیت ذخیره شد', 'ok');
    });
    $('#btnImport').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.solves && Array.isArray(data.solves)) {
            Storage.importSession(data);
            const loaded = Storage.getActiveSession(); currentSession = loaded.sessions.find(s => s.id === loaded.activeSessionId);
            renderSessionSelect(); renderPuzzleSelect(); generateScramble(); renderSolves(); renderStats(); toast('جلسه با موفقیت وارد شد', 'ok');
          } else { toast('فایل نامعتبر است', 'err'); }
        } catch { toast('خطا در خواندن فایل', 'err'); }
      };
      reader.readAsText(file); e.target.value = '';
    });
    $('#mClose').addEventListener('click', closeModal);
    $('#modalOv').addEventListener('click', e => { if (e.target === $('#modalOv')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
