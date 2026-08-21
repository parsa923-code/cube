window.API = (function () {
  const getClient = () => SB.client;

  async function createRoom(hostName, cubeType) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await getClient().from('rooms')
      .insert({ code, cube_type: cubeType, host_name: hostName, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    
    // اضافه کردن سازنده به عنوان بازیکن شماره ۱
    await addPlayer(data.id, hostName, 1);
    return data;
  }

  async function joinRoom(code, playerName) {
    const { data: room, error: rErr } = await getClient().from('rooms')
      .select('id, cube_type')
      .eq('code', code)
      .single();
      
    if (rErr || !room) throw new Error('اتاق با این کد یافت نشد.');
    
    const players = await getPlayers(room.id);
    if (players.length >= 2) throw new Error('این اتاق پر است.');
    
    const seat = players.length === 0 ? 1 : 2;
    await addPlayer(room.id, playerName, seat);
    return { code, cube_type: room.cube_type };
  }

  async function addPlayer(roomId, name, seat) {
    const { data, error } = await getClient().from('players')
      .insert({ room_id: roomId, name, player_number: seat })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function getPlayers(roomId) {
    const { data, error } = await getClient().from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('player_number', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function findRoom(code) {
    const { data } = await getClient().from('rooms').select('*').eq('code', code).single();
    return data;
  }

  async function getScrambles(roomId) {
    const { data } = await getClient().from('scrambles')
      .select('*')
      .eq('room_id', roomId)
      .order('solve_number', { ascending: true });
    return data || [];
  }

  async function addScramble(roomId, solveNumber, scramble, cubeType) {
    const { data, error } = await getClient().from('scrambles')
      .insert({ room_id: roomId, solve_number: solveNumber, scramble, cube_type: cubeType })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function getSolves(roomId) {
    const { data } = await getClient().from('solves')
      .select('*')
      .eq('room_id', roomId)
      .order('solve_number', { ascending: true });
    return data || [];
  }

  async function insertSolve(solve) {
    const { error } = await getClient().from('solves').insert(solve);
    if (error) throw new Error(error.message);
  }

  async function updateSolvePenalty(solveId, penalty, finalTime) {
    const { error } = await getClient().from('solves')
      .update({ penalty, final_time: finalTime })
      .eq('id', solveId);
    if (error) throw new Error(error.message);
  }

  async function deleteSolve(solveId) {
    const { error } = await getClient().from('solves').delete().eq('id', solveId);
    if (error) throw new Error(error.message);
  }

  async function removePlayer(roomId) {
    const { error } = await getClient().from('players')
      .delete()
      .eq('room_id', roomId)
      .eq('id', SB.uid);
    if (error) throw new Error(error.message);
  }

  async function leaveRoomCleanup(roomId) {
    // در صورت نیاز به پاکسازی اضافی هنگام خروج
    return Promise.resolve();
  }

  function computeFinal(rawMs, penalty) {
    if (penalty === 'dnf') return null;
    if (penalty === '+2') return rawMs + 2000;
    return rawMs;
  }

  return {
    createRoom, joinRoom, addPlayer, getPlayers, findRoom,
    getScrambles, addScramble, getSolves, insertSolve,
    updateSolvePenalty, deleteSolve, removePlayer, leaveRoomCleanup, computeFinal
  };
})();
