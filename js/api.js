// Data layer — all Supabase reads/writes
(function () {
    const db = () => SB.client;
    const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I L O 0 1
  
    function friendly(error) {
      if (!error) return new Error('Unknown error');
      if (error.code === '23505') return new Error('Conflict: already exists (unique constraint).');
      if (error.code === '42501' || error.message?.includes('row-level security'))
        return new Error('Permission denied by the room rules.');
      if (error.message === 'JWT expired') return new Error('Session expired — reload the page.');
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
      const { data, error } = await db().from('rooms').select('*')
        .eq('room_code', code).maybeSingle();
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
      const { error } = await db().from('players').delete()
        .eq('id', SB.uid()).eq('room_id', roomId);
      if (error) throw friendly(error);
    }
  
    async function getScrambles(roomId) {
      const { data, error } = await db().from('scrambles').select('*')
        .eq('room_id', roomId).order('solve_number');
      if (error) throw friendly(error);
      return data || [];
    }
  
    // Race-safe: if both players request the same round, unique(room_id, solve_number)
    // lets exactly one insert win; the loser reads the winner's scramble.
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
        if (error.code === '23505')
          throw new Error('You already recorded this round — edit it in the table.');
        throw friendly(error);
      }
    }
  
    async function updateSolvePenalty(id, penalty, finalMs) {
      const { error } = await db().from('solves')
        .update({ penalty, final_time: finalMs }).eq('id', id);
      if (error) throw friendly(error);
    }
  
    async function deleteSolve(id) {
      const { error } = await db().from('solves').delete().eq('id', id);
      if (error) throw friendly(error);
    }
  
    window.API = {
      genCode, computeFinal,
      findRoom, createRoom, deleteRoom,
      getPlayers, addPlayer, removePlayer,
      getScrambles, addScramble,
      getSolves, insertSolve, updateSolvePenalty, deleteSolve
    };
  })();