// WCA-style scramble generator (2x2 & 3x3)
// Rules enforced:
//  - never two consecutive moves on the same face (kills R R', R R2, U U')
//  - never three consecutive moves on the same axis (kills R L R, F B F2, U D U2)
(function () {
    const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
    const SUF = ['', "'", '2'];
    const pick = n => Math.floor(Math.random() * n);
  
    function generateSeq(faces, len) {
      const moves = [];
      let prev1 = null, prev2 = null;
      let guard = 0;
      while (moves.length < len && guard++ < 5000) {
        const f = faces[pick(faces.length)];
        if (f === prev1) continue;                                   // same face
        if (prev1 && prev2 && AXIS[f] === AXIS[prev1] && AXIS[f] === AXIS[prev2]) continue; // same axis x3
        moves.push(f + SUF[pick(3)]);
        prev2 = prev1; prev1 = f;
      }
      return moves.join(' ');
    }
  
    window.ScrambleGen = {
      // 3x3: 20 moves over U D L R F B (standard WCA shape)
      // 2x2: 10 moves over <U,R,F> (the common 2x2 scramble group)
      generate(cubeType) {
        return cubeType === '222'
          ? generateSeq(['U', 'R', 'F'], 10)
          : generateSeq(['U', 'D', 'L', 'R', 'F', 'B'], 20);
      }
    };
  })();

(function () {
  const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2, u: 3, d: 3, l: 4, r: 4, f: 5, b: 5 };
  const SUF = ['', "'", '2'];
  const pick = n => Math.floor(Math.random() * n);

  function generateSeq(faces, len) {
    const moves = [];
    let prev1 = null, prev2 = null;
    let guard = 0;
    while (moves.length < len && guard++ < 10000) {
      const f = faces[pick(faces.length)];
      if (f === prev1) continue;
      if (prev1 && prev2 && AXIS[f] === AXIS[prev1] && AXIS[f] === AXIS[prev2]) continue;
      moves.push(f + SUF[pick(3)]);
      prev2 = prev1; prev1 = f;
    }
    return moves.join(' ');
  }

  window.ScrambleGen = {
    generate(cubeType) {
      switch (cubeType) {
        case '222': return generateSeq(['U', 'R', 'F'], 10);
        case '333': return generateSeq(['U', 'D', 'L', 'R', 'F', 'B'], 20);
        case '444': return generateSeq(['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'], 40);
        case '555': return generateSeq(['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw', '3U', '3D', '3L', '3R', '3F', '3B'], 60);
        case '666': return generateSeq(['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw', '3U', '3D', '3L', '3R', '3F', '3B'], 80);
        case '777': return generateSeq(['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw', '3U', '3D', '3L', '3R', '3F', '3B'], 100);
        case 'pyra': return generateSeq(['U', 'L', 'R', 'B', 'u', 'l', 'r', 'b'], 12);
        case 'skewb': return generateSeq(['U', 'L', 'R', 'B'], 10);
        default: return generateSeq(['U', 'D', 'L', 'R', 'F', 'B'], 20);
      }
    }
  };
})();
