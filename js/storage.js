window.Storage = (function () {
  const KEY = 'speedcube_sessions';
  function load() { try { const d = localStorage.getItem(KEY); return d ? JSON.parse(d) : { sessions: [], activeSessionId: null }; } catch { return { sessions: [], activeSessionId: null }; } }
  function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  
  function getActiveSession() {
    const data = load();
    if (!data.activeSessionId || !data.sessions.find(s => s.id === data.activeSessionId)) {
      if (data.sessions.length === 0) {
        const ns = { id: uuid(), name: 'جلسه پیش‌فرض', puzzle: '333', solves: [] };
        data.sessions.push(ns); data.activeSessionId = ns.id; save(data);
      } else { data.activeSessionId = data.sessions[0].id; save(data); }
    }
    return load();
  }
  function createSession(name) {
    const data = load(); const ns = { id: uuid(), name: name || 'جلسه جدید', puzzle: '333', solves: [] };
    data.sessions.push(ns); data.activeSessionId = ns.id; save(data); return ns;
  }
  function deleteSession(id) {
    const data = load(); data.sessions = data.sessions.filter(s => s.id !== id);
    if (data.activeSessionId === id) data.activeSessionId = data.sessions.length > 0 ? data.sessions[0].id : null;
    save(data);
  }
  function renameSession(id, newName) {
    const data = load(); const s = data.sessions.find(x => x.id === id);
    if (s) { s.name = newName; save(data); }
  }
  function addSolve(sessionId, solve) {
    const data = load(); const s = data.sessions.find(x => x.id === sessionId);
    if (s) { s.solves.push(solve); save(data); }
  }
  function updateSolve(sessionId, solveId, updates) {
    const data = load(); const s = data.sessions.find(x => x.id === sessionId);
    if (s) { const sol = s.solves.find(x => x.id === solveId); if (sol) Object.assign(sol, updates); save(data); }
  }
  function deleteSolve(sessionId, solveId) {
    const data = load(); const s = data.sessions.find(x => x.id === sessionId);
    if (s) { s.solves = s.solves.filter(x => x.id !== solveId); s.solves.forEach((x, i) => x.solve_number = i + 1); save(data); }
  }
  function setSessionPuzzle(sessionId, puzzle) {
    const data = load(); const s = data.sessions.find(x => x.id === sessionId);
    if (s) { s.puzzle = puzzle; save(data); }
  }
  function importSession(importedData) {
    const data = load();
    const ns = { id: uuid(), name: (importedData.name || 'وارد شده') + ' (بازیابی)', puzzle: importedData.puzzle || '333', solves: importedData.solves || [] };
    data.sessions.push(ns); data.activeSessionId = ns.id; save(data); return ns;
  }
  return { load, save, getActiveSession, createSession, deleteSession, renameSession, addSolve, updateSolve, deleteSolve, setSessionPuzzle, importSession };
})();
