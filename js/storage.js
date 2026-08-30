/**
 * Session + solve persistence via localStorage.
 * Structure:
 * {
 *   version: 1,
 *   activeId: string,
 *   sessions: [{ id, name, puzzle, createdAt, solves: [...] }]
 * }
 */
(function () {
  const KEY = 'cubeTimer.v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.sessions)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[CubeTimer Storage Error]:', e);
      if (e && e.name === 'QuotaExceededError') {
        if (window.toast) window.toast('Browser storage is full. Please delete old solves or export a session.', 'err');
      } else if (window.toast) {
        window.toast('Could not save to local storage.', 'err');
      }
      // Don't rethrow — a storage failure should never crash the timer.
    }
  }

  function defaultSession() {
    return {
      id: uuid(),
      name: 'Default Session',
      puzzle: '333',
      createdAt: new Date().toISOString(),
      solves: []
    };
  }

  function ensure() {
    let data = load();
    if (!data || !data.sessions.length) {
      const s = defaultSession();
      data = { version: 1, activeId: s.id, sessions: [s] };
      save(data);
    }
    if (!data.sessions.find(s => s.id === data.activeId)) {
      data.activeId = data.sessions[0].id;
      save(data);
    }
    return data;
  }

  function getActive() {
    const data = ensure();
    return data.sessions.find(s => s.id === data.activeId);
  }

  function setActive(id) {
    const data = ensure();
    if (!data.sessions.find(s => s.id === id)) return;
    data.activeId = id;
    save(data);
  }

  function list() {
    return ensure().sessions;
  }

  function create(name, puzzle) {
    const data = ensure();
    const s = {
      id: uuid(),
      name: name || 'New Session',
      puzzle: puzzle || '333',
      createdAt: new Date().toISOString(),
      solves: []
    };
    data.sessions.push(s);
    data.activeId = s.id;
    save(data);
    return s;
  }

  function rename(id, name) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === id);
    if (!s) return;
    s.name = name;
    save(data);
  }

  function remove(id) {
    const data = ensure();
    if (data.sessions.length <= 1) return false;
    data.sessions = data.sessions.filter(s => s.id !== id);
    if (data.activeId === id) data.activeId = data.sessions[0].id;
    save(data);
    return true;
  }

  function setPuzzle(id, puzzle) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === id);
    if (!s) return;
    s.puzzle = puzzle;
    save(data);
  }

  function addSolve(solve) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === data.activeId);
    if (!s) return;
    s.solves.push(solve);
    save(data);
  }

  function updateSolve(solveId, patch) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === data.activeId);
    if (!s) return;
    const idx = s.solves.findIndex(x => x.id === solveId);
    if (idx < 0) return;
    Object.assign(s.solves[idx], patch);
    save(data);
  }

  function deleteSolve(solveId) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === data.activeId);
    if (!s) return;
    s.solves = s.solves.filter(x => x.id !== solveId);
    // renumber
    s.solves.forEach((sol, i) => { sol.n = i + 1; });
    save(data);
  }

  function exportSession(id) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === id);
    if (!s) return null;
    return {
      format: 'cubeTimer-session',
      version: 1,
      exportedAt: new Date().toISOString(),
      session: JSON.parse(JSON.stringify(s))
    };
  }

  function importSession(obj) {
    if (!obj || (obj.format !== 'cubeTimer-session' && !obj.session && !obj.solves)) {
      throw new Error('Invalid file format');
    }
    let sess;
    if (obj.session) {
      sess = obj.session;
    } else if (Array.isArray(obj.solves)) {
      sess = {
        id: uuid(),
        name: obj.name || 'Imported',
        puzzle: obj.puzzle || '333',
        createdAt: obj.createdAt || new Date().toISOString(),
        solves: obj.solves
      };
    } else {
      throw new Error('No data found to import');
    }
    sess.id = uuid(); // always new id
    if (!sess.name) sess.name = 'Imported';
    if (!Array.isArray(sess.solves)) sess.solves = [];
    sess.solves.forEach((sol, i) => {
      if (!sol.id) sol.id = uuid();
      if (!sol.n) sol.n = i + 1;
      if (sol.finalMs === undefined && sol.rawMs != null) {
        sol.finalMs = sol.penalty === 'dnf' ? null
          : sol.penalty === '+2' ? sol.rawMs + 2000 : sol.rawMs;
      }
    });
    const data = ensure();
    data.sessions.push(sess);
    data.activeId = sess.id;
    save(data);
    return sess;
  }

  function clearSolves(id) {
    const data = ensure();
    const s = data.sessions.find(x => x.id === id);
    if (!s) return;
    s.solves = [];
    save(data);
  }

  window.Store = {
    ensure, getActive, setActive, list, create, rename, remove,
    setPuzzle, addSolve, updateSolve, deleteSolve,
    exportSession, importSession, clearSolves
  };
})();
