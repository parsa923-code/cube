// Small shared helpers
(function () {
  function fmtMs(ms) {
    if (ms == null || !isFinite(ms)) return 'DNF';
    const cs = Math.floor(ms / 10) % 100;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return (m > 0 ? m + ':' + ss : String(s)) + '.' + String(cs).padStart(2, '0');
  }
  function fmtSigned(ms) { return (ms >= 0 ? '+' : '−') + (Math.abs(ms) / 1000).toFixed(2) + 's'; }
  function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-CA'); }
  function fmtClock(iso) { return new Date(iso).toLocaleTimeString('en-GB'); }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    })); }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  function toast(msg, type) {
    const wrap = document.getElementById('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3500);
  }

  function downloadCSV(filename, rows) {
    const q = s => '"' + String(s ?? '').replaceAll('"', '""') + '"';
    const csv = rows.map(r => r.map(q).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  Object.assign(window, { fmtMs, fmtSigned, fmtDate, fmtClock, uuid, copyText, toast, downloadCSV });
})();
