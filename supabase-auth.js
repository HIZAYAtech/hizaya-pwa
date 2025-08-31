/* supabase-auth.js — UMD, no TypeScript, no modules */
(function () {
  // Ces variables DOIVENT être définies dans index.html AVANT ce script
  var url  = window.__SUPABASE_URL__;
  var anon = window.__SUPABASE_ANON_KEY__;

  if (!url || !anon) {
    console.error("Supabase config missing: __SUPABASE_URL__ / __SUPABASE_ANON_KEY__");
    return;
  }

  // La lib UMD doit être chargée avant (cdn.jsdelivr.net/npm/@supabase/supabase-js@2)
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase JS not loaded. Add the CDN script before supabase-auth.js");
    return;
  }

  // Remplace le namespace par l’instance client (pratique pour app.js)
  window.supabase = window.supabase.createClient(url, anon);

  // Petits helpers que app.js peut appeler
  window.hzAuth = {
    loginWithGoogle: async function () {
      var redirectTo = location.origin + location.pathname;
      await window.supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo }
      });
    },
    logout: async function () {
      await window.supabase.auth.signOut();
    }
  };

  // Émet un event quand la session change (app.js peut écouter)
  window.supabase.auth.onAuthStateChange(function (_evt, session) {
    window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session: session } }));
  });

  // Petite trace de debug
  console.log("[supabase-auth] OK");
})();
