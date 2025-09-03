/* supabase-auth.js — HIZAYA
 * Initialise le client Supabase (v2) et expose un petit helper d’auth:
 *   - window.sb       → client Supabase
 *   - window.hzAuth   → { loginWithGoogle, loginWithEmail, logout }
 * Emet un event global "supabase-auth" avec { session } à chaque changement.
 *
 * Pré-requis dans index.html:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script>
 *     window.__CFG__ = {
 *       SUPABASE_URL: "https://<project-ref>.supabase.co",
 *       SUPABASE_ANON_KEY: "<ANON_KEY>"
 *     };
 *   </script>
 */

(function(){
  const CFG = window.__CFG__ || {};
  if(!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY){
    console.error("[supabase-auth] Manque SUPABASE_URL / SUPABASE_ANON_KEY dans window.__CFG__");
  }

  // Client Supabase global
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // gère automatiquement le retour OAuth (code dans l’URL)
      storageKey: "hizaya-auth"
    }
  });
  window.sb = sb;

  // Dispatch util
  function dispatchAuth(session){
    window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
  }

  // Nettoyage de l’URL après retour OAuth / magic link (pour éviter ?code=... & error=...)
  function cleanUrl(){
    try{
      const url = new URL(window.location.href);
      const paramsToStrip = ["code", "error", "error_description"];
      let changed = false;
      paramsToStrip.forEach(k=>{
        if(url.searchParams.has(k)){ url.searchParams.delete(k); changed = true; }
      });
      if(changed){
        history.replaceState({}, document.title, url.pathname + (url.search ? "?"+url.searchParams.toString() : "") + url.hash);
      }
    }catch(e){}
  }

  // Redirection de retour (doit matcher l’URL autorisée sur ton projet Supabase)
  // → sur GitHub Pages, inclure le chemin du repo (origin + pathname)
  function getRedirectUrl(){
    return window.location.origin + window.location.pathname;
  }

  // Expose helpers d’auth
  window.hzAuth = {
    async loginWithGoogle(){
      try{
        const { error } = await sb.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: getRedirectUrl(),
            queryParams: {
              // optionnels, utiles si tu veux forcer le refresh token Google
              // access_type: "offline",
              // prompt: "consent"
            }
          }
        });
        if(error) throw error;
        // Redirection automatique vers Google, puis retour ici.
      }catch(e){
        console.error("[supabase-auth] Google error:", e);
        alert("Connexion Google impossible: " + (e.message||e));
      }
    },

    async loginWithEmail(email){
      try{
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: getRedirectUrl() }
        });
        if(error) throw error;
        // Un mail est envoyé. Au clic, Supabase revient ici et finalise la session.
      }catch(e){
        console.error("[supabase-auth] OTP error:", e);
        alert("Connexion par email impossible: " + (e.message||e));
      }
    },

    async logout(){
      try{
        const { error } = await sb.auth.signOut();
        if(error) throw error;
      }catch(e){
        console.error("[supabase-auth] logout error:", e);
        alert("Déconnexion impossible: " + (e.message||e));
      }
    }
  };

  // 1) Session initiale (après que Supabase ait traité un éventuel code OAuth)
  sb.auth.getSession().then(({ data:{ session }, error })=>{
    if(error) console.warn("[supabase-auth] getSession:", error.message);
    // Si Supabase renvoie des erreurs dans l’URL:
    const url = new URL(window.location.href);
    if(url.searchParams.get("error_description")){
      alert("Auth error: " + url.searchParams.get("error_description"));
    }
    cleanUrl(); // enlève ?code=... etc.
    dispatchAuth(session||null);
    console.log("[supabase-auth] OK");
  });

  // 2) Écoute temps réel des changements (login/logout/refresh)
  sb.auth.onAuthStateChange((event, session)=>{
    // event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | ...
    dispatchAuth(session||null);
  });

})();
