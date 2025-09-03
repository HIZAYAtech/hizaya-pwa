/* supabase-auth.js – UMD, sans modules, FR */
(function () {
  const PUBLIC_CONFIG_FN =
    "https://ctjljqmxjnfykskfgral.functions.supabase.co/public_config"; // ← adapte si besoin

  async function getConfig() {
    const url  = window.__SUPABASE_URL__ || "";
    const anon = window.__SUPABASE_ANON_KEY__ || "";
    if (url && anon) return { supabaseUrl: url, supabaseAnonKey: anon, mqttWssUrl: window.__MQTT_WSS_URL__ || "" };

    // fallback: Edge Function
    const r = await fetch(PUBLIC_CONFIG_FN);
    if (!r.ok) throw new Error("public_config: " + (await r.text()));
    const cfg = await r.json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("public_config: champs manquants");
    if (cfg.mqttWssUrl) window.__MQTT_WSS_URL__ = cfg.mqttWssUrl;
    return { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey, mqttWssUrl: cfg.mqttWssUrl || "" };
  }

  (async () => {
    try {
      const { supabaseUrl, supabaseAnonKey } = await getConfig();
      window.supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

      window.hzAuth = {
        async loginWithGoogle() {
          const { error } = await window.supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin + window.location.pathname }
          });
          if (error) alert(error.message);
        },
        async logout() {
          await window.supabase.auth.signOut();
          window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session: null } }));
        }
      };

      window.supabase.auth.onAuthStateChange((_e, session) => {
        window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));
      });
      const { data: { session } } = await window.supabase.auth.getSession();
      window.dispatchEvent(new CustomEvent("supabase-auth", { detail: { session } }));

      console.log("[supabase-auth] OK");
    } catch (e) {
      console.error("[supabase-auth] erreur:", e);
      alert("Erreur d'initialisation Supabase (voir console).");
    }
  })();
})();
