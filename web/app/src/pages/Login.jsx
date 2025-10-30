

export default function Login() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      // Nettoie l’URL (évite 404 post-OAuth)
      stripOAuthParams();

      // Si déjà connecté → hop vers /app
      const { data } = await sb.auth.getSession();
      if (!mounted) return;
      if (data.session?.user) {
        navigate("/app", { replace: true });
      }
      setAuthReady(true);
    }

    const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;
      if (session?.user) {
        navigate("/app", { replace: true });
      }
    });

    boot();
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [navigate]);

  async function handleLogin() {
    // Après Google, on revient directement sur /app (route du dashboard)
    const redirectTo = window.location.origin + "/app";
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#fff" }}>
        Chargement…
      </div>
    );
  }

  return (
    <div className="pageBg" style={{ minHeight: "100vh" }}>
      <div className="pageContent" style={{ maxWidth: 420, width: "100%" }}>
        <div
          className="groupsSection"
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>HIZAYA SWITCH</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: -4 }}>Connexion</div>

          <button className="subtleBtn" style={{ marginTop: 8, height: 42 }} onClick={handleLogin}>
            Connexion avec Google
          </button>

          <div className="smallText" style={{ marginTop: 8 }}>
            Vous serez redirigé automatiquement après connexion.
          </div>
        </div>
      </div>
    </div>
  );
}
