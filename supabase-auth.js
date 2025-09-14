// supabase-auth.js (charger AVEC type="module" dans index.html)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// === CONFIG À ADAPTER ===
const SUPABASE_URL  = "https://ctjljqmxjnfykskfgral.supabase.co";  // ex: https://ctjljqmxjnfykskfgral.supabase.co
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4";                          // ta anon key (publique)
const REDIRECT_TO   = "https://hizayatech.github.io/hizaya-pwa/";                    // ex: https://hizayatech.github.io/hizaya-pwa/

// Expose un client global unique
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// Helper d’auth
window.hzAuth = {
  async loginWithGoogle() {
    const { error } = await window.supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_TO }
    });
    if (error) {
      console.error("[auth] Google error:", error);
      alert("Erreur Google: " + (error.message || error));
    }
  },
  async logout() {
    await window.supabase.auth.signOut();
  }
};

// Dispatch un évènement custom "supabase-auth" à chaque changement
function dispatchSession(session) {
  window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
}

// État initial
const { data: { session } } = await window.supabase.auth.getSession();
dispatchSession(session);

// Écoute les changements (retour OAuth inclus)
window.supabase.auth.onAuthStateChange((_event, sess) => {
  console.log("[auth] state:", _event, sess?.user?.email);
  dispatchSession(sess);
});

// Branchement du bouton si présent
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#btnGoogle");
  if (btn && !btn._hzBound) {
    btn._hzBound = true;
    btn.addEventListener("click", () => window.hzAuth.loginWithGoogle());
  }
});
