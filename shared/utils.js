/**
 * Shared helpers used by both CubeTimer and CubeDuel.
 * Previously duplicated in js/util.js and duel/js/util.js — consolidated here
 * so a fix only has to be made in one place (see bug 5.1 in the audit).
 */
(function () {
  function fmtMs(ms) {
    if (ms == null || !isFinite(ms)) return 'DNF';
    const cs = Math.floor(ms / 10) % 100;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return (m > 0 ? m + ':' + ss : String(s)) + '.' + String(cs).padStart(2, '0');
  }

  function fmtSigned(ms) {
    return (ms >= 0 ? '+' : '−') + (Math.abs(ms) / 1000).toFixed(2) + 's';
  }

  function parseTimeInput(str) {
    // Accept: 12.34 | 1:23.45 | 1:23 | 12
    str = String(str).trim().replace(',', '.');
    if (!str) return null;
    let m = 0, s = 0, cs = 0;
    if (str.includes(':')) {
      const parts = str.split(':');
      if (parts.length === 2) {
        m = parseInt(parts[0], 10) || 0;
        const sec = parts[1].split('.');
        s = parseInt(sec[0], 10) || 0;
        if (sec[1]) cs = parseInt(sec[1].padEnd(2, '0').slice(0, 2), 10) || 0;
      } else return null;
    } else {
      const sec = str.split('.');
      s = parseInt(sec[0], 10) || 0;
      if (sec[1]) cs = parseInt(sec[1].padEnd(2, '0').slice(0, 2), 10) || 0;
    }
    if (isNaN(m) || isNaN(s) || isNaN(cs)) return null;
    return m * 60000 + s * 1000 + cs * 10;
  }

  function uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 3) | 8).toString(16);
        });
  }

  function toast(msg, type) {
    const wrap = document.getElementById('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }, 3200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function csvEscape(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Includes a UTF-8 BOM so older versions of Excel detect the encoding
  // correctly (see bug 5.4 — kept, since dropping it silently breaks
  // non-ASCII names/scrambles in Excel for some users).
  function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US');
    } catch {
      return iso;
    }
  }

  function fmtClock(iso) {
    try {
      return new Date(iso).toLocaleTimeString('en-US');
    } catch {
      return iso;
    }
  }

  // ---------- Shared theme handling (keeps Timer + Duel in sync — bug 2.4) ----------
  const THEME_KEY = 'cubeTimer.theme';

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('btnTheme');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function initTheme() {
    applyTheme(getTheme());
    const btn = document.getElementById('btnTheme');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
      });
    }
  }

  Object.assign(window, {
    fmtMs, fmtSigned, parseTimeInput, uuid, toast, copyText,
    downloadJSON, downloadCSV, fmtDate, fmtClock,
    initTheme, applyTheme, getTheme
  });
})();
