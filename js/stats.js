/**
 * Official-style speedcubing averages.
 * AoN: drop best & worst. ≥2 DNFs in window → DNF.
 * Exactly 1 DNF counts as the dropped worst.
 */
(function () {
  const INF = Infinity;

  function val(s) {
    if (!s || s.penalty === 'dnf' || s.finalMs == null) return INF;
    return s.finalMs;
  }

  function avgWindow(vals) {
    let dnf = 0;
    for (const v of vals) if (v === INF) dnf++;
    if (dnf >= 2) return INF;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = sorted.slice(1, -1);
    if (!mid.length) return INF;
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
    return best === null ? INF : best;
  }

  function fmt(ms) {
    if (ms == null) return '—';
    if (ms === INF) return 'DNF';
    return window.fmtMs ? window.fmtMs(ms) : (ms / 1000).toFixed(2);
  }

  function compute(solves) {
    const sorted = [...solves].sort((a, b) => a.n - b.n);
    const vals = sorted.map(val);
    const valid = vals.filter(v => v !== INF);
    const mean = valid.length
      ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
      : null;
    return {
      count: sorted.length,
      dnf: sorted.length - valid.length,
      mean,
      best: valid.length ? Math.min(...valid) : null,
      worst: valid.length ? Math.max(...valid) : null,
      ao5: currentAvg(sorted, 5),
      ao12: currentAvg(sorted, 12),
      ao25: currentAvg(sorted, 25),
      ao50: currentAvg(sorted, 50),
      ao100: currentAvg(sorted, 100),
      bao5: bestAvg(sorted, 5),
      bao12: bestAvg(sorted, 12),
      bao25: bestAvg(sorted, 25),
      bao50: bestAvg(sorted, 50),
      bao100: bestAvg(sorted, 100)
    };
  }

  function progression(solves, N) {
    const sorted = [...solves].sort((a, b) => a.n - b.n);
    const out = [];
    for (let i = N - 1; i < sorted.length; i++) {
      out.push({
        x: sorted[i].n,
        y: avgWindow(sorted.slice(i - N + 1, i + 1).map(val))
      });
    }
    return out.slice(-200);
  }

  window.Stats = { val, avgWindow, compute, progression, fmt };
})();
