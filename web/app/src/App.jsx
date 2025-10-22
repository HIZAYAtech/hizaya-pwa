// web/app/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   ENV + client Supabase
   ========================= */
const SUPABASE_URL  = (import.meta?.env?.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON = (import.meta?.env?.VITE_SUPABASE_ANON_KEY || "").trim();

if (typeof window !== "undefined") {
  console.info(
    "[ENV CHECK] VITE_SUPABASE_URL set:",
    !!SUPABASE_URL,
    "/ VITE_SUPABASE_ANON_KEY set:",
    !!SUPABASE_ANON
  );
}

const sb = SUPABASE_URL && SUPABASE_ANON ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

/* =========================
   THEME (light & dark)
   ========================= */
const THEME = {
  light: {
    bg: "#f5f5f7",
    panel: "rgba(255,255,255,0.7)",
    card: "#ffffff",
    stroke: "#e5e5ea",
    fg: "#1d1d1f",
    muted: "#6e6e73",
    chip: "#f2f2f7",
    okBg: "#e8f0ff",
    okFg: "#0a84ff",
    okBorder: "#c8d8ff",
    koBg: "#f2f2f7",
    koFg: "#6e6e73",
    koBorder: "#e5e5ea",
    btn: "#f2f2f7",
    btnHover: "#ececf1",
    blue: "#0a84ff",
    blueMuted: "#5b8dff",
    red: "#ff3b30",
  },
  dark: {
    bg: "#0b0b0f",
    panel: "rgba(16,16,20,0.7)",
    card: "#121217",
    stroke: "#2b2b33",
    fg: "#f5f5f7",
    muted: "#a1a1aa",
    chip: "#1a1a21",
    okBg: "#0b1f3b",
    okFg: "#8ab4ff",
    okBorder: "#1c355b",
    koBg: "#121217",
    koFg: "#a1a1aa",
    koBorder: "#2b2b33",
    btn: "#1a1a21",
    btnHover: "#22222a",
    blue: "#8ab4ff",
    blueMuted: "#6fa0ff",
    red: "#ff6b5e",
  },
};

/* =========================
   Helpers
   ========================= */
const isLive = (d) => !!d?.last_seen && (Date.now() - new Date(d.last_seen).getTime()) < 25_000;
const fmtTS  = (s) => (s ? new Date(s).toLocaleString() : "—");

/* =========================
   UI primitives
   ========================= */
const Badge = ({ ok, t, children }) => (
  <span
    className="text-xs rounded-full border px-2 py-0.5"
    style={{
      background: ok ? t.okBg : t.koBg,
      color: ok ? t.okFg : t.koFg,
      borderColor: ok ? t.okBorder : t.koBorder,
    }}
  >
    {children}
  </span>
);

const Button = ({ tone="default", className="", style:styleProp={}, t, children, ...props }) => {
  const base = "rounded-2xl border text-sm px-3 py-2 transition-colors select-none w-full sm:w-auto";
  const tiny = tone === "tiny";
  const styleTone =
    tone === "primary" ? { background:"transparent", borderColor:t.stroke, color:t.blue } :
    tone === "danger"  ? { background:"transparent", borderColor:t.stroke, color:t.red }  :
    tone === "ghost"   ? { background:"transparent", borderColor:t.stroke, color:t.fg }   :
                         { background:t.btn, borderColor:t.stroke, color:t.fg };
  return (
    <button
      className={[base, tiny ? "px-2 py-1 text-[12px]" : "", className].join(" ")}
      style={{ minHeight: tiny ? 36 : 44, ...styleTone, ...styleProp }}
      {...props}
    >
      {children}
    </button>
  );
};

const Chip = ({ t, children }) => (
  <span
    className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs shrink"
    style={{ background: t.chip, borderColor: t.stroke, maxWidth: "100%", overflow: "hidden" }}
  >
    {children}
  </span>
);

const PowerButton = ({ onPulse, disabled, t }) => {
  const size = typeof window !== "undefined" && window.innerWidth <= 480 ? 64 : 56;
  return (
    <button
      onClick={() => !disabled && onPulse?.()}
      disabled={disabled}
      aria-label="Power pulse"
      className={`group inline-flex items-center justify-center rounded-full ${
        disabled ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
      }`}
      style={{
        width:size, height:size,
        background:t.btn, border:`1px solid ${t.stroke}`,
      }}
    >
      <span className="text-[20px]" style={{ color:t.blue }}>⏻</span>
    </button>
  );
};

/* =========================
   API (Supabase)
   ========================= */
async function sendCmd(masterId, targetMac, action, payload) {
  const { error } = await sb.from("commands").insert({
    master_id: masterId,
    target_mac: targetMac || null,
    action,
    payload
  });
  if (error) throw error;
}
async function deleteDevice(masterId, accessToken) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ master_id: masterId }),
  });
  if (!r.ok) throw new Error(await r.text());
}
async function createPairCode(accessToken) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`, {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      apikey: SUPABASE_ANON,
      Authorization:`Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ttl_minutes:10 }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { code, expires_at }
}

/* =========================
   SLAVE CARD
   ========================= */
const SlaveCard = ({ t, masterId, mac }) => (
  <article className="flex flex-col gap-3 rounded-3xl border p-4" style={{ background:t.card, borderColor:t.stroke }}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <span className="font-semibold" style={{ color:t.blue }}>SLAVE</span>
        <Chip t={t}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ color:t.blue }}>
            ⚙️
          </span>
          <code
            style={{
              fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize:12, maxWidth:"12ch", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
            }}
            title={mac}
          >
            {mac}
          </code>
        </Chip>
      </div>
    </div>

    <div className="relative mx-auto mt-1 flex h-24 w-24 items-center justify-center rounded-full border text-[11px]"
         style={{ borderColor:t.stroke, background:"linear-gradient(180deg, #fafafa, #f2f2f7)" }}>
      PHOTO
      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border"
            style={{ background:t.okFg, borderColor:t.stroke }}/>
    </div>

    <div className="flex justify-center">
      <PowerButton
        t={t}
        onPulse={() => sendCmd(masterId, mac, "POWER_PULSE", { ms:500 }).catch(console.error)}
      />
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Button tone="tiny" t={t} onClick={() => sendCmd(masterId, mac, "RESET", {}).catch(console.error)}>Reset</Button>
      <Button tone="tiny" t={t} onClick={() => sendCmd(masterId, mac, "FORCE_OFF", {}).catch(console.error)}>Off</Button>
      <Button tone="tiny" t={t} onClick={() => sendCmd(masterId, mac, "FORCE_OFF", {}).catch(console.error)}
              style={{ background:"transparent", borderColor:t.stroke, color:t.blue }}>
        Hard Stop
      </Button>
      <Button tone="tiny" t={t} onClick={() => sendCmd(masterId, mac, "HARD_RESET", {}).catch(console.error)}
              style={{ background:"transparent", borderColor:t.stroke, color:t.blueMuted }}>
        Hard Reset
      </Button>
    </div>
  </article>
);

/* =========================
   MASTER CARD
   ========================= */
const MasterCard = ({ t, device, slaves, onRename, onDelete, cmds, onRefreshCmds }) => {
  const live = isLive(device);
  return (
    <section className="flex flex-col gap-4 rounded-3xl border p-4 md:p-6" style={{ background:t.card, borderColor:t.stroke }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <strong className="text-[17px] tracking-wide">{device.name || device.id}</strong>
          <Badge ok={live} t={t}>{live ? "EN LIGNE" : "HORS LIGNE"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button tone="tiny" t={t} onClick={onRename}>Renommer</Button>
          <Button tone="tiny" t={t} onClick={onDelete} style={{ background:"transparent", borderColor:t.stroke, color:t.red }}>
            Supprimer
          </Button>
        </div>
      </div>

      <div className="text-[12px]" style={{ color:t.muted }}>
        ID : <code className="font-mono">{device.id}</code> · MAC : <span style={{ color:t.blue }}>{device.master_mac ?? "—"}</span> · Dernier contact : {fmtTS(device.last_seen)}
      </div>

      {/* SLAVES */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-4">
        {slaves.length ? (
          slaves.map((mac) => (
            <SlaveCard key={mac} t={t} masterId={device.id} mac={mac} />
          ))
        ) : (
          <div className="rounded-3xl border p-6 text-sm" style={{ borderColor:t.stroke, color:t.muted }}>
            Aucun slave enregistré pour ce MASTER.
          </div>
        )}
      </div>

      <div className="h-px" style={{ background:t.stroke }} />

      {/* COMMANDES MASTER */}
      <div className="flex flex-wrap items-center gap-2">
        <Button tone="tiny" t={t}
          onClick={() => sendCmd(device.id, null, "PULSE", { ms:500 }).catch(console.error)}
          style={{ background:"transparent", borderColor:t.stroke, color:t.blue }}>
          ⚡ Pulse 500 ms
        </Button>
        <Button tone="tiny" t={t}
          onClick={() => sendCmd(device.id, null, "POWER_ON", {}).catch(console.error)}
          style={{ background:"transparent", borderColor:t.stroke, color:t.blue }}>
          🔌 Power ON
        </Button>
        <Button tone="tiny" t={t}
          onClick={() => sendCmd(device.id, null, "POWER_OFF", {}).catch(console.error)}
          style={{ background:"transparent", borderColor:t.stroke, color:t.blueMuted }}>
          ⏹️ Power OFF
        </Button>
        <Button tone="tiny" t={t}
          onClick={() => sendCmd(device.id, null, "RESET", {}).catch(console.error)}
          style={{ background:"transparent", borderColor:t.stroke, color:t.blue }}>
          ↻ Reset
        </Button>

        <span className="ml-auto text-xs" style={{ color:t.muted }}>(20 dernières commandes)</span>
        <Button tone="tiny" t={t} onClick={onRefreshCmds}>Rafraîchir</Button>
      </div>

      <ul className="text-[12px]" style={{ color:t.muted }}>
        {(cmds || []).map((c) => (
          <li key={c.id} className="py-0.5">
            <code>{c.status}</code> · {c.action}
            {c.target_mac ? ` → ${c.target_mac}` : " (local)"} · {fmtTS(c.created_at)}
          </li>
        ))}
      </ul>
    </section>
  );
};

/* =========================
   ENV ERROR
   ========================= */
function EnvError(){
  const missUrl  = !SUPABASE_URL;
  const missAnon = !SUPABASE_ANON;
  return (
    <div style={{
      minHeight:"100vh", display:"grid", placeItems:"center",
      background:"#0b0b0f", color:"#f5f5f7",
      fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, Arial"
    }}>
      <div style={{maxWidth:720, padding:24, border:"1px solid #2b2b33", borderRadius:16, background:"#121217"}}>
        <h2 style={{marginTop:0}}>Configuration manquante</h2>
        <p>Définis les variables d’environnement Vite (au moment du build) :</p>
        <ul>
          {missUrl  && <li><code>VITE_SUPABASE_URL</code></li>}
          {missAnon && <li><code>VITE_SUPABASE_ANON_KEY</code></li>}
        </ul>
        <pre style={{whiteSpace:"pre-wrap"}}>{`VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</pre>
      </div>
    </div>
  );
}

/* =========================
   ERROR BOUNDARY
   ========================= */
class AppErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error:null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error("App crash:", error, info); }
  render(){
    if (this.state.error) {
      return (
        <div style={{
          minHeight:"100vh", display:"grid", placeItems:"center",
          background:"#0b0b0f", color:"#f5f5f7",
          fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, Arial"
        }}>
          <div style={{maxWidth:720, padding:24, border:"1px solid #2b2b33", borderRadius:16, background:"#121217"}}>
            <h2 style={{marginTop:0}}>Oups, une erreur est survenue</h2>
            <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error?.message || this.state.error)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================
   APP (connected)
   ========================= */
function AppInner(){
  // Theme (single declaration)
  const prefersDark = typeof window !== "undefined"
    && window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [isDark, setIsDark] = useState(prefersDark);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e) => setIsDark(e.matches);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h);
  }, []);
  const t = isDark ? THEME.dark : THEME.light;
  const frame = useMemo(() => ({ background:t.bg, color:t.fg, borderColor:t.stroke }), [t]);

  // Auth
  const [email, setEmail] = useState(null);
  useEffect(() => {
    const sub = sb.auth.onAuthStateChange((_e, session) => setEmail(session?.user?.email ?? null));
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // Data
  const [devices, setDevices] = useState([]);
  const [nodesByMaster, setNodesByMaster] = useState({});
  const [cmdsByMaster, setCmdsByMaster] = useState({});
  const [pairInfo, setPairInfo] = useState(null);

  // Initial load + realtime
  useEffect(() => {
    if (!email) return;
    const loadAll = async () => {
      const { data: devs, error: ed } = await sb
        .from("devices")
        .select("id,name,master_mac,last_seen,online")
        .order("created_at", { ascending:false });
      if (!ed && devs) setDevices(devs);

      const { data: nodes, error: en } = await sb
        .from("nodes")
        .select("master_id,slave_mac");
      if (!en && nodes) {
        const m = {};
        nodes.forEach((n) => { (m[n.master_id] ??= []).push(n.slave_mac); });
        setNodesByMaster(m);
      }

      if (devs && devs.length) {
        const map = {};
        for (const d of devs) {
          const { data, error } = await sb
            .from("commands")
            .select("id,master_id,action,target_mac,status,created_at")
            .eq("master_id", d.id)
            .order("created_at", { ascending:false })
            .limit(20);
          if (!error && data) map[d.id] = data;
        }
        setCmdsByMaster(map);
      }
    };
    loadAll();

    const chDevices = sb.channel("rt:devices")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"devices" }, (p) => {
        setDevices((cur) => [p.new, ...cur]);
      })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"devices" }, (p) => {
        setDevices((cur) => cur.map((d) => d.id === p.new.id ? { ...d, ...p.new } : d));
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"devices" }, (p) => {
        setDevices((cur) => cur.filter((d) => d.id !== p.old.id));
        setNodesByMaster((m) => { const n = { ...m }; delete n[p.old.id]; return n; });
        setCmdsByMaster((m) => { const n = { ...m }; delete n[p.old.id]; return n; });
      })
      .subscribe();

    const chNodes = sb.channel("rt:nodes")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"nodes" }, (p) => {
        setNodesByMaster((cur) => {
          const n = { ...cur };
          (n[p.new.master_id] ??= []).push(p.new.slave_mac);
          return n;
        });
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"nodes" }, (p) => {
        setNodesByMaster((cur) => {
          const n = { ...cur };
          n[p.old.master_id] = (n[p.old.master_id] ?? []).filter((m) => m !== p.old.slave_mac);
          return n;
        });
      })
      .subscribe();

    const chCmds = sb.channel("rt:commands")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"commands" }, (p) => {
        const c = p.new;
        setCmdsByMaster((cur) => {
          const list = [c, ...(cur[c.master_id] ?? [])].slice(0, 20);
          return { ...cur, [c.master_id]: list };
        });
      })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"commands" }, (p) => {
        const c = p.new;
        setCmdsByMaster((cur) => {
          const list = (cur[c.master_id] ?? []).map((x) => (x.id === c.id ? c : x));
          return { ...cur, [c.master_id]: list };
        });
      })
      .subscribe();

    return () => {
      sb.removeChannel(chDevices);
      sb.removeChannel(chNodes);
      sb.removeChannel(chCmds);
    };
  }, [email]);

  // Actions top-bar
  const onLogin = async () => {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
    });
    if (error) alert(error.message);
    else if (data?.url) window.location.href = data.url;
  };
  const onLogout = async () => { await sb.auth.signOut(); };
  const onAddMaster = async () => {
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) { alert("Non connecté"); return; }
    try {
      const { code, expires_at } = await createPairCode(s.session.access_token);
      setPairInfo({ code: String(code).padStart(6, "0"), expiresAt: new Date(expires_at).getTime() });
    } catch (e) { alert(e.message ?? String(e)); }
  };
  const handleDelete = async (deviceId) => {
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) { alert("Non connecté"); return; }
    if (!confirm(`Supprimer ${deviceId} ?`)) return;
    try { await deleteDevice(deviceId, s.session.access_token); }
    catch (e) { alert(e.message ?? String(e)); }
  };
  const refreshCmds = async (masterId) => {
    const { data, error } = await sb
      .from("commands")
      .select("id,master_id,action,target_mac,status,created_at")
      .eq("master_id", masterId)
      .order("created_at", { ascending:false })
      .limit(20);
    if (!error && data) setCmdsByMaster((cur) => ({ ...cur, [masterId]: data }));
  };

  // Pair-code count-down
  const pairCountdown = pairInfo && Math.max(0, Math.floor((pairInfo.expiresAt - Date.now()) / 1000));

  return (
    <div
      className="min-h-screen"
      style={{
        background: frame.background,
        color: frame.color,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Segoe UI, Roboto, Arial, Helvetica, sans-serif",
      }}
    >
      <header className="sticky top-0 z-10 backdrop-blur-md border-b px-4 md:px-6 py-4"
              style={{ background:t.panel, borderColor:t.stroke }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 flex-wrap">
          <h1 className="m-0 text-[18px] tracking-wide">REMOTE POWER</h1>
          <div className="flex items-center gap-2 text-xs" style={{ color:t.muted }}>
            <span>{email ?? "non connecté"}</span>
            <Button tone="ghost" t={t} onClick={() => window.matchMedia && setIsDark((d)=>!d)}>
              {isDark ? "Mode clair" : "Mode sombre"}
            </Button>
            {email ? (
              <Button tone="ghost" t={t} onClick={onLogout}>Déconnexion</Button>
            ) : (
              <Button tone="primary" t={t} onClick={onLogin}>Connexion Google</Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color:t.muted }}>
            {email ? "Connecté" : "Veuillez vous connecter pour gérer vos MASTERs."}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button tone="primary" className="sm:w-auto" t={t} onClick={onAddMaster}>
              Ajouter un MASTER
            </Button>
            <Button t={t} onClick={() => window.location.reload()}>Rafraîchir</Button>
          </div>
        </div>

        {pairInfo && (
          <section className="rounded-3xl border p-4" style={{ background:t.card, borderColor:t.stroke }}>
            <div className="flex items-center justify-between">
              <div>
                <div>Code d’appairage : <strong style={{ color:t.blue }}>{pairInfo.code}</strong></div>
                <div className="text-xs" style={{ color:t.muted }}>
                  Expire dans {Math.floor(pairCountdown / 60)}:{String(pairCountdown % 60).padStart(2, "0")}
                </div>
              </div>
              <Button t={t} onClick={() => setPairInfo(null)}>Fermer</Button>
            </div>
            <div className="text-xs mt-2" style={{ color:t.muted }}>
              Entrez ce code dans le portail Wi-Fi de l’ESP32.
            </div>
          </section>
        )}

        {/* LISTE MASTERS */}
        <div className="grid gap-4">
          {devices.map((d) => (
            <MasterCard
              key={d.id}
              t={t}
              device={d}
              slaves={(nodesByMaster[d.id] ?? [])}
              onRename={() => alert("Renommer (à brancher)")}
              onDelete={() => handleDelete(d.id)}
              onRefreshCmds={() => refreshCmds(d.id)}
              cmds={cmdsByMaster[d.id] ?? []}
            />
          ))}
          {!devices.length && (
            <div className="rounded-3xl border p-6 text-sm" style={{ background:t.card, borderColor:t.stroke, color:t.muted }}>
              Aucun MASTER.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* =========================
   EXPORT
   ========================= */
export default function App(){
  if (!sb) return <EnvError />;
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
