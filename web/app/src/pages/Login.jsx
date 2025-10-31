import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import stripOAuth from "../utils/stripOAuth";

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    stripOAuth();

    // Si déjà connecté, on va direct au dashboard
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        navigate("/dashboard", { replace: true });
      }
    });

    // Quand Supabase reçoit la session après OAuth -> redirige
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        navigate("/dashboard", { replace: true });
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, [navigate]);

  async function signInGoogle() {
    setLoading(true);
    try {
      // IMPORTANT: on cible clairement la route #/dashboard (HashRouter)
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
    <div className="pageBg" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="modalCard" style={{ maxWidth: 360 }}>
        <div className="modalHeader">
          <div className="modalTitle">HIZAYA SWITCH</div>
        </div>
        <div className="modalBody">
          <div style={{ color: "var(--text-soft)" }}>Connecte-toi pour accéder au tableau de bord</div>
          <button className="subtleBtn" onClick={signInGoogle} disabled={loading}>
            {loading ? "Redirection…" : "Connexion avec Google"}
          </button>
        </div>
      </div>
    </div>
  );
}
