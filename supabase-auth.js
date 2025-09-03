/* supabase-auth.js — UMD simple (Google + email OTP) */
(function () {
  const cfg = window.__CFG__ || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    console.error("[supabase-auth] Config manquante ou supabase-js absent.");
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.sb = sb;

  // Helpers d'auth
  window.hzAuth = {
    loginWithGoogle: () => sb.auth.signInWithOAuth({ provider: "google", options:{ redirectTo: location.origin+location.pathname } }),
    loginWithEmail:  (email) => sb.auth.signInWithOtp({ email }),
    logout: () => sb.auth.signOut()
  };

  // Propagation session → app
  sb.auth.getSession().then(({ data }) => {
    window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session: data.session } }));
  });
  sb.auth.onAuthStateChange((_, session) => {
    window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
  });

  console.log("[supabase-auth] OK");
})();
