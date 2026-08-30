// Demo Battle: plays entirely in the browser against a simulated
// "Practice Bot" opponent. No Supabase, no network calls, no account —
// this exists so Online Battle is still demonstrable/usable when the
// server is unreachable (see bug 1.6 in the audit).
(function () {
  const $ = s => document.querySelector(s);
  const CUBE_TYPE = '333';

  const state = {
    round: 1,
    scrambles: new Map(), // n -> scramble string
    solves: { you: [], bot: [] }, // { n, finalMs, rawMs, penalty }
    botTimer: null,
    locked: false
  };

  if (window.initTheme) initTheme();
  $('#cubeBadge').textContent = '3×3×3';

  function newScramble(n) {
    const sc = ScrambleGen.generate(CUBE_TYPE);
    state.scrambles.set(n, sc);
    return sc;
  }

  function renderScramble() {
    $('#scrambleText').textContent = state.scrambles.get(state.round) || 'Generating…';
    $('#roundBadge').textContent = `Solve ${state.round} / ∞`;
  }

  $('#btnCopyScr').addEventListener('click', async () => {
    const s = state.scrambles.get(state.round);
    toast(s && (await copyText(s)) ? 'Scramble copied!' : 'Nothing to copy', 'ok');
  });

  // ---------- Timer (you) ----------
  let timer = null;
  function setupTimer() {
    timer = new CubeTimer({
      digits: $('#timerDigits'),
      pill: $('#timerPill'),
      deck: $('#timerDeck'),
      isLocked: () => state.locked || hasSolved('you', state.round),
      onStart: () => { $('#solveStamp').textContent = 'Solving #' + state.round; },
      onFinish: onYouFinish
    });
    $('#chkInspection').addEventListener('change', e => timer.setInspection(e.target.checked));
  }

  function hasSolved(who, n) {
    return state.solves[who].some(s => s.n === n);
  }

  function computeFinal(rawMs, penalty) {
    if (penalty === 'dnf') return null;
    if (penalty === '+2') return rawMs + 2000;
    return rawMs;
  }

  function onYouFinish({ rawMs, forced }) {
    const n = state.round;
    const penalty = forced || 'none';
    const raw = Math.round(rawMs);
    const solve = { n, rawMs: raw, finalMs: computeFinal(raw, penalty), penalty, scramble: state.scrambles.get(n) };
    state.solves.you.push(solve);
    $('#solveStamp').textContent = 'Round #' + state.round;
    toast(`Logged #${n}: ${penalty === 'dnf' ? 'DNF' : fmtMs(solve.finalMs)}`, 'ok');
    renderAll();
    scheduleBotSolve(n);
    maybeAdvanceRound();
  }

  // ---------- Practice bot ----------
  // Roughly human-like: a base pace with random variance, and an
  // occasional +2/DNF so the demo doesn't feel scripted.
  function scheduleBotSolve(n) {
    if (hasSolved('bot', n)) return;
    clearTimeout(state.botTimer);
    const delay = 900 + Math.random() * 2600;
    state.botTimer = setTimeout(() => {
      const base = 11500 + Math.random() * 6000;
      const roll = Math.random();
      let penalty = 'none';
      if (roll < 0.05) penalty = 'dnf';
      else if (roll < 0.14) penalty = '+2';
      const raw = Math.round(base);
      const solve = { n, rawMs: raw, finalMs: computeFinal(raw, penalty), penalty, scramble: state.scrambles.get(n) };
      state.solves.bot.push(solve);
      renderAll();
      maybeAdvanceRound();
    }, delay);
  }

  function maybeAdvanceRound() {
    if (!hasSolved('you', state.round) || !hasSolved('bot', state.round)) return;
    const next = state.round + 1;
    if (!state.scrambles.has(next)) newScramble(next);
    state.round = next;
    renderScramble();
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderTable();
    renderStats();
  }

  function renderTable() {
    const rounds = new Set([...state.solves.you.map(s => s.n), ...state.solves.bot.map(s => s.n)]);
    const sorted = [...rounds].sort((a, b) => a - b);
    const body = $('#rowsBody');
    body.innerHTML = '';
    if (!sorted.length) {
      $('#emptyNote').classList.remove('hidden');
    } else {
      $('#emptyNote').classList.add('hidden');
    }
    sorted.forEach(n => {
      const you = state.solves.you.find(s => s.n === n);
      const bot = state.solves.bot.find(s => s.n === n);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="c-n">${n}</td><td class="c-p p1">${cellHTML(you, bot)}</td><td class="c-p p2">${cellHTML(bot, you)}</td>`;
      body.appendChild(tr);
    });
    const last = state.solves.you[state.solves.you.length - 1] || state.solves.bot[state.solves.bot.length - 1];
    $('#lastLine').textContent = last ? `Last: #${last.n} — ${last.penalty === 'dnf' ? 'DNF' : fmtMs(last.finalMs)}` : 'Last: —';
    $('#solveCount').textContent = (state.solves.you.length + state.solves.bot.length) + ' solves · round ' + state.round;
  }

  function cellHTML(row, rival) {
    if (!row) return '<span class="cell none">—</span>';
    const cls = row.penalty === 'dnf' ? 'dnf' : row.penalty === '+2' ? 'plus' : 'ok';
    const txt = row.penalty === 'dnf' ? 'DNF' : fmtMs(row.finalMs);
    const winning = rival && row.finalMs != null && (rival.finalMs == null || row.finalMs < rival.finalMs);
    return `<span class="cell ${cls}${winning ? ' win' : ''}">${txt}</span>`;
  }

  function toStatRows(list) {
    return list
      .slice()
      .sort((a, b) => a.n - b.n)
      .map(s => ({ solve_number: s.n, final_time: s.finalMs, penalty: s.penalty }));
  }

  function fillStatsCard(elId, list) {
    const rows = toStatRows(list);
    const st = Stats.compute(rows);
    const f = v => v == null ? '—' : fmtMs(v);
    const fa = v => Stats.fmtAvg(v);
    const row = (k, v, hl) => `<div class="st-row${hl ? ' hl' : ''}"><span>${k}</span><b>${v}</b></div>`;
    $(elId).innerHTML =
      row('Solves', st.count) + row('DNF', st.dnf) +
      row('Mean', f(st.mean)) + row('Best', f(st.best)) + row('Worst', f(st.worst)) +
      '<div class="st-cap">Current</div>' +
      row('Ao5', fa(st.ao5)) + row('Ao12', fa(st.ao12)) +
      '<div class="st-cap">Best</div>' +
      row('Best Ao5', fa(st.bao5), true) + row('Best Ao12', fa(st.bao12), true);
    return rows;
  }

  function renderStats() {
    const youRows = fillStatsCard('#p1stats', state.solves.you);
    const botRows = fillStatsCard('#p2stats', state.solves.bot);
    Chart.draw($('#chart'), [
      { name: 'You', color: getVar('--p1'), points: Stats.progression(youRows, 5).map(p => ({ x: p.x, y: isFinite(p.y) ? p.y : null })) },
      { name: 'Bot', color: getVar('--p2'), points: Stats.progression(botRows, 5).map(p => ({ x: p.x, y: isFinite(p.y) ? p.y : null })) }
    ]);
  }

  function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  $('#btnCsv').addEventListener('click', () => {
    const rows = [['solve_number', 'player', 'raw_ms', 'penalty', 'final_ms', 'scramble']];
    ['you', 'bot'].forEach(who => {
      state.solves[who].forEach(s => rows.push([s.n, who === 'you' ? 'You' : 'Practice Bot', s.rawMs, s.penalty, s.finalMs ?? '', s.scramble]));
    });
    downloadCSV('cubeduel-demo.csv', rows);
  });

  // ---------- Init ----------
  newScramble(1);
  renderScramble();
  setupTimer();
  renderAll();
})();
