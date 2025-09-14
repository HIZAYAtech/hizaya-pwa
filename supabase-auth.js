// supabase-auth.js (type="module")
console.log("[auth] supabase-auth.js chargé");

async function boot() {
  try {
    // 1) Import ESM explicite (meilleure gestion d'erreurs)
    const mod = await import("https://esm.sh/@supabase/supabase-js@2");
    console.log("[auth] supabase-js import OK", mod);
    const { createClient } = mod;

    // 2) ⚠️ REMPLACE ICI ⚠️
    const SUPABASE_URL  = "https://ctjljqmxjnfykskfgral.supabase.co";  // ex: https://ctjljqmxjnfykskfgral.supabase.co
    const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4";                          // ANON PUBLIC KEY
    const REDIRECT_TO   = "https://hizayatech.github.io/hizaya-pwa/";  // URL exacte de ta PWA (avec /)

    // 3) Client global
    window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    console.log("[auth] createClient OK");

    // 4) API globale (utilisée par index.html via onclick=…)
    window.hzAuth = {
      async loginWithGoogle() {
        try {
          const { error } = await window.supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: REDIRECT_TO }
          });
          if (error) {
            console.error("[auth] Google error:", error);
            alert("Erreur Google: " + (error.message || error));
          }
        } catch (e) {
          console.error("[auth] signIn exception:", e);
          alert("Auth exception: " + e.message);
        }
      },
      async logout() { await window.supabase.auth.signOut(); }
    };

    // 5) Dispatch un event à chaque changement
    function dispatch(session) {
      window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
    }

    // 6) Session initiale
    const { data: { session } } = await window.supabase.auth.getSession();
    console.log("[auth] initial session:", !!session, session?.user?.email);
    dispatch(session);

    // 7) Suivi
    window.supabase.auth.onAuthStateChange((evt, sess) => {
      console.log("[auth] state:", evt, sess?.user?.email);
      dispatch(sess);
    });

    // 8) Sécuriser le bouton (si jamais l’onclick ne marchait pas)
    function bindBtn() {
      const btn = document.querySelector("#btnGoogle");
      if (btn && !btn._hzBound) {
        btn._hzBound = true;
        btn.addEventListener("click", () => window.hzAuth.loginWithGoogle());
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindBtn);
    } else {
      bindBtn();
    }
  } catch (e) {
    console.error("[auth] ÉCHEC de boot:", e);
    // Laisse une trace visible si app.js attend supabase
    window.__SUPABASE_BOOT_ERROR__ = e?.message || String(e);
  }
}

boot();
