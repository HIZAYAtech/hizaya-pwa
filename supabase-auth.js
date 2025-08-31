/* supabase-auth.js — plain JS (UMD) */

(function () {
const url = window.__https://ctjljqmxjnfykskfgral.supabase.co__;
const anon = window.__eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4__;

  if(!url || !anon){
    console.error("Supabase config missing: __SUPABASE_URL__ / __SUPABASE_ANON_KEY__");
    return;
  }

  // La librairie UMD fournit window.supabase avec createClient()
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase JS not loaded. Add the CDN script before supabase-auth.js");
    return;
  }

  // Crée le client et remplace le namespace par l’instance (pratique pour app.js)
  window.supabase = window.supabase.createClient(url, anon);

  // Expose quelques helpers pour app.js
  window.hzAuth = {
    async loginWithGoogle() {
      const redirectTo = location.origin + location.pathname; // ex: https://.../hizaya-pwa/ (ou /index.html)
      await window.supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
    },
    async logout() {
      await window.supabase.auth.signOut();
    }
  };

  // Relaye les changements de session vers app.js
  window.supabase.auth.onAuthStateChange((_event, session) => {
    window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
  });
})();
