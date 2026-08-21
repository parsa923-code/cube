// Speedcubing statistics with official average logic.
// Average of N: drop best & worst. >=2 DNFs in the window => average is DNF.
// Exactly 1 DNF counts as the (dropped) worst.
(function () {
  const INF = Infinity;

  function val(s) {
    if (s.penalty === 'dnf' || s.final_time == null) return INF;
    return s.final_time;
  }

  // vals: array of numbers / Infinity, length === N
  function avgWindow(vals) {
    let dnf = 0;
    for (const v of vals) if (v === INF) dnf++;
    if (dnf >= 2) return INF;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = sorted.slice(1, sorted.length - 1); // drop best & worst
    return Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);
  }

  function currentAvg(solves, N) {
    if (solves.length < N) return null;
    return avgWindow(solves.slice(-N).map(val));
  }

  function bestAvg(solves, N) {
    if (solves.length < N) return null;
    let best = null;
    for (let i = 0; i + N <= solves.length; i++) {
      const a = avgWindow(solves.slice(i, i + N).map(val));
      if (a === INF) continue;
      if (best === null || a < best) best = a;
    }
    return best === null ? INF : best; // all windows DNF => "DNF"
  }

  function fmtAvg(a) {
    if (a == null) return 'N/A';
    if (a === INF) return 'DNF';
    return fmtMs(a);
  }

  // solves must be sorted ascending by solve_number (attempt order)
  function compute(solves) {
    const vals = solves.map(val);
    const valid = vals.filter(v => v !== INF);
    const mean = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    return {
      count: solves.length,
      dnf: solves.length - valid.length,
      mean,
      best: valid.length ? Math.min(...valid) : null,
      worst: valid.length ? Math.max(...valid) : null,
      ao5: currentAvg(solves, 5), ao12: currentAvg(solves, 12),
      ao50: currentAvg(solves, 50), ao100: currentAvg(solves, 100),
      bao5: bestAvg(solves, 5), bao12: bestAvg(solves, 12),
      bao50: bestAvg(solves, 50), bao100: bestAvg(solves, 100)
    };
  }

  // Rolling AoN after each solve (for the chart). Infinity kept; caller maps it.
  function progression(solves, N) {
    const out = [];
    for (let i = N - 1; i < solves.length; i++) {
      out.push({ x: solves[i].solve_number, y: avgWindow(solves.slice(i - N + 1, i + 1).map(val)) });
    }
    return out.slice(-300);
  }

  window.Stats = { val, avgWindow, compute, progression, fmtAvg };
})();
