// Supabase client + anonymous identity
(function () {
  const { createClient } = window.supabase;

  const client = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  let cachedUid = null;

  window.SB = {
    client,
    // Makes sure we have an (anonymous) authenticated user. Returns uid.
    async ensureAuth() {
      const { data, error: gErr } = await client.auth.getSession();
      if (!gErr && data.session) { cachedUid = data.session.user.id; return cachedUid; }
      const { data: sData, error } = await client.auth.signInAnonymously();
      if (error) throw new Error('Auth failed: ' + error.message +
        ' — Enable Anonymous Sign-Ins in Supabase (Auth → Providers).');
      cachedUid = sData.user.id;
      return cachedUid;
    },
    uid() { return cachedUid; }
  };
})();


