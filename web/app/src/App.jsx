// web/app/src/App.jsx
// UI Remote Power (Master / Slaves)
//
// - Auth Supabase (Google OAuth)
// - Liste des masters + slaves
// - Envoi de commandes
// - Realtime (devices / nodes / commands)
// - Design "glass" clair façon HomeKit
// - Colonne verticale centrée qui scrolle
//
// Besoin: variables d'env VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

import React, { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CONFIG SUPABASE
   ========================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let sb = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// TTL pour considérer le master "en ligne"
const LIVE_TTL_MS = 25_000;
// pin IO par défaut sur les slaves
const DEFAULT_IO_PIN = 26;

/* =========================
   HELPERS
   ========================= */
const fmtTS = (s) => (s ? new Date(s).toLocaleString() : "—");
const isLive = (d) =>
  d.last_seen && Date.now() - new Date(d.last_seen).getTime() < LIVE_TTL_MS;

/* flash visuel sur la LED du slave après action */
function flashLed(mac) {
  const el = document.getElementById(`led-${mac}`);
  if (!el) return;
  const original = el.style.background;
  el.style.background = "#16a34a"; // vert flash
  setTimeout(() => {
    el.style.background = original || "#1f2937";
  }, 600);
}

/* =========================
   STYLES
   ========================= */

// NOTE: tu peux changer l'image de fond ici ↓ dans appShell.backgroundImage
const styles = {
  appShell: {
    minHeight: "100vh",
    maxHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",

    backgroundImage:
      'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%), url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=60")',
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",

    color: "#0f172a",
    fontFamily:
      'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',

    padding: 16,
  },

  headerBar: {
    borderRadius: 24,
    padding: "16px 20px",
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.12)",

    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,

    // limite la largeur du header pour coller au style "panneau iPhone"
    maxWidth: 440,
    width: "100%",
    margin: "0 auto",
  },

  headerLeft: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },

  headerTitleRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },

  appTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  },

  headerSub: {
    fontSize: 12,
    color: "rgba(15,23,42,0.6)",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },

  headerRight: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },

  headerBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "transparent",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 500,
    padding: "8px 14px",
    lineHeight: 1.2,
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  // zone scrollable sous le header
  contentScroll: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",

    width: "100%",
    display: "flex",
    justifyContent: "center",

    marginTop: 16,
    paddingBottom: 16,
  },

  // colonne verticale centrée
  mainContent: {
    width: "100%",
    maxWidth: 440, // largeur "carte iOS"
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  // carte MASTER (grosse tuile verre)
  masterCard: {
    borderRadius: 24,
    padding: 20,
    background:
      "linear-gradient(to bottom right, rgba(255,255,255,0.45), rgba(255,255,255,0.25))",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",

    display: "flex",
    flexDirection: "column",
    gap: 16,
    color: "#0f172a",
  },

  masterHeaderRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  masterHeaderLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },

  masterTopLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },

  masterName: {
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
    wordBreak: "break-word",
  },

  masterBadgeBase: {
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 500,
    borderRadius: 9999,
    padding: "2px 8px",
    border: "1px solid transparent",
  },
  masterBadgeOnline: {
    background: "rgba(16,185,129,0.15)",
    color: "#065f46",
    border: "1px solid rgba(5,150,105,0.4)",
  },
  masterBadgeOffline: {
    background: "rgba(239,68,68,0.12)",
    color: "#7f1d1d",
    border: "1px solid rgba(127,29,29,0.4)",
  },

  masterRightActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },

  masterSmallBtn: {
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.2)",
    color: "#0f172a",
    fontSize: 11,
    lineHeight: 1.2,
    borderRadius: 9999,
    padding: "6px 12px",
    fontWeight: 500,
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  dangerText: {
    color: "#7f1d1d",
  },

  infoBtn: {
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 9999,
    width: 28,
    height: 28,
    minWidth: 28,
    minHeight: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 500,
    color: "#0f172a",
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    cursor: "pointer",
  },

  masterDetailsBox: {
    fontSize: 12,
    lineHeight: 1.4,
    color: "rgba(15,23,42,0.7)",
    background: "rgba(255,255,255,0.3)",
    border: "1px solid rgba(0,0,0,0.05)",
    borderRadius: 16,
    padding: 12,
    wordBreak: "break-word",
  },

  // ICI : au lieu de grid multi-colonnes, on empile verticalement
  slaveGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
  },

  // carte SLAVE (petite tuile verre empilée)
  slaveTile: {
    borderRadius: 20,
    padding: 16,
    background:
      "linear-gradient(to bottom right, rgba(255,255,255,0.18), rgba(255,255,255,0.08))",
    border: "1px solid rgba(0,0,0,0.07)",
    boxShadow: "0 24px 48px rgba(0,0,0,0.08)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",

    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    gap: 16,

    color: "#0f172a",
    position: "relative",
    overflow: "hidden",
  },

  slaveTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 8,
  },

  slaveTitleWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: "1 1 auto",
  },

  slaveNameRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },

  slaveName: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
    color: "#0f172a",
    letterSpacing: "-0.03em",
  },

  slaveInfoArea: {
    fontSize: 12,
    lineHeight: 1.4,
    color: "rgba(15,23,42,0.7)",
    background: "rgba(255,255,255,0.3)",
    border: "1px solid rgba(0,0,0,0.05)",
    borderRadius: 14,
    padding: 10,
    wordBreak: "break-word",
  },

  infoBtnSmall: {
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 9999,
    width: 24,
    height: 24,
    minWidth: 24,
    minHeight: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 500,
    color: "#0f172a",
    cursor: "pointer",
  },

  knobSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },

  knobCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    border: "4px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    fontSize: 11,
    fontWeight: 500,
    color: "#0f172a",
    lineHeight: 1.2,
  },

  knobLed: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#1f2937",
    border: "2px solid rgba(0,0,0,0.5)",
  },

  powerBtn: {
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.2)",
    color: "#0f172a",
    borderRadius: 9999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
    cursor: "pointer",
  },

  slaveActionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 8,
    fontSize: 11,
    fontWeight: 500,
    width: "100%",
  },

  subBtn: {
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 9999,
    color: "#0f172a",
    padding: "6px 10px",
    lineHeight: 1.2,
    textAlign: "center",
    fontWeight: 500,
    fontSize: 11,
    maxWidth: "100%",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
    cursor: "pointer",
  },

  dangerBtn: {
    background: "transparent",
    border: "1px solid rgba(127,29,29,0.3)",
    borderRadius: 9999,
    color: "#7f1d1d",
    padding: "6px 10px",
    lineHeight: 1.2,
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 500,
    fontSize: 11,
    maxWidth: "100%",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
    cursor: "pointer",
  },

  divider: {
    height: 1,
    background: "rgba(0,0,0,0.07)",
  },

  masterActionsWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },

  actionChip: {
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 9999,
    color: "#0f172a",
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  cmdBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  cmdTitle: {
    fontSize: 12,
    color: "rgba(15,23,42,0.6)",
    fontWeight: 500,
  },

  cmdList: {
    margin: 0,
    paddingLeft: 18,
    maxHeight: 140,
    overflowY: "auto",
    fontSize: 12,
    lineHeight: 1.4,
    color: "#0f172a",
  },

  // Journal global (dernière carte sous tous les masters)
  journalCard: {
    borderRadius: 20,
    padding: 16,
    background:
      "linear-gradient(to bottom right, rgba(255,255,255,0.4), rgba(255,255,255,0.2))",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    color: "#0f172a",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  journalTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  },

  logBox: {
    background: "rgba(255,255,255,0.4)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: 10,
    maxHeight: 150,
    overflowY: "auto",
    fontSize: 12,
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    color: "#0f172a",
  },

  // Dialog pair-code
  dialogOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.3)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },

  dialogCard: {
    minWidth: 280,
    maxWidth: 360,
    borderRadius: 20,
    background:
      "linear-gradient(to bottom right, rgba(255,255,255,0.5), rgba(255,255,255,0.3))",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    color: "#0f172a",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  dialogTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
    letterSpacing: "-0.03em",
    lineHeight: 1.2,
  },

  smallText: {
    fontSize: 12,
    color: "rgba(15,23,42,0.7)",
    lineHeight: 1.4,
  },

  rowEnd: {
    display: "flex",
    justifyContent: "flex-end",
  },
};

/* =========================
   COMPOSANT PRINCIPAL
   ========================= */

export default function App() {
  // sécurité: si pas de config Supabase -> message simple
  if (!sb) {
    return (
      <div
        style={{
          fontFamily:
            'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
          minHeight: "100vh",
          background: "#fff",
          color: "#000",
          padding: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Configuration manquante</h2>
        <p style={{ maxWidth: 480, lineHeight: 1.4, fontSize: 14 }}>
          Les variables d’environnement Vite ne sont pas définies :
          <br />
          <code>VITE_SUPABASE_URL</code> et{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>.
          <br />
          Vérifie tes secrets GitHub Actions.
        </p>
      </div>
    );
  }

  /* ====== STATE ====== */
  const [user, setUser] = useState(null);

  // liste des masters
  const [devices, setDevices] = useState([]);
  // { master_id: [slave_mac, ...] }
  const [nodesByMaster, setNodesByMaster] = useState({});

  // log
  const [lines, setLines] = useState([]);
  const logRef = useRef(null);

  // pair dialog
  const [pairInfo, setPairInfo] = useState({
    open: false,
    code: null,
    expires_at: null,
  });

  // affichage détails
  const [masterInfoOpen, setMasterInfoOpen] = useState({});
  const [slaveInfoOpen, setSlaveInfoOpen] = useState({});

  // historique commandes refs
  const cmdListsRef = useRef(new Map());

  // realtime channels
  const chDevicesRef = useRef(null);
  const chNodesRef = useRef(null);
  const chCmdsRef = useRef(null);

  /* ====== LOG UTILS ====== */
  function pushLog(t) {
    setLines((ls) => [...ls, `${new Date().toLocaleTimeString()}  ${t}`]);
  }
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  /* ====== TOGGLE INFOS ====== */
  function toggleMasterInfo(masterId) {
    setMasterInfoOpen((m) => ({ ...m, [masterId]: !m[masterId] }));
  }
  function toggleSlaveInfo(slaveMac) {
    setSlaveInfoOpen((m) => ({ ...m, [slaveMac]: !m[slaveMac] }));
  }

  /* ====== COMMANDES ====== */
  async function sendCmd(masterId, mac, action, payload = {}) {
    const { error } = await sb.from("commands").insert({
      master_id: masterId,
      target_mac: mac || null,
      action,
      payload,
    });
    if (error) {
      pushLog("cmd err: " + error.message);
    } else {
      pushLog(
        `[cmd] ${action} → ${masterId}${mac ? " ▶ " + mac : ""}`
      );
    }
  }

  async function renameMaster(id) {
    const name = prompt("Nouveau nom du master ?", "");
    if (!name) return;
    const { error } = await sb.from("devices").update({ name }).eq("id", id);
    if (error) {
      alert(error.message);
    } else {
      pushLog(`Renommé ${id} → ${name}`);
    }
  }

  async function deleteDevice(id) {
    if (!window.confirm(`Supprimer ${id} ?`)) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      alert("Non connecté");
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ master_id: id }),
    });
    if (r.ok) {
      pushLog(`MASTER supprimé : ${id}`);
    } else {
      const tt = await r.text();
      pushLog(`❌ Suppression : ${tt}`);
    }
  }

  async function openPairDialog() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      alert("Non connecté");
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ttl_minutes: 10 }),
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    const { code, expires_at } = await r.json();
    setPairInfo({
      open: true,
      code,
      expires_at,
    });
    pushLog(`Pair-code ${code}`);
  }

  function closePairDialog() {
    setPairInfo({
      open: false,
      code: null,
      expires_at: null,
    });
  }

  /* ====== COMMANDS HISTORY ====== */
  function upsertCmdRow(masterId, c) {
    const ul = cmdListsRef.current.get(masterId);
    if (!ul) return;
    const rowId = `cmd-${c.id}`;
    const html = `<code>${c.status}</code> · ${c.action}${
      c.target_mac ? " → " + c.target_mac : " (local)"
    } <span style="color:rgba(15,23,42,0.6)">· ${fmtTS(c.created_at)}</span>`;
    let li = ul.querySelector(`#${CSS.escape(rowId)}`);
    if (!li) {
      li = document.createElement("li");
      li.id = rowId;
      li.innerHTML = html;
      ul.prepend(li);
      while (ul.children.length > 20) {
        ul.removeChild(ul.lastChild);
      }
    } else {
      li.innerHTML = html;
    }
  }

  async function refreshCommands(masterId) {
    const { data, error } = await sb
      .from("commands")
      .select("id,action,target_mac,status,created_at")
      .eq("master_id", masterId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      pushLog("Err cmds: " + error.message);
      return;
    }
    const ul = cmdListsRef.current.get(masterId);
    if (!ul) return;
    ul.innerHTML = "";
    (data || []).forEach((c) => upsertCmdRow(masterId, c));
  }

  async function refreshSlavesFor(masterId) {
    const { data } = await sb
      .from("nodes")
      .select("slave_mac")
      .eq("master_id", masterId);

    setNodesByMaster((m) => ({
      ...m,
      [masterId]: (data || []).map((x) => x.slave_mac),
    }));
  }

  async function loadAll() {
    // masters
    const { data: devs, error: ed } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });
    if (ed) {
      pushLog("Err devices: " + ed.message);
      return;
    }
    setDevices(devs || []);

    // slaves
    const { data: nodes, error: en } = await sb
      .from("nodes")
      .select("master_id,slave_mac");
    if (en) {
      pushLog("Err nodes: " + en.message);
      return;
    }
    const map = {};
    (nodes || []).forEach((n) => {
      (map[n.master_id] ??= []).push(n.slave_mac);
    });
    setNodesByMaster(map);

    // charger historique de commandes pour chaque master
    for (const d of devs || []) {
      await refreshCommands(d.id);
    }
  }

  /* ====== REALTIME ====== */
  function cleanupRealtime() {
    if (chDevicesRef.current) sb.removeChannel(chDevicesRef.current);
    if (chNodesRef.current) sb.removeChannel(chNodesRef.current);
    if (chCmdsRef.current) sb.removeChannel(chCmdsRef.current);
    chDevicesRef.current = null;
    chNodesRef.current = null;
    chCmdsRef.current = null;
  }

  function attachRealtime() {
    cleanupRealtime();

    // devices channel
    chDevicesRef.current = sb
      .channel("rt:devices")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "devices" },
        (p) => {
          pushLog(`+ device ${p.new.id}`);
          setDevices((ds) => [p.new, ...ds]);
          refreshCommands(p.new.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "devices" },
        (p) => {
          const devNew = p.new;
          setDevices((ds) =>
            ds.map((x) => (x.id === devNew.id ? { ...x, ...devNew } : x))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "devices" },
        (p) => {
          pushLog(`- device ${p.old.id}`);
          setDevices((ds) => ds.filter((x) => x.id !== p.old.id));
        }
      )
      .subscribe();

    // nodes channel
    chNodesRef.current = sb
      .channel("rt:nodes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nodes" },
        (p) => {
          pushLog(`+ node ${p.new.slave_mac} → ${p.new.master_id}`);
          refreshSlavesFor(p.new.master_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "nodes" },
        (p) => {
          pushLog(`- node ${p.old.slave_mac} ← ${p.old.master_id}`);
          refreshSlavesFor(p.old.master_id);
        }
      )
      .subscribe();

    // commands channel
    chCmdsRef.current = sb
      .channel("rt:commands")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "commands" },
        (p) => {
          upsertCmdRow(p.new.master_id, p.new);
          pushLog(
            `cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "commands" },
        (p) => {
          upsertCmdRow(p.new.master_id, p.new);
          pushLog(
            `cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`
          );
        }
      )
      .subscribe();
  }

  /* ====== AUTH INIT ====== */
  useEffect(() => {
    const sub = sb.auth.onAuthStateChange((ev, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        attachRealtime();
        loadAll();
      } else {
        cleanupRealtime();
        setDevices([]);
        setNodesByMaster({});
      }
    });

    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) {
        attachRealtime();
        loadAll();
      }
    })();

    return () => {
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ====== AUTH BUTTONS ====== */
  const AuthControls = useMemo(() => {
    if (!user) {
      return (
        <button
          style={styles.headerBtn}
          onClick={async () => {
            const { data, error } = await sb.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: location.href,
                queryParams: { prompt: "select_account" },
              },
            });
            if (error) alert(error.message);
            else if (data?.url) location.href = data.url;
          }}
        >
          Connexion Google
        </button>
      );
    }
    return (
      <button
        style={styles.headerBtn}
        onClick={() => {
          sb.auth.signOut();
        }}
      >
        Déconnexion
      </button>
    );
  }, [user]);

  /* ====== SLAVE TILE ====== */
  function SlaveTile({ mac, masterId }) {
    const shortId = mac.slice(-5).toUpperCase(); // just un suffixe lisible
    const isOpen = !!slaveInfoOpen[mac];

    return (
      <div style={styles.slaveTile}>
        {/* Top row: nom + bouton "i" */}
        <div style={styles.slaveTopRow}>
          <div style={styles.slaveTitleWrap}>
            <div style={styles.slaveNameRow}>
              <div style={styles.slaveName}>SLAVE {shortId}</div>
            </div>

            {isOpen && (
              <div style={styles.slaveInfoArea}>
                <div>
                  MAC : <code>{mac}</code>
                </div>
                <div style={{ opacity: 0.7 }}>
                  IO / RESET / FORCE OFF / HARD RESET
                </div>
              </div>
            )}
          </div>

          <button
            style={styles.infoBtnSmall}
            title="Infos"
            onClick={() => toggleSlaveInfo(mac)}
          >
            i
          </button>
        </div>

        {/* bloc central (grosse pastille + bouton action principale) */}
        <div style={styles.knobSection}>
          <div style={styles.knobCircle}>
            <span>{shortId}</span>
            <span
              id={`led-${mac}`}
              style={styles.knobLed}
              aria-hidden="true"
            />
          </div>

          <button
            style={styles.powerBtn}
            onClick={() => {
              // IO impulsion ON côté slave
              sendCmd(masterId, mac, "SLV_IO", {
                pin: DEFAULT_IO_PIN,
                mode: "OUT",
                value: 1,
              });
              flashLed(mac);
            }}
          >
            Impulsion
          </button>
        </div>

        {/* actions secondaires */}
        <div style={styles.slaveActionsGrid}>
          <button
            style={styles.subBtn}
            onClick={() =>
              sendCmd(masterId, mac, "SLV_IO", {
                pin: DEFAULT_IO_PIN,
                mode: "OUT",
                value: 0,
              })
            }
          >
            OFF
          </button>

          <button
            style={styles.subBtn}
            onClick={() => sendCmd(masterId, mac, "SLV_RESET", {})}
          >
            RESET
          </button>

          <button
            style={styles.dangerBtn}
            onClick={() => sendCmd(masterId, mac, "SLV_FORCE_OFF", {})}
          >
            FORCE OFF
          </button>

          <button
            style={styles.dangerBtn}
            onClick={() =>
              sendCmd(masterId, mac, "SLV_HARD_RESET", { ms: 3000 })
            }
          >
            HARD RESET
          </button>
        </div>
      </div>
    );
  }

  /* ====== MASTER CARD ====== */
  function MasterCard({ d }) {
    const live = isLive(d);
    const badgeStyle = {
      ...styles.masterBadgeBase,
      ...(live ? styles.masterBadgeOnline : styles.masterBadgeOffline),
    };

    const slaves = nodesByMaster[d.id] || [];
    const open = !!masterInfoOpen[d.id];

    return (
      <section style={styles.masterCard}>
        {/* header master */}
        <div style={styles.masterHeaderRow}>
          <div style={styles.masterHeaderLeft}>
            <div style={styles.masterTopLine}>
              <div style={styles.masterName}>
                {d.name || d.id || "MASTER"}
              </div>
              <span style={badgeStyle}>
                {live ? "EN LIGNE" : "HORS LIGNE"}
              </span>
            </div>

            {open && (
              <div style={styles.masterDetailsBox}>
                <div>
                  ID : <code>{d.id}</code>
                </div>
                <div>
                  MAC : <code>{d.master_mac || "—"}</code>
                </div>
                <div>
                  Dernier contact : {fmtTS(d.last_seen) || "jamais"}
                </div>
              </div>
            )}
          </div>

          <div style={styles.masterRightActions}>
            <button
              style={styles.masterSmallBtn}
              onClick={() => renameMaster(d.id)}
            >
              Renommer
            </button>

            <button
              style={{ ...styles.masterSmallBtn, ...styles.dangerText }}
              onClick={() => deleteDevice(d.id)}
            >
              Supprimer
            </button>

            <button
              style={styles.infoBtn}
              title="Infos"
              onClick={() => toggleMasterInfo(d.id)}
            >
              i
            </button>
          </div>
        </div>

        {/* slaves empilés verticalement */}
        <div style={styles.slaveGrid}>
          {slaves.map((mac) => (
            <SlaveTile mac={mac} masterId={d.id} key={mac} />
          ))}

          {/* tuile d'ajout visuelle */}
          <div style={styles.slaveTile}>
            <div style={styles.slaveTopRow}>
              <div style={styles.slaveTitleWrap}>
                <div style={styles.slaveNameRow}>
                  <div style={styles.slaveName}>Ajouter un SLAVE</div>
                </div>
                <div style={styles.slaveInfoArea}>
                  Appuie long sur le bouton pair du MASTER
                  pour associer un nouveau SLAVE.
                </div>
              </div>
            </div>

            <div style={styles.knobSection}>
              <div style={styles.knobCircle}>
                <span style={{ opacity: 0.6 }}>+</span>
              </div>
              <button
                style={styles.powerBtn}
                onClick={() => {
                  alert(
                    "Mettre le MASTER en mode appairage, puis allumer le SLAVE."
                  );
                }}
              >
                Associer
              </button>
            </div>

            <div style={styles.slaveActionsGrid}>
              <button style={styles.subBtn} disabled>
                —
              </button>
              <button style={styles.subBtn} disabled>
                —
              </button>
              <button style={styles.subBtn} disabled>
                —
              </button>
              <button style={styles.subBtn} disabled>
                —
              </button>
            </div>
          </div>
        </div>

        {/* actions globales */}
        <div style={styles.divider} />

        <div style={styles.masterActionsWrap}>
          <button
            style={styles.actionChip}
            onClick={() => sendCmd(d.id, null, "PULSE", { ms: 500 })}
          >
            Pulse 500ms
          </button>
          <button
            style={styles.actionChip}
            onClick={() => sendCmd(d.id, null, "POWER_ON", {})}
          >
            Power ON
          </button>
          <button
            style={styles.actionChip}
            onClick={() => sendCmd(d.id, null, "POWER_OFF", {})}
          >
            Power OFF
          </button>
          <button
            style={styles.actionChip}
            onClick={() => sendCmd(d.id, null, "RESET", {})}
          >
            Reset
          </button>
        </div>

        {/* historique commandes */}
        <div style={styles.divider} />
        <div>
          <div style={styles.cmdTitle}>Commandes (20 dernières)</div>
          <ul
            style={styles.cmdList}
            ref={(el) => {
              if (el) cmdListsRef.current.set(d.id, el);
            }}
          />
        </div>
      </section>
    );
  }

  /* pair-code countdown */
  const pairCountdown = useMemo(() => {
    if (!pairInfo.open || !pairInfo.expires_at) return null;
    const end = new Date(pairInfo.expires_at).getTime();
    const leftSec = Math.max(
      0,
      Math.floor((end - Date.now()) / 1000)
    );
    return (
      Math.floor(leftSec / 60) +
      ":" +
      String(leftSec % 60).padStart(2, "0")
    );
  }, [pairInfo.open, pairInfo.expires_at]);

  /* RENDER FINAL */
  return (
    <div style={styles.appShell}>
      {/* HEADER FIXE VISUELLEMENT (il ne scroll pas parce que appShell est flex-col et le scroll est en dessous) */}
      <header style={styles.headerBar}>
        <div style={styles.headerLeft}>
          <div style={styles.headerTitleRow}>
            <div style={styles.appTitle}>Remote Power</div>
          </div>
          <div style={styles.headerSub}>
            Compte : {user?.email || "—"}
          </div>
        </div>

        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={openPairDialog}>
            Ajouter un MASTER
          </button>
          <button style={styles.headerBtn} onClick={loadAll}>
            Rafraîchir
          </button>
          {AuthControls}
        </div>
      </header>

      {/* CONTENU QUI SCROLLE */}
      <div style={styles.contentScroll}>
        <main style={styles.mainContent}>
          {devices.map((dev) => (
            <MasterCard d={dev} key={dev.id} />
          ))}

          {/* Journal global */}
          <section style={styles.journalCard}>
            <div style={styles.journalTitle}>Journal</div>
            <div style={styles.logBox} ref={logRef}>
              {lines.join("\n")}
            </div>
          </section>
        </main>
      </div>

      {/* PAIR DIALOG */}
      {pairInfo.open && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialogCard}>
            <div style={styles.dialogTitle}>Appairer un MASTER</div>
            <div style={styles.smallText}>
              Code :
              <code
                style={{
                  fontWeight: 600,
                  marginLeft: 6,
                  marginRight: 6,
                  fontSize: 13,
                }}
              >
                {String(pairInfo.code).padStart(6, "0")}
              </code>
              (expire dans{" "}
              <span style={{ fontWeight: 500 }}>
                {pairCountdown || "0:00"}
              </span>
              )
            </div>
            <div style={styles.smallText}>
              Saisis ce code dans le portail Wi-Fi de l’ESP32 MASTER.
            </div>
            <div style={styles.rowEnd}>
              <button style={styles.headerBtn} onClick={closePairDialog}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
