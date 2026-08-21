window.Chat = (function () {
  let roomId = null;
  let myId = null;
  let myName = '';
  let oppName = 'حریف';

  function init(cfg) {
    roomId = cfg.roomId;
    myId = cfg.myId;
    myName = cfg.myName;
    oppName = cfg.oppName || 'حریف';
  }

  function setOpponentName(name) {
    oppName = name;
  }

  function appendMessage(m) {
    const box = document.getElementById('chatMessages');
    if (!box) return;

    const div = document.createElement('div');
    div.style.marginBottom = '0.5rem';
    div.style.fontSize = '0.875rem';
    div.style.lineHeight = '1.4';

    const isMe = m.sender_id === myId;
    const senderName = isMe ? myName : oppName;
    const color = isMe ? 'var(--primary)' : 'var(--warning)';

    // استفاده از textContent برای جلوگیری از XSS
    const nameSpan = document.createElement('span');
    nameSpan.style.color = color;
    nameSpan.style.fontWeight = '600';
    nameSpan.textContent = senderName + ': ';

    const textSpan = document.createElement('span');
    textSpan.style.color = 'var(--text)';
    textSpan.textContent = m.text;

    div.appendChild(nameSpan);
    div.appendChild(textSpan);
    box.appendChild(div);
    
    // اسکرول خودکار به پایین
    box.scrollTop = box.scrollHeight;
  }

  async function sendMessage(text) {
    const cleanText = text.trim();
    if (!cleanText || !roomId) return;

    try {
      await SB.client.from('messages').insert({
        room_id: roomId,
        sender_id: myId,
        text: cleanText,
        created_at: new Date().toISOString()
      });
      // پاک کردن فیلد ورودی پس از ارسال موفق
      const input = document.getElementById('chatInput');
      if (input) input.value = '';
    } catch (e) {
      toast('خطا در ارسال پیام', 'err');
    }
  }

  return {
    init,
    setOpponentName,
    sendMessage,
    onRealtimeInsert: appendMessage,
    onRealtimeDelete: () => {} // در صورت نیاز به حذف پیام در آینده
  };
})();
