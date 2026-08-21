(function () {
  const db = () => SB.client;
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function friendly(error) {
    if (!error) return new Error('Unknown error');
    if (error.code === '23505') return new Error('Conflict: already exists.');
    if (error.code === '42501' || error.message?.includes('row-level security'))
      return new Error('Permission denied by the room rules.');
    if (error.message === 'JWT expired') return new Error('Session expired — reload.');
    return new Error(error.message || 'Request failed');
  }

  function genCode(len = 6) {
    let s = '';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
    return s;
  }

  function computeFinal(rawMs, penalty) {
    if (penalty === 'dnf') return null;
    if (penalty === '+2') return rawMs + 2000;
    return rawMs;
  }

  async function findRoom(code) {
    const { data, error } = await db().from('rooms').select('*').eq('room_code', code).maybeSingle();
    if (error) throw friendly(error);
    return data;
  }

  async function createRoom(code, cubeType) {
    const { data, error } = await db().from('rooms')
      .insert({ id: uuid(), room_code: code, cube_type: cubeType, created_by: SB.uid() })
      .select().single();
    if (error) throw friendly(error);
    return data;
  }

  async function deleteRoom(roomId) {
    const { error } = await db().from('rooms').delete().eq('id', roomId);
    if (error) throw friendly(error);
  }

  async function getPlayers(roomId) {
    const { data, error } = await db().from('players').select('*')
      .eq('room_id', roomId).order('player_number');
    if (error) throw friendly(error);
    return data || [];
  }

  async function addPlayer(roomId, seat, name) {
    const { data, error } = await db().from('players')
      .insert({ id: SB.uid(), room_id: roomId, player_number: seat, name })
      .select().single();
    if (error) throw friendly(error);
    return data;
  }

  async function removePlayer(roomId) {
    const { error } = await db().from('players').delete().eq('id', SB.uid()).eq('room_id', roomId);
    if (error) throw friendly(error);
  }

  async function leaveRoomCleanup(roomId) {
    const { error } = await db().rpc('leave_and_cleanup', { r: roomId });
    if (error) throw friendly(error);
  }

  async function getScrambles(roomId) {
    const { data, error } = await db().from('scrambles').select('*')
      .eq('room_id', roomId).order('solve_number');
    if (error) throw friendly(error);
    return data || [];
  }

  async function addScramble(roomId, n, scramble, cubeType) {
    const { data, error } = await db().from('scrambles')
      .insert({ room_id: roomId, solve_number: n, scramble, cube_type: cubeType })
      .select().single();
    if (!error) return data;
    if (error.code === '23505') {
      const { data: existing, error: e2 } = await db().from('scrambles').select('*')
        .eq('room_id', roomId).eq('solve_number', n).maybeSingle();
      if (e2) throw friendly(e2);
      if (existing) return existing;
    }
    throw friendly(error);
  }

  async function getSolves(roomId) {
    const { data, error } = await db().from('solves').select('*')
      .eq('room_id', roomId).order('solve_number');
    if (error) throw friendly(error);
    return data || [];
  }

  async function insertSolve(row) {
    const { error } = await db().from('solves').insert(row);
    if (error) {
      if (error.code === '23505') throw new Error('You already recorded this round.');
      throw friendly(error);
    }
  }

  async function updateSolvePenalty(id, penalty, finalMs) {
    const { error } = await db().from('solves').update({ penalty, final_time: finalMs }).eq('id', id);
    if (error) throw friendly(error);
  }

  async function deleteSolve(id) {
    const { error } = await db().from('solves').delete().eq('id', id);
    if (error) throw friendly(error);
  }

window.API = (function() {
  const client = () => SB.client;
  async function createRoom(hostName, cubeType) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await client().from('rooms').insert({ code, cube_type: cubeType, host_name: hostName, created_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    await addPlayer(data.id, hostName, 1);
    return data;
  }
  async function joinRoom(code, playerName) {
    const { data: room, error: rErr } = await client().from('rooms').select('id, cube_type').eq('code', code).single();
    if (rErr || !room) throw new Error('اتاق یافت نشد.');
    const players = await getPlayers(room.id);
    if (players.length >= 2) throw new Error('اتاق پر است.');
    await addPlayer(room.id, playerName, players.length === 0 ? 1 : 2);
    return { code, cube_type: room.cube_type };
  }
  async function addPlayer(roomId, name, seat) {
    const { data, error } = await client().from('players').insert({ room_id: roomId, name, player_number: seat }).select().single();
    if (error) throw error;
    return data;
  }
  async function getPlayers(roomId) {
    const { data, error } = await client().from('players').select('*').eq('room_id', roomId).order('player_number');
    if (error) throw error;
    return data || [];
  }
  async function findRoom(code) {
    const { data } = await client().from('rooms').select('*').eq('code', code).single();
    return data;
  }
  async function getScrambles(roomId) {
    const { data } = await client().from('scrambles').select('*').eq('room_id', roomId).order('solve_number');
    return data || [];
  }
  async function addScramble(roomId, solveNumber, scramble, cubeType) {
    const { data, error } = await client().from('scrambles').insert({ room_id: roomId, solve_number: solveNumber, scramble, cube_type: cubeType }).select().single();
    if (error) throw error;
    return data;
  }
  async function getSolves(roomId) {
    const { data } = await client().from('solves').select('*').eq('room_id', roomId).order('solve_number');
    return data || [];
  }
  async function insertSolve(solve) {
    const { error } = await client().from('solves').insert(solve);
    if (error) throw error;
  }
  async function updateSolvePenalty(solveId, penalty, finalTime) {
    const { error } = await client().from('solves').update({ penalty, final_time: finalTime }).eq('id', solveId);
    if (error) throw error;
  }
  async function deleteSolve(solveId) {
    const { error } = await client().from('solves').delete().eq('id', solveId);
    if (error) throw error;
  }
  async function removePlayer(roomId) {
    const { error } = await client().from('players').delete().eq('room_id', roomId).eq('id', SB.uid());
    if (error) throw error;
  }
  async function leaveRoomCleanup(roomId) { /* Optional cleanup logic */ }
  function computeFinal(rawMs, penalty) {
    if (penalty === 'dnf') return null;
    if (penalty === '+2') return rawMs + 2000;
    return rawMs;
  }
  return { createRoom, joinRoom, addPlayer, getPlayers, findRoom, getScrambles, addScramble, getSolves, insertSolve, updateSolvePenalty, deleteSolve, removePlayer, leaveRoomCleanup, computeFinal };


})();
