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
    } catch (e) {
      console.error('[CubeDuel] Failed to create room:', e);
      err(e.message);
      busy($('#btnCreate'), false);
    }
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
      if (!room) throw new Error('Room not found. Check the code.');
      let players = await API.getPlayers(room.id);
      let me = players.find(p => p.id === SB.uid());
      let seat;
      if (me) {
        seat = me.player_number; // rejoining after refresh / left-and-back
      } else {
        if (players.length >= 5) throw new Error('This room is full (5/5 players).');
        // assign lowest free seat 1..5
        const taken = new Set(players.map(p => p.player_number));
        seat = 1;
        while (taken.has(seat) && seat <= 5) seat++;
        if (seat > 5) throw new Error('This room is full (5/5 players).');
        try {
          await API.addPlayer(room.id, seat, nm);
        } catch (e) {
          // Catch unique / check constraint / race conflicts
          const msg = String(e.message || '');
          if (msg.includes('Conflict') || msg.includes('players_player_number_check') || msg.includes('check constraint') || msg.includes('duplicate')) {
            players = await API.getPlayers(room.id); // re-check after race
            me = players.find(p => p.id === SB.uid());
            if (me) {
              seat = me.player_number;
            } else if (players.length >= 5) {
              throw new Error('This room is full (5/5 players).');
            } else {
              const taken2 = new Set(players.map(p => p.player_number));
              seat = 1;
              while (taken2.has(seat) && seat <= 5) seat++;
              if (seat > 5) throw new Error('This room is full (5/5 players).');
              await API.addPlayer(room.id, seat, nm);
            }
          } else throw e;
        }
      }
      saveSession(room, seat, nm);
      goRoom();
    } catch (e) {
      console.error('[CubeDuel] Failed to join room:', e);
      err(e.message);
      busy($('#btnJoin'), false);
    }
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
  let demoInterval = null;
  function demoTimer() {
    const el = $('#demoTime'); if (!el) return;
    let t0 = performance.now();
    let target = 8000 + Math.random() * 6000;
    let pauseUntil = 0;
    stopDemoTimer(); // clear any previous interval before starting a new one
    demoInterval = setInterval(() => {
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
  function stopDemoTimer() {
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
  }
  // Stop as soon as the tab is hidden/navigated away from, not only on
  // beforeunload — avoids the interval quietly running in a backgrounded
  // tab and leaking memory/CPU over a long session (bug 1.8).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopDemoTimer(); else demoTimer();
  });
  window.addEventListener('pagehide', stopDemoTimer);
  window.addEventListener('beforeunload', stopDemoTimer);

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
  if (window.initTheme) initTheme();
  fillTicker();
  demoTimer();
})();
