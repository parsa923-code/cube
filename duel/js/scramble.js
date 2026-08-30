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
