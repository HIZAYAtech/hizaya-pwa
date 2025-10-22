// App.tsx (ou app/page.tsx pour Next.js)
import React, { useEffect, useMemo, useState } from "react";
import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/* =========================
   CONFIG SUPABASE (env)
   ========================= */
const SUPABASE_URL =
  import.meta?.env?.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "";
const SUPABASE_ANON =
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON);

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
    blue: "#007aff",
    red: "#ff3b30",
    txtBlueStrong: "#0a84ff",
    txtBlue: "#0a84ff",
    txtBlueMuted: "#5b8dff",
    txtRed: "#ff3b30",
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
    blue: "#4ba3ff",
    red: "#ff6b5e",
    txtBlueStrong: "#8ab4ff",
    txtBlue: "#8ab4ff",
    txtBlueMuted: "#6fa0ff",
    txtRed: "#ff6b5e",
  },
};

/* =========================
   Types simples
   ========================= */
type Device = {
  id: string;
  name: string | null;
  master_mac: string | null;
  last_seen: string | null;
  online?: boolean | null;
};
type NodeRow = { master_id: string; slave_mac: string };
type CommandRow = {
  id: string;
  master_id: string;
  action: string;
  target_mac: string | null;
  status: string;
  created_at: string;
};

const isLive = (d: Device) =>
  !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 25_000;

/* =========================
   UI primitives
   ========================= */
const Badge: React.FC<{ ok: boolean; t: any }> = ({ ok, t, children }) => (
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

const Button: React.FC<{
  tone?: "default" | "primary" | "danger" | "ghost" | "tiny";
  className?: string;
  style?: React.CSSProperties;
  t: any;
  onClick?: () => void;
}> = ({ tone = "default", className = "", style = {}, t, children, ...props }) => {
  const base =
    "rounded-2xl border text-sm px-3 py-2 transition-colors select-none w-full sm:w-auto";
  const tiny = tone === "tiny";
  const toneStyle =
    tone === "primary"
      ? { background: "transparent", borderColor: t.stroke, color: t.txtBlue }
      : tone === "danger"
      ? { background: "transparent", borderColor: t.stroke, color: t.txtRed }
      : tone === "ghost"
      ? { background: "transparent", borderColor: t.stroke, color: t.fg }
      : { background: t.btn, borderColor: t.stroke, color: t.fg };
  return (
    <button
      className={[base, tiny ? "px-2 py-1 text-[12px]" : "", className].join(" ")}
      style={{ minHeight: tiny ? 36 : 44, ...toneStyle, ...style }}
      {...props}
    >
      {children}
    </button>
  );
};

const Chip: React.FC<{ t: any }> = ({ t, children }) => (
  <span
    className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs shrink"
    style={{ background: t.chip, borderColor: t.stroke, maxWidth: "100%", overflow: "hidden" }}
  >
    {children}
  </span>
);

const PowerButton: React.FC<{ onPulse: () => void; disabled?: boolean; t: any }> = ({
  onPulse,
  disabled,
  t,
}) => {
  const size =
    typeof window !== "undefined" && window.innerWidth <= 480 ? 64 : 56;
  return (
    <button
      onClick={() => !disabled && onPulse()}
      disabled={disabled}
      aria-label="Power pulse"
      className={`group inline-flex items-center justify-center rounded-full ${
        disabled ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
      }`}
      style={{
        width: size,
        height: size,
        background: t.btn,
        border: `1px solid ${t.stroke}`,
      }}
    >
      <span className="text-[20px] leading-none" style={{ color: t.txtBlue }}>
        ⏻
      </span>
    </button>
  );
};

/* =========================
   API Helpers
   ========================= */
async function sendCmd(masterId: string, targetMac: string | null, action: string, payload: any) {
  const { error } = await sb.from("commands").insert({
    master_id: masterId,
    target_mac: targetMac,
    action,
    payload,
  });
  if (error) throw error;
}

async function deleteDevice(masterId: string, accessToken: string) {
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

async function createPairCode(accessToken: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ttl_minutes: 10 }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ code: number; expires_at: string }>;
}

/* =========================
   SLAVE CARD (stateless UI)
   ========================= */
const SlaveCard: React.FC<{
  t: any;
  masterId: string;
  mac: string;
  onPulse: () => void;
  onReset: () => void;
  onHardStop: () => void;
  onHardReset: () => void;
}> = ({ t, mac, onPulse, onReset, onHardStop, onHardReset }) => (
  <article
    className="flex flex-col gap-3 rounded-3xl border p-4"
    style={{ background: t.card, borderColor: t.stroke }}
  >
    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
      <span className="font-semibold" style={{ color: t.txtBlue }}>
        SLAVE
      </span>
      <Chip t={t}>
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: "transparent", color: t.txtBlue }}
        >
          ⚙️
        </span>
        <code
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            maxWidth: "12ch",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={mac}
        >
          {mac}
        </code>
      </Chip>
    </div>

    {/* power pulse */}
    <div className="flex justify-center">
      <PowerButton t={t} onPulse={onPulse} />
    </div>

    {/* actions */}
    <div className="grid grid-cols-2 gap-2">
      <Button tone="tiny" t={t} onClick={onReset}>
        Reset
      </Button>
      <Button tone="tiny" t={t} onClick={onHardStop}>
        Off (force)
      </Button>
      <Button
        tone="tiny"
        t={t}
        onClick={onHardStop}
        style={{ background: "transparent", borderColor: t.stroke, color: t.txtBlue }}
      >
        Hard Stop
      </Button>
      <Button
        tone="tiny"
        t={t}
        onClick={onHardReset}
        style={{ background: "transparent", borderColor: t.stroke, color: t.txtBlueMuted }}
      >
        Hard Reset
      </Button>
    </div>
  </article>
);

/* =========================
   MASTER CARD (données réelles)
   ========================= */
const MasterCard: React.FC<{
  t: any;
  device: Device;
  slaves: string[];
  onRename: () => void;
  onDelete: () => void;
  onRefreshCmds: () => void;
  cmds: CommandRow[];
}> = ({ t, device, slaves, onRename, onDelete, onRefreshCmds, cmds }) => {
  const live = isLive(device);

  return (
    <section
      className="flex flex-col gap-4 rounded-3xl border p-4 md:p-6"
      style={{ background: t.card, borderColor: t.stroke }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <strong className="text-[17px] tracking-wide">
            {device.name || device.id}
          </strong>
          <Badge ok={live} t={t}>
            {live ? "EN LIGNE" : "HORS LIGNE"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button tone="tiny" t={t} onClick={onRename}>
            Renommer
          </Button>
          <Button
            tone="tiny"
            t={t}
            onClick={onDelete}
            style={{ background: "transparent", borderColor: t.stroke, color: t.txtRed }}
          >
            Supprimer
          </Button>
        </div>
      </div>

      <div className="text-[12px]" style={{ color: t.muted }}>
        ID : <code className="font-mono">{device.id}</code> · MAC :{" "}
        <span style={{ color: t.txtBlue }}>{device.master_mac ?? "—"}</span> · Dernier
        contact : {device.last_seen ? new Date(device.last_seen).toLocaleString() : "jamais"}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-4">
        {slaves.length ? (
          slaves.map((mac) => (
            <SlaveCard
              key={mac}
              t={t}
              masterId={device.id}
              mac={mac}
              onPulse={() => sendCmd(device.id, mac, "POWER_PULSE", { ms: 500 }).catch(console.error)}
              onReset={() => sendCmd(device.id, mac, "RESET", {}).catch(console.error)}
              onHardStop={() => sendCmd(device.id, mac, "FORCE_OFF", {}).catch(console.error)}
              onHardReset={() => sendCmd(device.id, mac, "HARD_RESET", {}).catch(console.error)}
            />
          ))
        ) : (
          <div
            className="rounded-3xl border p-6 text-sm"
            style={{ borderColor: t.stroke, color: t.muted }}
          >
            Aucun slave enregistré pour ce MASTER.
          </div>
        )}
      </div>

      <div className="h-px" style={{ background: t.stroke }} />

      {/* Actions locales (master) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="tiny"
          t={t}
          onClick={() => sendCmd(device.id, null, "PULSE", { ms: 500 }).catch(console.error)}
          style={{ background: "transparent", borderColor: t.stroke, color: t.txtBlue }}
        >
          ⚡ Pulse 500 ms
        </Button>
        <Button
          tone="tiny"
          t={t}
          onClick={() => sendCmd(device.id, null, "POWER_ON", {}).catch(console.error)}
          style={{ background: "transparent", borderColor: t.stroke, color: t.txtBlueStrong }}
        >
          🔌 Power ON
        </Button>
        <Button
          tone="tiny"
          t={t}
          onClick={() => sendCmd(device.id, null, "POWER_OFF", {}).catch(console.error)}
          style={{ background: "transparent", borderColor: t.stroke, color: t.txtBlueMuted }}
        >
          ⏹️ Power OFF
        </Button>
        <Button
          tone="tiny"
          t={t}
          onClick={() => sendCmd(device.id, null, "RESET", {}).catch(console.error)}
          style={{ background: "transparent", borderColor: t.stroke, color: t.txtBlue }}
        >
          ↻ Reset
        </Button>

        <span className="ml-auto text-xs" style={{ color: t.muted }}>
          (20 dernières commandes)
        </span>
        <Button tone="tiny" t={t} onClick={onRefreshCmds}>
          Rafraîchir
        </Button>
      </div>

      {/* Liste commandes */}
      <ul className="text-[12px]" style={{ color: t.muted }}>
        {cmds.map((c) => (
          <li key={c.id} className="py-0.5">
            <code>{c.status}</code> · {c.action}
            {c.target_mac ? ` → ${c.target_mac}` : " (local)"} ·{" "}
            {new Date(c.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
};

/* =========================
   PAGE PRINCIPALE
   ========================= */
export default function App() {
  // Thème
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [isDark, setIsDark] = useState(prefersDark);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
    return () =>
      mq.removeEventListener
        ? mq.removeEventListener("change", handler)
        : mq.removeListener(handler);
  }, []);
  const t = isDark ? THEME.dark : THEME.light;
  const frame = useMemo(
    () => ({ background: t.bg, color: t.fg, borderColor: t.stroke }),
    [t]
  );

  // Auth
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const sub = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // Data
  const [devices, setDevices] = useState<Device[]>([]);
  const [nodesByMaster, setNodesByMaster] = useState<Record<string, string[]>>({});
  const [cmdsByMaster, setCmdsByMaster] = useState<Record<string, CommandRow[]>>({});
  const [pairInfo, setPairInfo] = useState<{ code: string; expiresAt: number } | null>(null);

  // Realtime channels
  useEffect(() => {
    if (!email) return;

    // Initial load
    const loadAll = async () => {
      const { data: devs, error: ed } = await sb
        .from("devices")
        .select("id,name,master_mac,last_seen,online")
        .order("created_at", { ascending: false });
      if (!ed && devs) setDevices(devs);

      const { data: nodes, error: en } = await sb
        .from("nodes")
        .select("master_id,slave_mac");
      if (!en && nodes) {
        const m: Record<string, string[]> = {};
        nodes.forEach((n) => {
          (m[n.master_id] ??= []).push(n.slave_mac);
        });
        setNodesByMaster(m);
      }

      // Load latest commands per master (20)
      if (devs && devs.length) {
        const map: Record<string, CommandRow[]> = {};
        for (const d of devs) {
          const { data, error } = await sb
            .from("commands")
            .select("id,master_id,action,target_mac,status,created_at")
            .eq("master_id", d.id)
            .order("created_at", { ascending: false })
            .limit(20);
          if (!error && data) map[d.id] = data;
        }
        setCmdsByMaster(map);
      }
    };
    loadAll();

    // Devices realtime
    const chDevices: RealtimeChannel = sb
      .channel("rt:devices")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "devices" }, (p) => {
        setDevices((cur) => [p.new as Device, ...cur]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "devices" }, (p) => {
        setDevices((cur) => cur.map((d) => (d.id === p.new.id ? { ...d, ...(p.new as any) } : d)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "devices" }, (p) => {
        setDevices((cur) => cur.filter((d) => d.id !== p.old.id));
        setNodesByMaster((m) => {
          const n = { ...m };
          delete n[p.old.id];
          return n;
        });
        setCmdsByMaster((m) => {
          const n = { ...m };
          delete n[p.old.id];
          return n;
        });
      })
      .subscribe();

    // Nodes realtime
    const chNodes: RealtimeChannel = sb
      .channel("rt:nodes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nodes" }, (p) => {
        setNodesByMaster((cur) => {
          const n = { ...cur };
          (n[p.new.master_id] ??= []).push(p.new.slave_mac);
          return n;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "nodes" }, (p) => {
        setNodesByMaster((cur) => {
          const n = { ...cur };
          n[p.old.master_id] = (n[p.old.master_id] ?? []).filter((m) => m !== p.old.slave_mac);
          return n;
        });
      })
      .subscribe();

    // Commands realtime
    const chCmds: RealtimeChannel = sb
      .channel("rt:commands")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commands" }, (p) => {
        const c = p.new as CommandRow;
        setCmdsByMaster((cur) => {
          const list = [c, ...(cur[c.master_id] ?? [])].slice(0, 20);
          return { ...cur, [c.master_id]: list };
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "commands" }, (p) => {
        const c = p.new as CommandRow;
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

  // Actions top bar
  const onLogin = async () => {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
    });
    if (error) alert(error.message);
    else if (data?.url) window.location.href = data.url;
  };
  const onLogout = async () => {
    await sb.auth.signOut();
  };
  const onAddMaster = async () => {
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) {
      alert("Non connecté");
      return;
    }
    try {
      const { code, expires_at } = await createPairCode(s.session.access_token);
      setPairInfo({
        code: String(code).padStart(6, "0"),
        expiresAt: new Date(expires_at).getTime(),
      });
    } catch (e: any) {
      alert(e.message ?? String(e));
    }
  };

  // Suppression
  const handleDelete = async (deviceId: string) => {
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) {
      alert("Non connecté");
      return;
    }
    if (!confirm(`Supprimer ${deviceId} ?`)) return;
    try {
      await deleteDevice(deviceId, s.session.access_token);
    } catch (e: any) {
      alert(e.message ?? String(e));
    }
  };

  // Rafraîchir dernières commandes d’un master
  const refreshCmds = async (masterId: string) => {
    const { data, error } = await sb
      .from("commands")
      .select("id,master_id,action,target_mac,status,created_at")
      .eq("master_id", masterId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setCmdsByMaster((cur) => ({ ...cur, [masterId]: data }));
  };

  // Pair-code countdown
  const pairCountdown =
    pairInfo &&
    Math.max(0, Math.floor((pairInfo.expiresAt - Date.now()) / 1000));

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
      <header
        className="sticky top-0 z-10 backdrop-blur-md border-b px-4 md:px-6 py-4"
        style={{ background: t.panel, borderColor: t.stroke }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 flex-wrap">
          <h1 className="m-0 text-[18px] tracking-wide">REMOTE POWER</h1>
          <div className="flex items-center gap-2 text-xs" style={{ color: t.muted }}>
            <span>{email ?? "non connecté"}</span>
            <Button tone="ghost" t={t} onClick={() => setIsDark((d) => !d)}>
              {isDark ? "Mode clair" : "Mode sombre"}
            </Button>
            {email ? (
              <Button tone="ghost" t={t} onClick={onLogout}>
                Déconnexion
              </Button>
            ) : (
              <Button tone="primary" t={t} onClick={onLogin}>
                Connexion Google
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: t.muted }}>
            {email ? "Connecté" : "Veuillez vous connecter pour gérer vos MASTERs."}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button tone="primary" className="sm:w-auto" t={t} onClick={onAddMaster}>
              Ajouter un MASTER
            </Button>
            <Button t={t} onClick={() => window.location.reload()}>
              Rafraîchir
            </Button>
          </div>
        </div>

        {/* Pair dialog (simple inline card) */}
        {pairInfo && (
          <section
            className="rounded-3xl border p-4"
            style={{ background: t.card, borderColor: t.stroke }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div>Code d’appairage : <strong style={{ color: t.txtBlue }}>{pairInfo.code}</strong></div>
                <div className="text-xs" style={{ color: t.muted }}>
                  Expire dans {Math.floor(pairCountdown! / 60)}:
                  {String(pairCountdown! % 60).padStart(2, "0")}
                </div>
              </div>
              <Button t={t} onClick={() => setPairInfo(null)}>
                Fermer
              </Button>
            </div>
            <div className="text-xs mt-2" style={{ color: t.muted }}>
              Entrez ce code dans le portail Wi-Fi de l’ESP32.
            </div>
          </section>
        )}

        {/* Masters grid */}
        <div className="grid gap-4">
          {devices.map((d) => (
            <MasterCard
              key={d.id}
              t={t}
              device={d}
              slaves={nodesByMaster[d.id] ?? []}
              onRename={() => alert("Renommer (UI à brancher)")}
              onDelete={() => handleDelete(d.id)}
              onRefreshCmds={() => refreshCmds(d.id)}
              cmds={cmdsByMaster[d.id] ?? []}
            />
          ))}
          {!devices.length && (
            <div
              className="rounded-3xl border p-6 text-sm"
              style={{ background: t.card, borderColor: t.stroke, color: t.muted }}
            >
              Aucun MASTER.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
