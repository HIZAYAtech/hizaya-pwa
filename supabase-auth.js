/* supabase-auth.js — UMD simple */
(function () {
  const cfg = window.__CFG__ || {};
  const url  = cfg.SUPABASE_URL;
  const anon = cfg.SUPABASE_ANON_KEY;
  if (!url || !anon || !window.supabase) {
    console.error("[supabase-auth] Mauvaise config ou supabase-js manquant.");
    return;
  }
  const client = window.supabase.createClient(url, anon);

  // Expose
  window.sb = client;

  // Helpers login
  window.hzAuth = {
    loginWithGoogle: () => client.auth.signInWithOAuth({ provider: "google" }),
    loginWithEmail:  (email) => client.auth.signInWithOtp({ email }),
    logout: () => client.auth.signOut()
  };

  // Notifier l'app au boot
  client.auth.getSession().then(({ data }) => {
    const ev = new CustomEvent("supabase-auth", { detail: { session: data.session } });
    window.dispatchEvent(ev);
  });

  // Notifier sur chaque changement
  client.auth.onAuthStateChange((_, session) => {
    const ev = new CustomEvent("supabase-auth", { detail: { session } });
    window.dispatchEvent(ev);
  });

  console.log("[supabase-auth] OK");
})();
