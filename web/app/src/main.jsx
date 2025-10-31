import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { sb, stripOAuthParams } from "./supabase";
import Login from "./Login.jsx";
import App from "./App.jsx";
import "./styles.css";

// Route guard basique : attend la session, puis autorise ou redirige vers /login
function RequireAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data } = await sb.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setReady(true);
      stripOAuthParams();
    }

    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      stripOAuthParams();
      setReady(true);
    });

    boot();

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  if (!ready) return <div className="bootScreen">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <App />
            </RequireAuth>
          }
        />
        {/* Par défaut, on va sur /app (Protected). Si pas loggé → redirigé vers /login) */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </HashRouter>
  </StrictMode>
);
