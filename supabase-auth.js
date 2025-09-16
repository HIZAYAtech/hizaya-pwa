// supabase-auth.js — module ES
// Attendu : window.__SUPABASE_URL__ et window.__SUPABASE_ANON__ définis dans index.html
// (tu peux laisser les valeurs par défaut si tu veux)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Fallbacks au cas où tu n’as pas mis les variables dans index.html
const URL  = window.__SUPABASE_URL__  || "https://ctjljqmxjnfykskfgral.supabase.co";
const ANON = window.__SUPABASE_ANON__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4";

// Client global
const supabase = createClient(URL, ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
window.supabase = supabase;

// Helpers login/logout
window.hzAuth = {
  async loginWithGoogle() {
    const REDIRECT_URL = (() => {
      const { origin, pathname } = window.location;
      const base = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]+$/, '/');
      return origin + base;
    })();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_URL, queryParams: { access_type: "offline", prompt: "consent" } }
    });
  },
  async logout() { await supabase.auth.signOut(); }
};

// Émettre un évènement global quand la session change
function emitSession(session, phase="AUTH_STATE") {
  window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { phase, session } }));
}

// Sur changement d’état
supabase.auth.onAuthStateChange((_event, session) => emitSession(session, "AUTH_STATE"));

// Sur chargement, pousser l’état initial
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  emitSession(session, "INITIAL_SESSION");
  console.log("[auth] state:", "INITIAL_SESSION", session);
})();
