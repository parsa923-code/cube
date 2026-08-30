(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  let scramble = '';
  let timer = null;
  let locked = false;
  let modalSolveId = null;

  // ---------- Theme ----------
  // Uses the shared theme helper (shared/utils.js) so Timer and Duel stay
  // in sync and the toggle logic isn't duplicated in two places (bug 2.4 / 5.1).

  // ---------- Puzzle ----------
  function setPuzzle(id, skipScramble) {
    $$('.puzzle-btn').forEach(b => b.classList.toggle('active', b.dataset.p === id));
    const sess = Store.getActive();
    if (sess && sess.puzzle !== id) Store.setPuzzle(sess.id, id);
    if (!skipScramble) newScramble();
  }

  $$('.puzzle-btn').forEach(b => {
    b.addEventListener('click', () => setPuzzle(b.dataset.p));
  });

  // ---------- Scramble ----------
  function newScramble() {
    const sess = Store.getActive();
    scramble = ScrambleGen.generate(sess.puzzle);
    const el = $('#scrambleText');
    el.textContent = scramble;
    el.classList.remove('expanded');
    updateScrambleToggle();
  }

  function updateScrambleToggle() {
    const el = $('#scrambleText');
    const btn = $('#scrToggle');
    // Show toggle if text is long (overflow likely)
    const long = scramble.length > 90 || (el.scrollHeight > el.clientHeight + 4);
    btn.classList.toggle('show', long && !el.classList.contains('expanded'));
    if (el.classList.contains('expanded')) {
      btn.classList.add('show');
      btn.textContent = 'Show less';
    } else {
      btn.textContent = 'Show more';
    }
  }

  $('#scrToggle').addEventListener('click', () => {
    const el = $('#scrambleText');
    el.classList.toggle('expanded');
    updateScrambleToggle();
  });

  $('#btnNewScr').addEventListener('click', () => {
    newScramble();
    toast('New scramble generated', 'ok');
  });

  $('#btnCopyScr').addEventListener('click', async () => {
    toast((await copyText(scramble)) ? 'Scramble copied' : 'Copy failed', 'ok');
  });

  // ---------- Sessions UI ----------
  function renderSessions() {
    const list = Store.list();
    const active = Store.getActive();
    const wrap = $('#sessionList');
    wrap.innerHTML = '';
    list.forEach(s => {
      const div = document.createElement('div');
      div.className = 'session-item' + (s.id === active.id ? ' active' : '');
      div.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="s-name">${escapeHtml(s.name)}</div>
          <div class="s-meta">${ScrambleGen.label(s.puzzle)} · ${s.solves.length} solves</div>
        </div>
        <div class="session-actions">
          <button data-act="rename" title="Rename">✏️</button>
          <button data-act="del" title="Delete">🗑</button>
        </div>`;
      div.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'rename') {
          e.stopPropagation();
          promptRename(s.id, s.name);
          return;
        }
        if (act === 'del') {
          e.stopPropagation();
          if (list.length <= 1) {
            toast('At least one session is required', 'err');
            return;
          }
          if (confirm('Delete session "' + s.name + '"?')) {
            Store.remove(s.id);
            fullRefresh();
            toast('Session deleted', 'info');
          }
          return;
        }
        Store.setActive(s.id);
        fullRefresh();
      });
      wrap.appendChild(div);
    });
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function promptRename(id, current) {
    openPrompt('Rename session', current, name => {
      if (!name || !name.trim()) {
        toast('Name cannot be empty', 'err');
        return;
      }
      Store.rename(id, name.trim());
      renderSessions();
      toast('Name updated', 'ok');
    });
  }

  $('#btnNewSession').addEventListener('click', () => {
    openPrompt('New session name', 'Practice ' + new Date().toLocaleDateString('en-US'), name => {
      const sess = Store.getActive();
      Store.create(name.trim() || 'New Session', sess.puzzle);
      fullRefresh();
      toast('Session created', 'ok');
    });
  });

  // ---------- Import / Export ----------
  $('#btnExport').addEventListener('click', () => {
    const sess = Store.getActive();
    const data = Store.exportSession(sess.id);
    const safe = sess.name.replace(/[^\w\-]+/g, '_').slice(0, 40);
    downloadJSON(`cubetimer-${safe}.json`, data);
    toast('Exported', 'ok');
  });

  $('#btnExportCsv').addEventListener('click', () => {
    const sess = Store.getActive();
    const safe = sess.name.replace(/[^\w\-]+/g, '_').slice(0, 40);
    const rows = [['#', 'time_ms', 'penalty', 'final_ms', 'puzzle', 'scramble', 'created_at']];
    sess.solves.forEach(s => rows.push([
      s.n, s.rawMs, s.penalty, s.finalMs ?? '', s.puzzle, s.scramble, s.createdAt
    ]));
    downloadCSV(`cubetimer-${safe}.csv`, rows);
    toast('Exported as CSV', 'ok');
  });

  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      Store.importSession(obj);
      fullRefresh();
      toast('Session imported successfully', 'ok');
    } catch (err) {
      console.error('[CubeTimer Import Error]:', err);
      toast('Import error: ' + (err.message || 'unknown'), 'err');
    }
  });

  // ---------- Prompt modal ----------
  function openPrompt(title, value, onOk) {
    $('#promptTitle').textContent = title;
    $('#promptInput').value = value || '';
    $('#promptOv').classList.remove('hidden');
    $('#promptInput').focus();
    $('#promptInput').select();
    const ok = () => {
      const v = $('#promptInput').value;
      closePrompt();
      onOk(v);
    };
    $('#promptOk').onclick = ok;
    $('#promptInput').onkeydown = e => {
      if (e.key === 'Enter') ok();
      if (e.key === 'Escape') closePrompt();
    };
  }
  function closePrompt() {
    $('#promptOv').classList.add('hidden');
  }
  $('#promptCancel').addEventListener('click', closePrompt);
  $('#promptOv').addEventListener('click', e => {
    if (e.target === $('#promptOv')) closePrompt();
  });

  // ---------- Timer ----------
  function setupTimer() {
    timer = new CubeTimerCore({
      digits: $('#timerDigits'),
      pill: $('#timerPill'),
      deck: $('#timerDeck'),
      isLocked: () => locked || !$('#modalOv').classList.contains('hidden') || !$('#promptOv').classList.contains('hidden'),
      onStart: () => {},
      onFinish: onTimerFinish
    });
    $('#chkInspection').addEventListener('change', e => timer.setInspection(e.target.checked));
  }

  // Returns the best final time among a session's non-DNF solves, or null.
  function bestFinal(solves) {
    let best = null;
    for (const s of solves) {
      if (s.penalty === 'dnf' || s.finalMs == null) continue;
      if (best == null || s.finalMs < best) best = s.finalMs;
    }
    return best;
  }

  function onTimerFinish({ rawMs, forced }) {
    locked = true;
    try {
      const sess = Store.getActive();
      const prevBest = bestFinal(sess.solves);
      const penalty = forced || 'none';
      const raw = Math.round(rawMs);
      const finalMs = penalty === 'dnf' ? null : penalty === '+2' ? raw + 2000 : raw;
      const solve = {
        id: uuid(),
        n: sess.solves.length + 1,
        rawMs: raw,
        finalMs,
        penalty,
        scramble,
        puzzle: sess.puzzle,
        createdAt: new Date().toISOString()
      };
      Store.addSolve(solve);
      renderTimes();
      renderStats();
      renderSessions();
      newScramble();
      const label = penalty === 'dnf' ? 'DNF' : fmtMs(finalMs);
      const isPB = finalMs != null && prevBest != null && finalMs < prevBest;
      toast(isPB ? `🎉 New personal best: ${label}` : `Logged: ${label}`, 'ok');
    } finally {
      locked = false;
    }
  }

  // Manual entry
  $('#btnManual').addEventListener('click', () => {
    const input = $('#manualInput');
    const ms = parseTimeInput(input.value);
    if (ms == null || ms < 0) {
      toast('Invalid time (example: 12.34 or 1:23.45)', 'err');
      return;
    }
    locked = true;
    try {
      const sess = Store.getActive();
      const solve = {
        id: uuid(),
        n: sess.solves.length + 1,
        rawMs: ms,
        finalMs: ms,
        penalty: 'none',
        scramble,
        puzzle: sess.puzzle,
        createdAt: new Date().toISOString()
      };
      Store.addSolve(solve);
      input.value = '';
      renderTimes();
      renderStats();
      renderSessions();
      newScramble();
      toast('Manual time logged: ' + fmtMs(ms), 'ok');
    } finally {
      locked = false;
    }
  });
  $('#manualInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#btnManual').click();
  });

  // ---------- Times list ----------
  function renderTimes() {
    const sess = Store.getActive();
    const tbody = $('#timesBody');
    const empty = $('#timesEmpty');
    tbody.innerHTML = '';
    if (!sess.solves.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    // best-so-far up to each solve, to mark PBs.
    // Walk solves in attempt order and track position with a counter instead
    // of indexOf(s) — indexOf breaks once solves are deleted/reordered (bug 2.7).
    let runningBest = null;
    const pbIds = new Set();
    let position = 0;
    for (const s of sess.solves) {
      position++;
      if (s.penalty !== 'dnf' && s.finalMs != null) {
        if (runningBest == null || s.finalMs < runningBest) {
          runningBest = s.finalMs;
          if (position > 1) pbIds.add(s.id);
        }
      }
    }
    // newest first
    const list = [...sess.solves].reverse();
    list.forEach(s => {
      const tr = document.createElement('tr');
      const cls = s.penalty === 'dnf' ? 't-dnf' : s.penalty === '+2' ? 't-plus' : 't-ok';
      const txt = s.penalty === 'dnf' ? 'DNF' : fmtMs(s.finalMs);
      const pb = pbIds.has(s.id);
      if (pb) tr.classList.add('t-pb');
      tr.innerHTML = `
        <td class="t-num">${s.n}</td>
        <td class="${cls}">${txt}${pb ? '<span class="pb-badge">PB</span>' : ''}</td>
        <td style="color:var(--dim);font-size:.75rem">${fmtDate(s.createdAt)}</td>`;
      tr.addEventListener('click', () => openSolveModal(s));
      tbody.appendChild(tr);
    });
  }

  // ---------- Stats ----------
  function renderStats() {
    const sess = Store.getActive();
    const st = Stats.compute(sess.solves);
    const f = Stats.fmt;
    $('#stCount').textContent = st.count;
    $('#stBest').textContent = f(st.best);
    $('#stWorst').textContent = f(st.worst);
    $('#stMean').textContent = f(st.mean);
    $('#stAo5').textContent = f(st.ao5);
    $('#stAo12').textContent = f(st.ao12);
    $('#stAo25').textContent = f(st.ao25);
    $('#stAo50').textContent = f(st.ao50);
    $('#stAo100').textContent = f(st.ao100);
    $('#stBAo5').textContent = f(st.bao5);
    $('#stBAo12').textContent = f(st.bao12);
    drawChart(sess.solves);
  }

  function drawChart(solves) {
    const canvas = $('#aoChart');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 280;
    const h = canvas.clientHeight || 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pts = Stats.progression(solves, 5)
      .map(p => ({ x: p.x, y: isFinite(p.y) ? p.y : null }))
      .filter(p => p.y != null);
    if (!pts.length) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#5c7089';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('At least 5 solves needed for Ao5', w / 2, h / 2);
      return;
    }
    const padL = 42, padR = 10, padT = 10, padB = 22;
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    let minY = Math.min(...pts.map(p => p.y));
    let maxY = Math.max(...pts.map(p => p.y));
    if (minY === maxY) { minY -= 1000; maxY += 1000; }
    const X = x => maxX === minX
      ? padL + (w - padL - padR) / 2
      : padL + (x - minX) / (maxX - minX) * (w - padL - padR);
    const Y = y => padT + (1 - (y - minY) / (maxY - minY)) * (h - padT - padB);

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    const dim = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#5c7089';
    for (let i = 0; i <= 3; i++) {
      const y = padT + (i / 3) * (h - padT - padB);
      const val = maxY - (i / 3) * (maxY - minY);
      ctx.strokeStyle = 'rgba(39,57,82,.4)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillStyle = dim;
      ctx.fillText((val / 1000).toFixed(1), padL - 4, y + 3);
    }

    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = X(p.x), y = Y(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = pts[pts.length - 1];
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.arc(X(last.x), Y(last.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Solve modal ----------
  function openSolveModal(s) {
    modalSolveId = s.id;
    $('#mTitle').textContent = 'Solve #' + s.n;
    $('#mTime').textContent = s.penalty === 'dnf' ? 'DNF' : fmtMs(s.finalMs);
    const chip = $('#mChip');
    chip.textContent = s.penalty === 'none' ? 'Normal' : s.penalty;
    chip.className = 'chip ' + (s.penalty === 'dnf' ? 'dnf' : s.penalty === '+2' ? 'plus' : 'ok');
    $('#mRaw').textContent = fmtMs(s.rawMs);
    $('#mFinal').textContent = s.penalty === 'dnf' ? 'DNF' : fmtMs(s.finalMs);
    $('#mPuzzle').textContent = ScrambleGen.label(s.puzzle);
    $('#mDate').textContent = fmtDate(s.createdAt);
    $('#mClock').textContent = fmtClock(s.createdAt);
    $('#mScramble').textContent = s.scramble || '—';
    $$('.penalty-seg button').forEach(b => {
      b.classList.toggle('active', b.dataset.p === s.penalty);
      b.classList.remove('ok', 'plus', 'dnf');
      if (b.dataset.p === s.penalty) {
        b.classList.add(s.penalty === 'dnf' ? 'dnf' : s.penalty === '+2' ? 'plus' : 'ok');
      }
    });
    $('#modalOv').classList.remove('hidden');
  }

  function closeModal() {
    modalSolveId = null;
    $('#modalOv').classList.add('hidden');
  }

  $$('.penalty-seg button').forEach(b => {
    b.addEventListener('click', () => {
      if (!modalSolveId) return;
      const p = b.dataset.p;
      const sess = Store.getActive();
      const s = sess.solves.find(x => x.id === modalSolveId);
      if (!s) return;
      const finalMs = p === 'dnf' ? null : p === '+2' ? s.rawMs + 2000 : s.rawMs;
      Store.updateSolve(modalSolveId, { penalty: p, finalMs });
      openSolveModal({ ...s, penalty: p, finalMs });
      renderTimes();
      renderStats();
      renderSessions();
    });
  });

  $('#mDelete').addEventListener('click', () => {
    if (!modalSolveId) return;
    if (!confirm('Delete this solve?')) return;
    Store.deleteSolve(modalSolveId);
    closeModal();
    renderTimes();
    renderStats();
    renderSessions();
    toast('Solve deleted', 'info');
  });

  $('#mClose').addEventListener('click', closeModal);
  $('#modalOv').addEventListener('click', e => {
    if (e.target === $('#modalOv')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modalOv').classList.contains('hidden')) closeModal();
  });

  $('#btnClearSolves').addEventListener('click', () => {
    const sess = Store.getActive();
    if (!sess.solves.length) return;
    if (!confirm('Clear all solves in this session?')) return;
    Store.clearSolves(sess.id);
    fullRefresh();
    toast('Solves cleared', 'info');
  });

  // ---------- Full refresh ----------
  function fullRefresh() {
    const sess = Store.getActive();
    setPuzzle(sess.puzzle, true);
    newScramble();
    renderSessions();
    renderTimes();
    renderStats();
  }

  // ---------- Init ----------
  initTheme();
  Store.ensure();
  setupTimer();
  fullRefresh();
  window.addEventListener('resize', () => {
    const sess = Store.getActive();
    drawChart(sess.solves);
    updateScrambleToggle();
  });
})();
