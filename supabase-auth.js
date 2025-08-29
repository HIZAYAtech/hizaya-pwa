import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = https://ctjljqmxjnfykskfgral.supabase.co__;
const anon = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amxqcW14am5meWtza2ZncmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzQzMDMsImV4cCI6MjA3MjA1MDMwM30.GoLM8CSHRh2KWOmrMLk2-JkFMz2hwAqyHaHxd8T51M4__;
if(!url || !anon){
  console.error("Supabase URL/Anon Key manquants. Renseigne __SUPABASE_URL__/__SUPABASE_ANON_KEY__ dans index.html");
}

const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Expose global
window.supabase = supabase;

// Propager l’état au reste de l’app
supabase.auth.onAuthStateChange((_event, session) => {
  window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
});

// Utilitaires globaux
window.hzAuth = {
  async getSession(){
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },
  async loginWithGoogle(){
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if(error) alert("Erreur Google OAuth: " + error.message);
  },
  async logout(){
    await supabase.auth.signOut();
  }
};
