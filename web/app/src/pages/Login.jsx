import React from "react";
import supabase from "../supabaseClient";

export default function Login() {
  const [loading, setLoading] = React.useState(false);

  async function signInGoogle() {
    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.href,
          queryParams: { prompt: "select_account" }
        }
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginTitle">HIZAYA SWITCH</div>
        <div className="loginSub">Connecte-toi pour accéder au tableau de bord</div>
        <button className="subtleBtn" onClick={signInGoogle} disabled={loading}>
          {loading ? "Redirection…" : "Connexion avec Google"}
        </button>
      </div>
    </div>
  );
}
