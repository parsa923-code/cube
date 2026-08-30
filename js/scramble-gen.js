/**
 * Scramble generators for multiple WCA-style events.
 * Moves avoid consecutive same-face and triple same-axis where applicable.
 */
(function () {
  const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  const SUF = ['', "'", '2'];
  const pick = n => Math.floor(Math.random() * n);

  function genFaceSeq(faces, len, useAxisGuard) {
    const moves = [];
    let prev1 = null, prev2 = null;
    let guard = 0;
    while (moves.length < len && guard++ < 8000) {
      const f = faces[pick(faces.length)];
      if (f === prev1) continue;
      if (useAxisGuard && prev1 && prev2 && AXIS[f] === AXIS[prev1] && AXIS[f] === AXIS[prev2]) continue;
      moves.push(f + SUF[pick(3)]);
      prev2 = prev1;
      prev1 = f;
    }
    return moves.join(' ');
  }

  // Wide moves for big cubes: Uu, Rr, etc. or standard notation Uw, Rw
  const BIG_FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
  const WIDE_SUF = ['', "'", '2', 'w', "w'", 'w2'];

  function genBigCube(len, maxWideDepth) {
    // Simplified valid-ish big-cube scramble: outer + optional wide
    const moves = [];
    let prevFace = null, prevAxis = null, axisCount = 0;
    let guard = 0;
    while (moves.length < len && guard++ < 10000) {
      const face = BIG_FACES[pick(6)];
      const axis = AXIS[face];
      if (face === prevFace) continue;
      if (axis === prevAxis) {
        axisCount++;
        if (axisCount >= 2) continue;
      } else {
        axisCount = 0;
      }
      let suf;
      if (maxWideDepth > 1 && Math.random() < 0.35) {
        // wide move
        const depth = pick(maxWideDepth - 1) + 2; // 2..max
        const turn = SUF[pick(3)];
        suf = depth === 2 ? 'w' + turn : depth + 'w' + turn;
      } else {
        suf = SUF[pick(3)];
      }
      moves.push(face + suf);
      prevFace = face;
      prevAxis = axis;
    }
    return moves.join(' ');
  }

  // Pyraminx: tips + edges (simplified WCA-like)
  function genPyraminx() {
    const tips = ['u', 'l', 'r', 'b'];
    const edges = ['U', 'L', 'R', 'B'];
    const tipMoves = [];
    for (const t of tips) {
      if (Math.random() < 0.75) tipMoves.push(t + (Math.random() < 0.5 ? '' : "'"));
    }
    const edgeMoves = [];
    let prev = null;
    for (let i = 0; i < 8 + pick(3); i++) {
      let e;
      do { e = edges[pick(4)]; } while (e === prev);
      edgeMoves.push(e + (Math.random() < 0.5 ? '' : "'"));
      prev = e;
    }
    return [...edgeMoves, ...tipMoves].join(' ');
  }

  // Skewb
  function genSkewb() {
    const faces = ['U', 'L', 'R', 'B'];
    const moves = [];
    let prev = null;
    for (let i = 0; i < 9; i++) {
      let f;
      do { f = faces[pick(4)]; } while (f === prev);
      moves.push(f + (Math.random() < 0.5 ? '' : "'"));
      prev = f;
    }
    return moves.join(' ');
  }

  const GENERATORS = {
    '222': () => genFaceSeq(['U', 'R', 'F'], 10, false),
    '333': () => genFaceSeq(['U', 'D', 'L', 'R', 'F', 'B'], 20, true),
    '444': () => genBigCube(40, 2),
    '555': () => genBigCube(60, 3),
    '666': () => genBigCube(80, 3),
    '777': () => genBigCube(100, 4),
    'pyram': genPyraminx,
    'skewb': genSkewb
  };

  const LABELS = {
    '222': '2×2',
    '333': '3×3',
    '444': '4×4',
    '555': '5×5',
    '666': '6×6',
    '777': '7×7',
    'pyram': 'Pyraminx',
    'skewb': 'Skewb'
  };

  window.ScrambleGen = {
    generate(eventId) {
      const fn = GENERATORS[eventId] || GENERATORS['333'];
      return fn();
    },
    label(eventId) {
      return LABELS[eventId] || eventId;
    },
    events: Object.keys(GENERATORS)
  };
})();
