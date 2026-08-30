(function () {
  const MAX_LEN = 500;
  const HISTORY_LIMIT = 50;

  let roomId = null, myId = null;
  let players = {}; // id -> { name, color, seat }
  const renderedIds = new Set();
  const els = {};

  function init(opts) {
    roomId = opts.roomId;
    myId = opts.myId;
    players = opts.players || {};
    els.scroll = document.getElementById('chatScroll');
    els.input = document.getElementById('chatInput');
    els.send = document.getElementById('chatSend');
    els.status = document.getElementById('chatStatus');
    els.send.addEventListener('click', sendMessage);
    els.input.addEventListener('keydown', onKey);
    loadHistory();
  }

  function setPlayers(map) {
    players = map || {};
    // refresh already-rendered names/colors (e.g. a late-joining player's name resolving)
    if (!els.scroll) return;
    els.scroll.querySelectorAll('[data-pid]').forEach(el => applyIdentity(el, el.dataset.pid));
  }

  function identityFor(id) {
    const p = players[id];
    return p ? { name: p.name, color: p.color } : { name: 'Player', color: 'var(--dim)' };
  }

  function applyIdentity(wrap, id) {
    const { name, color } = identityFor(id);
    const nameEl = wrap.querySelector('.chat-name');
    const dotEl = wrap.querySelector('.chat-dot');
    const bubbleEl = wrap.querySelector('.chat-bubble');
    if (nameEl) { nameEl.textContent = name; if (!wrap.classList.contains('own')) nameEl.style.color = color; }
    if (dotEl) dotEl.style.background = color;
    if (bubbleEl && !wrap.classList.contains('own')) bubbleEl.style.borderLeftColor = color;
  }

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
      console.error('[CubeDuel Chat] Failed to load history:', e);
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
    const { name, color } = identityFor(msg.player_id);
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (own ? 'own' : 'other');
    wrap.id = 'msg-' + msg.id;
    wrap.dataset.pid = msg.player_id;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    if (!own) {
      const dot = document.createElement('span');
      dot.className = 'chat-dot';
      dot.style.background = color;
      meta.appendChild(dot);
    }
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = name;
    if (!own) nameSpan.style.color = color;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = fmtClock(msg.created_at);
    meta.appendChild(nameSpan);
    meta.appendChild(timeSpan);

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = msg.message;
    if (!own) bubble.style.borderLeftColor = color;

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
      console.error('[CubeDuel Chat] Failed to send message:', e);
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
      console.error('[CubeDuel Chat] Failed to delete message:', e);
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

  window.Chat = { init, setPlayers, onRealtimeInsert, onRealtimeDelete };
})();
