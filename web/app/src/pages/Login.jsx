
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function LoginPage() {
  async function handleLogin() {
    // Très important pour GitHub Pages + HashRouter : on renvoie vers "#/"
    const base = `${location.origin}${location.pathname}#/`;
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: base,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <h1 className="loginTitle">HIZAYA SWITCH</h1>
        <p className="loginSub">Connecte-toi pour accéder au tableau de bord</p>
        <button className="subtleBtn" onClick={handleLogin}>
          Connexion Google
        </button>
      </div>
    </div>
  );
}
