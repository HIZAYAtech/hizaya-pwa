// supabase-auth.js — module ES
// Inject project variables in index.html:
//   window.__SUPABASE_URL__  = "https://YOUR-PROJECT.ref.supabase.co";
//   window.__SUPABASE_ANON__ = "PUBLIC_ANON_KEY";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Fallbacks au cas où tu n’as pas mis les variables dans index.html
const URL  = window.__SUPABASE_URL__  || "https://ctjljqmxjnfykskfgral.supabase.co";
const ANON = window.__SUPABASE_ANON__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4";

/**
 * Client Supabase global (exporté pour app.js)
 */
export const supabase = createClient(URL, ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/**
 * Lance l’OAuth Google en conservant le sous-dossier (GitHub Pages).
 */
export async function signInWithGoogle () {
  const { origin, pathname } = window.location;
  const base = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]+$/, '/');
  const redirectTo = origin + base; // ex: https://username.github.io/hizaya/

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });
}

/**
 * Déconnexion utilisateur.
 */
export const signOut = () => supabase.auth.signOut();

// ————————————————————————————————————————————————————————————
// Propager l’état de session à l’UI (custom event « supabase-auth »)
function emitSession (session, phase = "AUTH_STATE") {
  window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { phase, session } }));
}

supabase.auth.onAuthStateChange((_event, session) => emitSession(session, "AUTH_STATE"));

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  emitSession(session, "INITIAL_SESSION");
  console.log("[auth] state:", session ? "AUTHENTICATED" : "SIGNED_OUT", session);
})();
