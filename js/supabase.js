window.SB = (function () {
  let client = null;
  let user = null;

  function init() {
    // بررسی وجود کتابخانه Supabase و تنظیمات
    if (typeof supabase === 'undefined') {
      console.warn('Supabase library not loaded. Multiplayer features will be disabled.');
      return;
    }
    if (!window.APP_CONFIG || !window.APP_CONFIG.supabaseUrl || !window.APP_CONFIG.supabaseKey) {
      console.warn('Supabase config is missing. Please update js/config.js');
      return;
    }
    
    // ایجاد کلاینت Supabase
    client = supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);
  }

  async function ensureAuth() {
    if (!client) throw new Error('کلاینت Supabase مقداردهی نشده است. لطفاً فایل config.js را بررسی کنید.');
    
    // بررسی نشست فعال
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      // ورود ناشناس اگر نشستی وجود ندارد
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw new Error('خطا در ورود ناشناس: ' + error.message);
      user = data.user;
    } else {
      user = session.user;
    }
    return user;
  }

  return {
    init,
    ensureAuth,
    get uid() { return user ? user.id : null; },
    get client() { return client; }
  };
})();

// مقداردهی اولیه به محض لود شدن اسکریپت
SB.init();
