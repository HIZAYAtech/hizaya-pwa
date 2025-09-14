// supabase-auth.js  (charger avec type="module")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// === CONFIG À ADAPTER ===
const SUPABASE_URL  = "https://ctjljqmxjnfykskfgral.supabase.co";     // ex: https://ctjljqmxjnfykskfgral.supabase.co
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4";                             // ta anon public key
const REDIRECT_TO   = "https://hizayatech.github.io/hizaya-pwa/"; // URL publique de ta PWA (exacte, avec /)

// Expose un client global unique
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// Petit helper auth
window.hzAuth = {
  async loginWithGoogle() {
    // IMPORTANT: Configure dans Supabase → Authentication → URL Configuration:
    // - Site URL = REDIRECT_TO
    // - Redirect URLs = REDIRECT_TO (et localhost si tu testes en local)
    const { data, error } = await window.supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_TO }
    });
    if (error) {
      console.error("[auth] Google error:", error);
      alert("Erreur Google: " + (error.message || error));
    }
    // redirection OAuth automatique; rien d'autre à faire ici
  },

  async logout() {
    await window.supabase.auth.signOut();
    // on laisse app.js gérer l’UI via l’événement ci-dessous
  }
};

// Dispatch un évènement custom "supabase-auth" à chaque changement
function dispatchSession(session) {
  window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
}

// Au chargement: publie l’état courant
(async () => {
  const { data: { session } } = await window.supabase.auth.getSession();
  dispatchSession(session);
})();

// Et écoute les changements (retour d’OAuth compris)
window.supabase.auth.onAuthStateChange((_event, session) => {
  console.log("[auth] state:", _event, session?.user?.email);
  dispatchSession(session);
});

// (facultatif) branchement direct si ton bouton a l’id #btnGoogle et qu’aucun autre
// code ne s’en occupe (sinon, laisse app.js l’attacher)
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#btnGoogle");
  if (btn && !btn._hzBound) {
    btn._hzBound = true;
    btn.addEventListener("click", () => window.hzAuth.loginWithGoogle());
  }
});
