(function () {
  const MAX_LEN = 500;
  const HISTORY_LIMIT = 50;

  let roomId = null, myId = null, myName = '', oppName = 'Opponent';
  const renderedIds = new Set();
  const els = {};

  function init(opts) {
    roomId = opts.roomId;
    myId = opts.myId;
    myName = opts.myName;
    oppName = opts.oppName || 'Opponent';
    els.scroll = document.getElementById('chatScroll');
    els.input = document.getElementById('chatInput');
    els.send = document.getElementById('chatSend');
    els.status = document.getElementById('chatStatus');
    els.send.addEventListener('click', sendMessage);
    els.input.addEventListener('keydown', onKey);
    loadHistory();
  }

  function setOpponentName(name) { oppName = name || 'Opponent'; }

  async function loadHistory() {
    try {
      const { data, error } = await SB.client.from('messages')
        .select('*').eq('room_id', roomId)
        .order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
      if (error) throw error;
      const msgs = (data || []).reverse();
      for (const m of msgs) appendMessage(m);
      scrollToBottom(true);
    } catch (e) {
      setStatus('Failed to load chat history');
    }
  }

  function onRealtimeInsert(msg) {
    if (renderedIds.has(msg.id)) return;
    const wasNear = isNearBottom();
    appendMessage(msg);
    scrollToBottom(wasNear || msg.player_id === myId);
  }

  function onRealtimeDelete(msg) {
    renderedIds.delete(msg.id);
    removeMessageEl(msg.id);
  }

  function isNearBottom() {
    return els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight < 80;
  }

  function scrollToBottom(force) {
    if (force) els.scroll.scrollTop = els.scroll.scrollHeight;
  }

  function appendMessage(msg) {
    if (renderedIds.has(msg.id)) return;
    renderedIds.add(msg.id);
    const own = msg.player_id === myId;
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (own ? 'own' : 'other');
    wrap.id = 'msg-' + msg.id;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = own ? myName : oppName;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = fmtClock(msg.created_at);
    meta.appendChild(nameSpan);
    meta.appendChild(timeSpan);

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = msg.message;

    wrap.appendChild(meta);
    wrap.appendChild(bubble);

    if (own) {
      const del = document.createElement('button');
      del.className = 'chat-del';
      del.textContent = '✕';
      del.title = 'Delete message';
      del.addEventListener('click', () => deleteMessage(msg.id));
      wrap.appendChild(del);
    }

    els.scroll.appendChild(wrap);
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function sendMessage() {
    const raw = els.input.value.trim();
    if (!raw) return;
    if (raw.length > MAX_LEN) {
      setStatus('Message too long (max ' + MAX_LEN + ')');
      return;
    }
    els.input.value = '';
    const id = uuid();
    const msg = { id, room_id: roomId, player_id: myId, message: raw, created_at: new Date().toISOString() };
    appendMessage(msg);
    scrollToBottom(true);
    setStatus('Sending…');
    try {
      const { error } = await SB.client.from('messages')
        .insert({ id, room_id: roomId, player_id: myId, message: raw });
      if (error) throw error;
      setStatus('');
    } catch (e) {
      renderedIds.delete(id);
      removeMessageEl(id);
      els.input.value = raw;
      setStatus('Send failed: ' + e.message);
    } finally {
      els.input.focus();
    }
  }

  async function deleteMessage(id) {
    if (!confirm('Delete this message?')) return;
    try {
      const { error } = await SB.client.from('messages').delete().eq('id', id);
      if (error) throw error;
      renderedIds.delete(id);
      removeMessageEl(id);
    } catch (e) {
      setStatus('Delete failed: ' + e.message);
    }
  }

  function removeMessageEl(id) {
    const el = document.getElementById('msg-' + id);
    if (el) el.remove();
  }

  function setStatus(txt) {
    if (els.status) els.status.textContent = txt;
  }

  window.Chat = { init, setOpponentName, onRealtimeInsert, onRealtimeDelete };
})();
