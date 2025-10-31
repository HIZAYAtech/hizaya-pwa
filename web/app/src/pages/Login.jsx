import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import stripOAuth from "../utils/stripOAuth";

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);

  // Au chargement : on nettoie l’URL et si une session existe déjà, on bascule
  useEffect(() => {
    stripOAuth();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) navigate("/dashboard", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) navigate("/dashboard", { replace: true });
    });
    return () => sub?.subscription?.unsubscribe();
  }, [navigate]);

  async function signInGoogle() {
    setLoading(true);
    try {
      // IMPORTANT: en HashRouter, on cible explicitement #/dashboard
      const back = `${location.origin}${location.pathname}#/dashboard`;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: back, queryParams: { prompt: "select_account" } },
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
