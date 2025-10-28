import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   CONFIG SUPABASE
   ========================================================= */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPA_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPA_ANON_KEY);

/* =========================================================
   CONSTANTES UI / LOGIQUE
   ========================================================= */
const MASTER_LIVE_TTL_MS = 8000; // master "online" si last_seen < 8s
const BG_IMAGE_URL =
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60";

/* =========================================================
   CSS GLOBALE
   ========================================================= */
const styles = `
:root {
  --glass-bg: rgba(255,255,255,0.12);
  --glass-bg-strong: rgba(255,255,255,0.18);
  --glass-stroke: rgba(255,255,255,0.3);
  --text-main: rgba(0,0,0,0.85);
  --text-dim: rgba(0,0,0,0.5);
  --text-soft: rgba(0,0,0,0.35);
  --accent-online: #16a34a;
  --accent-offline: #ef4444;
  --accent-primary: #2563eb;
  --panel-bg: rgba(255,255,255,0.22);
  --panel-stroke: rgba(255,255,255,0.4);

  --card-radius-lg: 20px;
  --card-radius-md: 16px;
  --card-radius-sm: 12px;
  --transition-fast: .16s ease;
}

* { box-sizing: border-box; -webkit-font-smoothing: antialiased; }

html, body, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
               Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--text-main);
}

/* ==== FOND GLOBAL WITH IMAGE ==== */
.appBg {
  min-height: 100%;
  background-color: #f5f6fa;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%),
    url("${BG_IMAGE_URL}");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  padding-top: 64px; /* espace sous la barre du haut */
}

/* ==== BARRE TOP FIXE ==== */
.topBar {
  position: fixed;
  top:0;
  left:0;
  right:0;
  height:64px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 16px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--panel-stroke);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  z-index:1000;
}
.topLeft {
  font-weight:600;
  font-size:16px;
  letter-spacing:-0.03em;
  color:var(--text-main);
  display:flex;
  flex-direction:column;
  line-height:1.2;
}
.topLeft small {
  font-size:11px;
  font-weight:400;
  color:var(--text-dim);
}
.topRight {
  display:flex;
  align-items:center;
  gap:10px;
  font-size:13px;
  color:var(--text-main);
}
.badgeOnline {
  color:var(--accent-online);
  font-weight:600;
  font-size:12px;
}
.badgeOffline {
  color:var(--accent-offline);
  font-weight:600;
  font-size:12px;
}
.topUserMail {
  font-size:12px;
  color:var(--text-dim);
}
.topBtn {
  appearance:none;
  border:0;
  border-radius:999px;
  background:rgba(0,0,0,0.05);
  color:var(--text-main);
  font-size:12px;
  line-height:1;
  padding:8px 12px;
  cursor:pointer;
  transition:background var(--transition-fast);
}
.topBtn.primary {
  background: var(--accent-primary);
  color:#fff;
}
.topBtn:hover {
  background:rgba(0,0,0,0.07);
}
.topBtn.primary:hover {
  background:#1e4ed8;
}

/* ==== PAGE CONTENT WRAPPER ==== */
.pageContent {
  max-width:1400px;
  margin:24px auto 60px auto;
  padding:0 16px 40px 16px;
  display:flex;
  flex-direction:column;
  gap:24px;
}

/* ==== SECTIONS TITLES ==== */
.sectionBlock {
  display:flex;
  flex-direction:column;
  gap:12px;
}
.sectionHeader {
  display:flex;
  flex-wrap:wrap;
  align-items:flex-end;
  justify-content:space-between;
  row-gap:8px;
}
.sectionTitle {
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:-0.03em;
  display:flex;
  flex-direction:column;
  line-height:1.25;
}
.sectionSubtitle {
  font-size:12px;
  font-weight:400;
  color:var(--text-dim);
}
.sectionActions {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  font-size:12px;
}

/* ==== GLASS CARD ==== */
.glassCard {
  background: var(--glass-bg);
  border:1px solid var(--glass-stroke);
  border-radius: var(--card-radius-lg);
  box-shadow:0 20px 60px rgba(0,0,0,0.25);
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  padding:16px;
  color:var(--text-main);
}

/* ==== GROUP LIST LAYOUT ==== */
.groupsWrap {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));
  gap:16px;
}

/* ==== EACH GROUP CARD ==== */
.groupCard {
  background: var(--glass-bg-strong);
  border:1px solid var(--glass-stroke);
  border-radius: var(--card-radius-md);
  padding:16px;
  min-height:180px;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  position:relative;
}
.groupTopRow {
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:8px;
}
.groupName {
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:-0.03em;
  line-height:1.3;
}
.groupMetaLine {
  font-size:12px;
  color:var(--text-dim);
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:4px;
}
.groupBtnsRow {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
  margin-top:12px;
}
.smallBtn {
  appearance:none;
  border:0;
  border-radius:999px;
  background:rgba(0,0,0,0.05);
  color:var(--text-main);
  font-size:12px;
  line-height:1;
  padding:6px 10px;
  cursor:pointer;
  transition:background var(--transition-fast);
}
.smallBtn:hover {
  background:rgba(0,0,0,0.07);
}
.subtleBtn {
  background:transparent;
  border:0;
  color:var(--text-dim);
  font-size:12px;
  line-height:1;
  padding:4px 6px;
  cursor:pointer;
}
.subtleBtn:hover {
  color:var(--text-main);
}

/* overflow list of "on" slaves button */
.listOnBtn {
  background:transparent;
  border:0;
  padding:0;
  font-size:12px;
  color:var(--accent-primary);
  cursor:pointer;
  text-decoration:underline;
}
.listOnBtn:hover { color:#1e4ed8; }

/* ==== MASTER CARD ==== */
.masterCardOuter {
  background: var(--glass-bg);
  border:1px solid var(--glass-stroke);
  border-radius: var(--card-radius-lg);
  box-shadow:0 20px 60px rgba(0,0,0,0.25);
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  padding:16px;
  color:var(--text-main);
  min-height:260px;
  display:flex;
  flex-direction:column;
  gap:16px;
  max-width:1100px;
  margin:0 auto; /* centré dans la page */
}
.masterHeadRow {
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  align-items:flex-start;
  row-gap:8px;
}
.masterHeadMain {
  display:flex;
  flex-direction:column;
  gap:6px;
}
.masterTitleRow {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:10px;
}
.masterName {
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:-0.03em;
}
.masterStatusOnline {
  font-size:12px;
  font-weight:600;
  color:var(--accent-online);
}
.masterStatusOffline {
  font-size:12px;
  font-weight:600;
  color:var(--accent-offline);
}
.masterMeta {
  font-size:12px;
  color:var(--text-dim);
  line-height:1.4;
}
.masterBtns {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  font-size:12px;
}
.masterActionBtn {
  appearance:none;
  border:0;
  background:rgba(0,0,0,0.05);
  color:var(--text-main);
  border-radius:999px;
  line-height:1;
  padding:6px 10px;
  cursor:pointer;
  transition:background var(--transition-fast);
}
.masterActionBtn:hover {
  background:rgba(0,0,0,0.07);
}

/* ==== SLAVES GRID ==== */
.slavesGrid {
  display:flex;
  flex-wrap:wrap;
  justify-content:center; /* <-- IMPORTANT: centred */
  gap:16px;
}

/* ==== SLAVE CARD ==== */
.slaveCard {
  position:relative;
  flex:0 1 180px;
  max-width:200px;
  min-width:140px;
  min-height:220px;
  background:rgba(255,255,255,0.22);
  border:1px solid rgba(255,255,255,0.5);
  box-shadow:0 24px 60px rgba(0,0,0,0.25);
  border-radius:var(--card-radius-md);
  backdrop-filter: blur(16px) saturate(1.45);
  -webkit-backdrop-filter: blur(16px) saturate(1.45);
  padding:12px 12px 48px 12px; /* place pour les boutons en bas */
  display:flex;
  flex-direction:column;
  justify-content:flex-start;
  align-items:center;
  text-align:center;
  color:var(--text-main);
}
.slaveLineTop {
  width:100%;
  display:flex;
  justify-content:flex-end;
}
.infoChip {
  background:rgba(0,0,0,0.06);
  color:var(--text-main);
  border-radius:999px;
  font-size:11px;
  line-height:1;
  padding:4px 6px;
  cursor:pointer;
}
.infoChip:hover {
  background:rgba(0,0,0,0.1);
}
.slaveNameBlock {
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  margin-top:8px;
  margin-bottom:12px;
}
.slaveNameBig {
  font-size:16px;
  line-height:1.2;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:-0.03em;
}
.pcStatus {
  font-size:12px;
  line-height:1.3;
  font-weight:500;
  color:var(--text-dim);
  margin-top:4px;
}
.progressOuter {
  width:100%;
  height:4px;
  border-radius:999px;
  background:rgba(0,0,0,0.08);
  margin-top:8px;
  overflow:hidden;
}
.progressInner {
  height:100%;
  background:#000;
  width:0%;
  transition: width .2s linear;
}

/* BOTTOM BUTTON BAR INSIDE SLAVE CARD */
.slaveBtnsRow {
  position:absolute;
  bottom:8px;
  left:0;
  right:0;
  display:flex;
  justify-content:center;
  flex-wrap:wrap;
  gap:10px;
  padding:0 8px;
}
.circleBtn {
  appearance:none;
  border:0;
  background:rgba(0,0,0,0.05);
  color:var(--text-main);
  width:42px;
  height:42px;
  min-width:42px;
  min-height:42px;
  border-radius:999px;
  font-size:13px;
  font-weight:500;
  line-height:42px;
  text-align:center;
  cursor:pointer;
  transition:background var(--transition-fast), color var(--transition-fast);
}
.circleBtn:hover {
  background:rgba(0,0,0,0.09);
}
.circleBtn.moreBtn {
  font-weight:600;
  font-size:18px;
  line-height:42px;
}

/* ==== JOURNAL GÉNÉRAL ==== */
.journalBlock {
  max-width:1100px;
  margin:0 auto;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.journalTitle {
  font-size:13px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:-0.03em;
}
.journalBox {
  min-height:120px;
  max-height:180px;
  overflow:auto;
  background:rgba(255,255,255,0.4);
  border:1px solid rgba(255,255,255,0.5);
  border-radius:var(--card-radius-md);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:0 16px 40px rgba(0,0,0,0.2);
  padding:12px;
  font-size:12px;
  line-height:1.4;
  color:var(--text-main);
  white-space:pre-wrap;
}

/* ==== MODALS (pair, membres groupe, liste ON, menu "...") ==== */
.modalBackdrop {
  position:fixed;
  inset:0;
  background:rgba(0,0,0,0.4);
  backdrop-filter:blur(4px);
  -webkit-backdrop-filter:blur(4px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
  z-index:2000;
}
.modalCard {
  background:#fff;
  color:#000;
  border-radius:16px;
  max-width:360px;
  width:100%;
  max-height:80vh;
  overflow:auto;
  box-shadow:0 40px 120px rgba(0,0,0,0.4);
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:16px;
  font-size:14px;
}
.modalTitle {
  font-weight:600;
  font-size:15px;
  color:#000;
  line-height:1.3;
  letter-spacing:-0.03em;
}
.modalRow {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
  font-size:13px;
}
.rowBetween {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.primaryBtn {
  appearance:none;
  border:0;
  border-radius:999px;
  background:#2563eb;
  color:#fff;
  font-size:13px;
  font-weight:500;
  line-height:1;
  padding:8px 12px;
  cursor:pointer;
}
.primaryBtn:hover {
  background:#1e4ed8;
}
.smallNote {
  font-size:12px;
  color:#555;
  line-height:1.4;
}
.checkboxRow {
  display:flex;
  gap:8px;
  align-items:flex-start;
  font-size:13px;
  line-height:1.4;
  border-bottom:1px solid #ececec;
  padding:8px 0;
}
.checkboxRow input {
  margin-top:3px;
}
.smallLabel {
  font-size:11px;
  line-height:1.3;
  color:#666;
}
.scrollY {
  max-height:200px;
  overflow:auto;
  border:1px solid #ddd;
  border-radius:10px;
  padding:8px;
  background:#fafafa;
  font-size:13px;
  color:#000;
  line-height:1.4;
  box-shadow:inset 0 2px 4px rgba(0,0,0,0.06);
}

/* mini menu pour "..." slave actions avancées */
.moreMenuList {
  display:flex;
  flex-direction:column;
  gap:8px;
  font-size:13px;
}
.moreMenuBtn {
  appearance:none;
  border:0;
  background:#f2f2f2;
  border-radius:10px;
  line-height:1;
  padding:10px 12px;
  text-align:left;
  cursor:pointer;
  font-size:13px;
  color:#000;
}
.moreMenuBtn.dangerous {
  background:#fee2e2;
  color:#991b1b;
}

/* pair code line */
.pairCodeBox {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:20px;
  font-weight:600;
  color:#000;
  background:#f8fafc;
  border:1px solid #cbd5e1;
  border-radius:10px;
  padding:8px 12px;
  display:inline-block;
  min-width:100px;
  text-align:center;
}

`;

/* =========================================================
   HELPERS
   ========================================================= */
function fmtTS(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}
function isMasterLive(dev) {
  if (!dev.last_seen) return false;
  const delta = Date.now() - new Date(dev.last_seen).getTime();
  return delta < MASTER_LIVE_TTL_MS;
}

/* =========================================================
   COMPOSANT PRINCIPAL
   ========================================================= */
export default function App() {
  /* ---------- AUTH STATE ---------- */
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  /* ---------- DATA STATE ---------- */
  const [devices, setDevices] = useState([]); // masters
  // nodesByMaster[master_id] = [ { mac, nameShort, pc_on } , ... ]
  const [nodesByMaster, setNodesByMaster] = useState({});

  // groups list [{id,name},...]
  const [groups, setGroups] = useState([]);
  // groupMembers[group_id] = [ { master_id, mac } , ...]
  const [groupMembers, setGroupMembers] = useState({});

  /* ---------- CMD ACTIVITY PAR SLAVE ---------- */
  // cmdActivity[slaveMac] = { phase:"idle"|"pending"|"acked"|"error", ts:number }
  const [cmdActivity, setCmdActivity] = useState({});

  /* ---------- LOG UI ---------- */
  const [lines, setLines] = useState([]);
  const logRef = useRef(null);
  function addLog(txt) {
    setLines((prev) => [
      ...prev,
      new Date().toLocaleTimeString() + "  " + txt,
    ]);
  }
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  /* ---------- REALTIME CHANNEL REFS ---------- */
  const chDevices = useRef(null);
  const chNodes = useRef(null);
  const chGroups = useRef(null);
  const chCmds = useRef(null);

  /* ---------- MODALS / UI ---------- */
  // Ajouter MASTER (pair-code)
  const [pairInfo, setPairInfo] = useState({
    open: false,
    code: null,
    expires_at: null,
  });

  // Slave action "..." menu
  const [openSlaveMoreMac, setOpenSlaveMoreMac] = useState(null);
  const [openSlaveMoreMaster, setOpenSlaveMoreMaster] = useState(null);

  // Affichage liste des slaves allumés d'un groupe
  const [listOnGroupId, setListOnGroupId] = useState(null);

  // Édition membres d’un groupe
  const [editGroupId, setEditGroupId] = useState(null);

  // Sélection temporaire des membres dans l'éditeur de groupe
  // (Set de "master_id|mac") => vit au niveau App pour survivre aux rerenders
  const [editMembersSel, setEditMembersSel] = useState(new Set());

  /* =========================================================
     AUTH BOOTSTRAP
     ========================================================= */
  useEffect(() => {
    // écoute des changements auth
    const sub = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthReady(true);
      if (session?.user) {
        attachRealtime();
        loadAllData();
      } else {
        cleanupRealtime();
        setDevices([]);
        setNodesByMaster({});
        setGroups([]);
        setGroupMembers({});
      }
    });

    // session initiale
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      setUser(session?.user || null);
      setAuthReady(true);
      if (session?.user) {
        attachRealtime();
        loadAllData();
      }
    })();

    return () => {
      try {
        sub.data.subscription.unsubscribe();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     REALTIME
     ========================================================= */
  function cleanupRealtime() {
    if (chDevices.current) sb.removeChannel(chDevices.current);
    if (chNodes.current)   sb.removeChannel(chNodes.current);
    if (chGroups.current)  sb.removeChannel(chGroups.current);
    if (chCmds.current)    sb.removeChannel(chCmds.current);
    chDevices.current = chNodes.current = chGroups.current = chCmds.current = null;
  }

  function attachRealtime() {
    cleanupRealtime();

    // devices
    chDevices.current = sb.channel("rt:devices")
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'devices' },
        (p) => {
          addLog(`+ device ${p.new.id}`);
          setDevices((ds) => [p.new, ...ds]);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'devices' },
        (p) => {
          const d = p.new;
          setDevices((ds) => ds.map(x => x.id === d.id ? { ...x, ...d } : x));
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'devices' },
        (p) => {
          addLog(`- device ${p.old.id}`);
          setDevices((ds) => ds.filter(x => x.id !== p.old.id));
        }
      )
      .subscribe();

    // nodes
    chNodes.current = sb.channel("rt:nodes")
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nodes' },
        (p) => {
          addLog(`+ node ${p.new.slave_mac} → ${p.new.master_id}`);
          reloadNodes(); // on recharge la liste des slaves + états
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nodes' },
        (p) => {
          // ex: pc_on bouge
          reloadNodes();
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'nodes' },
        (p) => {
          addLog(`- node ${p.old.slave_mac} ← ${p.old.master_id}`);
          reloadNodes();
        }
      )
      .subscribe();

    // groups + group_members (on écoute 2 tables via un même channel)
    chGroups.current = sb.channel("rt:groups-and-members")
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'groups' },
        (_p) => {
          reloadGroups();
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        (_p) => {
          reloadGroups();
        }
      )
      .subscribe();

    // commands (pour activité / ack etc.)
    chCmds.current = sb.channel("rt:commands")
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'commands' },
        (p) => {
          handleCommandRealtime(p.new);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'commands' },
        (p) => {
          handleCommandRealtime(p.new);
        }
      )
      .subscribe();
  }

  // on reçoit un event commande pour mettre à jour barre noire (acked / error...)
  function handleCommandRealtime(cmdRow) {
    // si commande vers un slave précis → on marque son activité
    if (cmdRow.target_mac) {
      setCmdActivity((map) => {
        const next = { ...map };
        // status peut être 'queued', 'sent', 'acked', 'error'
        const phase = cmdRow.status || "queued";
        next[cmdRow.target_mac] = {
          phase,
          ts: Date.now(),
        };
        return next;
      });
    }
    // log global
    addLog(
      `cmd ${cmdRow.action} (${cmdRow.status}) → ${
        cmdRow.master_id
      }${cmdRow.target_mac ? " ▶ " + cmdRow.target_mac : ""}`
    );
  }

  /* =========================================================
     LOAD DATA
     ========================================================= */
  async function loadAllData() {
    await Promise.all([
      reloadDevices(),
      reloadNodes(),
      reloadGroups(),
    ]);
  }

  async function reloadDevices() {
    const { data, error } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });
    if (error) {
      addLog("Err devices: " + error.message);
      return;
    }
    setDevices(data || []);
  }

  async function reloadNodes() {
    // On récupère le friendly_name et l'état pc_on
    const { data, error } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if (error) {
      addLog("Err nodes: " + error.message);
      return;
    }
    const map = {};
    (data || []).forEach((row) => {
      const mid = row.master_id;
      if (!map[mid]) map[mid] = [];
      map[mid].push({
        mac: row.slave_mac,
        nameShort: row.friendly_name || row.slave_mac,
        pc_on: !!row.pc_on,
      });
    });
    setNodesByMaster(map);
  }

  async function reloadGroups() {
    const { data: grps, error: eg } = await sb
      .from("groups")
      .select("id,name")
      .order("created_at", { ascending: true });
    if (eg) {
      addLog("Err groups: " + eg.message);
      return;
    }
    const { data: gm, error: em } = await sb
      .from("group_members")
      .select("group_id,master_id,slave_mac");
    if (em) {
      addLog("Err group_members: " + em.message);
      return;
    }
    const memMap = {};
    (gm || []).forEach((m) => {
      if (!memMap[m.group_id]) memMap[m.group_id] = [];
      memMap[m.group_id].push({
        master_id: m.master_id,
        mac: m.slave_mac,
      });
    });

    setGroups(grps || []);
    setGroupMembers(memMap);
  }

  // recharger un seul groupe après modif
  async function reloadSingleGroup(groupId) {
    // recharge tout pour rester simple
    await reloadGroups();
  }

  /* =========================================================
     COMMANDES / ACTIONS BACKEND
     ========================================================= */
  async function sendCmd(masterId, targetMac, action, payload = {}) {
    // on note l'activité du slave direct en phase "queued"
    if (targetMac) {
      setCmdActivity((map) => {
        const next = { ...map };
        next[targetMac] = { phase: "queued", ts: Date.now() };
        return next;
      });
    }

    const { error } = await sb.from("commands").insert({
      master_id: masterId,
      target_mac: targetMac || null,
      action,
      payload,
    });
    if (error) {
      addLog("cmd err: " + error.message);
      // si erreur immédiate -> marquer error
      if (targetMac) {
        setCmdActivity((map) => {
          const next = { ...map };
          next[targetMac] = { phase: "error", ts: Date.now() };
          return next;
        });
      }
      return;
    }
    addLog(
      `[cmd] ${action} → ${masterId}${
        targetMac ? " ▶ " + targetMac : ""
      }`
    );
  }

  async function renameMaster(masterId) {
    const name = prompt("Nouveau nom du master ?", "");
    if (!name) return;
    const { error } = await sb
      .from("devices")
      .update({ name })
      .eq("id", masterId);
    if (error) alert(error.message);
    else addLog(`Renommé ${masterId} → ${name}`);
  }

  async function deleteMaster(masterId) {
    if (!confirm(`Supprimer ${masterId} ?`)) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      alert("Non connecté");
      return;
    }
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/release_and_delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPA_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ master_id: masterId }),
      }
    );
    addLog(
      r.ok
        ? `MASTER supprimé : ${masterId}`
        : `❌ Suppression : ${await r.text()}`
    );
  }

  async function openPairDialog() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      alert("Non connecté");
      return;
    }
    try {
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/create_pair_code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPA_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ttl_minutes: 10 }),
        }
      );
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
      addLog(`Pair-code ${code}`);
    } catch (e) {
      addLog("Erreur pair-code: " + e.message);
    }
  }

  function closePairDialog() {
    setPairInfo({ open: false, code: null, expires_at: null });
  }

  /* GROUP CRUD */
  async function createGroup() {
    const name = prompt("Nom du nouveau groupe ?", "Groupe");
    if (!name) return;
    const { error } = await sb.from("groups").insert({ name });
    if (error) {
      alert("Erreur création groupe: " + error.message);
      return;
    }
    addLog(`Groupe "${name}" créé`);
    reloadGroups();
  }

  async function renameGroup(id) {
    const cur = groups.find((g) => g.id === id);
    const name = prompt(
      "Nouveau nom du groupe ?",
      cur ? cur.name : "Groupe"
    );
    if (!name) return;
    const { error } = await sb
      .from("groups")
      .update({ name })
      .eq("id", id);
    if (error) {
      alert("Erreur renommage groupe: " + error.message);
      return;
    }
    addLog(`Groupe ${id} renommé → ${name}`);
    reloadGroups();
  }

  async function deleteGroup(id) {
    if (!confirm("Supprimer ce groupe ?")) return;
    const { error } = await sb.from("groups").delete().eq("id", id);
    if (error) {
      alert("Erreur suppression groupe: " + error.message);
      return;
    }
    addLog(`Groupe ${id} supprimé`);
    reloadGroups();
  }

  /* Gestion ouverture éditeur membres d'un groupe */
  function openEditGroupMembers(id) {
    const currentMembers = groupMembers[id] || [];
    const initialSet = new Set();
    currentMembers.forEach((m) => {
      initialSet.add(`${m.master_id}|${m.mac}`);
    });
    setEditMembersSel(initialSet);
    setEditGroupId(id);
  }

  function closeEditGroupMembers() {
    setEditGroupId(null);
  }

  async function saveGroupMembers(groupId) {
    const selectedKeys = editMembersSel;
    const current = groupMembers[groupId] || [];
    const curSet = new Set(
      current.map((m) => `${m.master_id}|${m.mac}`)
    );

    const toAdd = [];
    selectedKeys.forEach((k) => {
      if (!curSet.has(k)) {
        const [mid, mac] = k.split("|");
        toAdd.push({
          group_id: groupId,
          master_id: mid,
          slave_mac: mac,
        });
      }
    });

    const toRemove = [];
    curSet.forEach((k) => {
      if (!selectedKeys.has(k)) {
        const [mid, mac] = k.split("|");
        toRemove.push({ master_id: mid, slave_mac: mac });
      }
    });

    if (toAdd.length) {
      const { error } = await sb
        .from("group_members")
        .insert(toAdd);
      if (error) {
        alert("Erreur insert membres: " + error.message);
      }
    }

    for (const rem of toRemove) {
      const { error } = await sb
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("master_id", rem.master_id)
        .eq("slave_mac", rem.slave_mac);
      if (error) {
        alert("Erreur delete membre: " + error.message);
      }
    }

    addLog(`Membres groupe ${groupId} mis à jour`);
    await reloadSingleGroup(groupId);
    setEditGroupId(null);
  }

  /* ouvrir / fermer le mini-menu "..." d'un slave */
  function openSlaveMore(masterId, mac) {
    setOpenSlaveMoreMac(mac);
    setOpenSlaveMoreMaster(masterId);
  }
  function closeSlaveMore() {
    setOpenSlaveMoreMac(null);
    setOpenSlaveMoreMaster(null);
  }

  /* ouvrir / fermer la liste "X/X allumés" */
  function openListOnGroup(id) {
    setListOnGroupId(id);
  }
  function closeListOnGroup() {
    setListOnGroupId(null);
  }

  /* =========================================================
     RENDU GROUP CARD
     ========================================================= */
  function GroupCard({ g }) {
    // membres du groupe
    const members = groupMembers[g.id] || [];
    // on croise avec nodesByMaster pour savoir qui est "on"
    let onCount = 0;
    let totalCount = members.length;
    const onList = [];
    members.forEach((m) => {
      const arr = nodesByMaster[m.master_id] || [];
      const found = arr.find((sl) => sl.mac === m.mac);
      if (found && found.pc_on) {
        onCount++;
        onList.push(found.nameShort || found.mac);
      }
    });

    return (
      <div className="groupCard">
        <div className="groupTopRow">
          <div>
            <div className="groupName">{g.name || "Groupe"}</div>
            <div className="groupMetaLine">
              <span>
                {onCount}/{totalCount} allumé(s)
              </span>
              <button
                className="listOnBtn"
                onClick={() => openListOnGroup(g.id)}
                disabled={!totalCount}
              >
                liste
              </button>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <button
              className="subtleBtn"
              onClick={() => renameGroup(g.id)}
            >
              Renommer
            </button>
            <button
              className="subtleBtn"
              onClick={() => deleteGroup(g.id)}
            >
              Supprimer
            </button>
            <button
              className="subtleBtn"
              onClick={() => openEditGroupMembers(g.id)}
            >
              Membres
            </button>
          </div>
        </div>

        <div className="groupBtnsRow">
          {/* Boutons d'actions groupées :
             -> envoi de commandes broadcast vers tous les slaves du groupe */}
          <button
            className="smallBtn"
            onClick={() => {
              members.forEach((m) =>
                sendCmd(m.master_id, m.mac, "SLV_IO", {
                  pin: 26,
                  mode: "OUT",
                  value: 1,
                })
              );
            }}
          >
            IO ON
          </button>

          <button
            className="smallBtn"
            onClick={() => {
              members.forEach((m) =>
                sendCmd(m.master_id, m.mac, "SLV_RESET", {})
              );
            }}
          >
            RESET
          </button>

          <button
            className="smallBtn"
            onClick={() => {
              members.forEach((m) =>
                sendCmd(m.master_id, m.mac, "SLV_IO", {
                  pin: 26,
                  mode: "OUT",
                  value: 0,
                })
              );
            }}
          >
            OFF
          </button>

          <button
            className="smallBtn"
            onClick={() => {
              members.forEach((m) =>
                sendCmd(m.master_id, m.mac, "SLV_FORCE_OFF", {})
              );
            }}
          >
            HARD OFF
          </button>

          <button
            className="smallBtn"
            onClick={() => {
              members.forEach((m) =>
                sendCmd(m.master_id, m.mac, "SLV_HARD_RESET", {
                  ms: 3000,
                })
              );
            }}
          >
            HARD RESET
          </button>
        </div>
      </div>
    );
  }

  /* =========================================================
     RENDU SLAVE CARD
     ========================================================= */
  function SlaveCard({ masterId, slave }) {
    const mac = slave.mac;
    const isOn = !!slave.pc_on;

    // activité commande (barre noire)
    const activity = cmdActivity[mac];
    let barWidth = "0%";
    if (activity) {
      if (activity.phase === "queued") barWidth = "33%";
      else if (activity.phase === "sent") barWidth = "66%";
      else if (activity.phase === "acked") barWidth = "100%";
      else if (activity.phase === "error") barWidth = "100%";
    }

    return (
      <div className="slaveCard">
        {/* coin haut droite : bouton "i" */}
        <div className="slaveLineTop">
          <div
            className="infoChip"
            title={`${mac}\nMaster ${masterId}`}
          >
            i
          </div>
        </div>

        {/* Nom du slave + statut machine */}
        <div className="slaveNameBlock">
          <div className="slaveNameBig">{slave.nameShort}</div>
          <div className="pcStatus">
            {isOn ? "Ordinateur allumé" : "Ordinateur éteint"}
          </div>

          {/* barre de progression noire */}
          <div className="progressOuter">
            <div
              className="progressInner"
              style={{
                width: barWidth,
                background:
                  activity && activity.phase === "error"
                    ? "#ef4444"
                    : "#000",
              }}
            />
          </div>
        </div>

        {/* Boutons en bas */}
        <div className="slaveBtnsRow">
          {/* IO */}
          <button
            className="circleBtn"
            onClick={() => {
              sendCmd(masterId, mac, "SLV_IO", {
                pin: 26,
                mode: "OUT",
                value: 1,
              });
            }}
            title="IO / Power pulse"
          >
            ⏻
          </button>

          {/* RESET */}
          <button
            className="circleBtn"
            onClick={() => {
              sendCmd(masterId, mac, "SLV_RESET", {});
            }}
            title="RESET soft"
          >
            ↺
          </button>

          {/* "..." menu avancé */}
          <button
            className="circleBtn moreBtn"
            onClick={() => openSlaveMore(masterId, mac)}
            title="Options avancées"
          >
            …
          </button>
        </div>
      </div>
    );
  }

  /* =========================================================
     RENDU MASTER CARD
     ========================================================= */
  function MasterCard({ d }) {
    const live = isMasterLive(d);
    const slavesArr = nodesByMaster[d.id] || [];

    return (
      <section className="masterCardOuter">
        <div className="masterHeadRow">
          <div className="masterHeadMain">
            <div className="masterTitleRow">
              <div className="masterName">
                {d.name || d.id || "MASTER"}
              </div>
              <div
                className={
                  live
                    ? "masterStatusOnline"
                    : "masterStatusOffline"
                }
              >
                {live ? "EN LIGNE" : "HORS LIGNE"}
              </div>
            </div>

            <div className="masterMeta">
              ID : <strong>{d.id}</strong> <br />
              MAC : <strong>{d.master_mac || "—"}</strong> <br />
              Dernier contact :{" "}
              {d.last_seen ? fmtTS(d.last_seen) : "jamais"}
            </div>
          </div>

          <div className="masterBtns">
            <button
              className="masterActionBtn"
              onClick={() => renameMaster(d.id)}
            >
              Renommer
            </button>
            <button
              className="masterActionBtn"
              onClick={() => deleteMaster(d.id)}
            >
              Supprimer
            </button>
            <button
              className="masterActionBtn"
              onClick={() => sendCmd(d.id, null, "PULSE", { ms: 500 })}
            >
              Pulse 500ms
            </button>
            <button
              className="masterActionBtn"
              onClick={() => sendCmd(d.id, null, "POWER_ON", {})}
            >
              Power ON
            </button>
            <button
              className="masterActionBtn"
              onClick={() => sendCmd(d.id, null, "POWER_OFF", {})}
            >
              Power OFF
            </button>
            <button
              className="masterActionBtn"
              onClick={() => sendCmd(d.id, null, "RESET", {})}
            >
              Reset
            </button>
          </div>
        </div>

        {/* slaves */}
        <div className="slavesGrid">
          {slavesArr.map((sl) => (
            <SlaveCard
              key={sl.mac}
              masterId={d.id}
              slave={sl}
            />
          ))}
        </div>
      </section>
    );
  }

  /* =========================================================
     MODAL: AJOUT MASTER (PAIR CODE)
     ========================================================= */
  function PairDialog() {
    if (!pairInfo.open) return null;
    const endMS = pairInfo.expires_at
      ? new Date(pairInfo.expires_at).getTime()
      : 0;
    const ttlSec = Math.max(
      0,
      Math.floor((endMS - Date.now()) / 1000)
    );
    const mm = Math.floor(ttlSec / 60);
    const ss = String(ttlSec % 60).padStart(2, "0");

    return (
      <div
        className="modalBackdrop"
        onClick={closePairDialog}
      >
        <div
          className="modalCard"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modalTitle">Appairer un MASTER</div>
          <div>
            Code :
            <div className="pairCodeBox">
              {String(pairInfo.code || "").padStart(6, "0")}
            </div>
            <div className="smallNote">
              expire dans {mm}:{ss}
            </div>
          </div>
          <div className="smallNote">
            Ouvre le portail Wi-Fi de l’ESP32 MASTER et saisis
            ce code.
          </div>
          <div className="rowBetween">
            <button
              className="primaryBtn"
              onClick={closePairDialog}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     MODAL: MORE MENU POUR SLAVE ("...")
     ========================================================= */
  function SlaveMoreMenu() {
    if (!openSlaveMoreMac || !openSlaveMoreMaster) return null;
    const mac = openSlaveMoreMac;
    const mid = openSlaveMoreMaster;

    return (
      <div
        className="modalBackdrop"
        onClick={closeSlaveMore}
      >
        <div
          className="modalCard"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modalTitle">
            Options avancées
          </div>
          <div className="smallNote">
            {mac} <br />
            Master {mid}
          </div>
          <div className="moreMenuList">
            <button
              className="moreMenuBtn"
              onClick={() => {
                sendCmd(mid, mac, "SLV_IO", {
                  pin: 26,
                  mode: "OUT",
                  value: 0,
                });
                closeSlaveMore();
              }}
            >
              FORCER OFF (IO=0)
            </button>

            <button
              className="moreMenuBtn"
              onClick={() => {
                sendCmd(mid, mac, "SLV_RESET", {});
                closeSlaveMore();
              }}
            >
              RESET SOFT
            </button>

            <button
              className="moreMenuBtn dangerous"
              onClick={() => {
                sendCmd(mid, mac, "SLV_FORCE_OFF", {});
                closeSlaveMore();
              }}
            >
              HARD OFF
            </button>

            <button
              className="moreMenuBtn dangerous"
              onClick={() => {
                sendCmd(mid, mac, "SLV_HARD_RESET", {
                  ms: 3000,
                });
                closeSlaveMore();
              }}
            >
              HARD RESET
            </button>
          </div>

          <div className="rowBetween">
            <button
              className="primaryBtn"
              onClick={closeSlaveMore}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     MODAL: LISTE DES SLAVES ALLUMÉS POUR UN GROUPE
     ========================================================= */
  function OnListModal() {
    if (!listOnGroupId) return null;
    const gid = listOnGroupId;
    const group = groups.find((g) => g.id === gid);
    const members = groupMembers[gid] || [];

    // prépare la liste ON
    const onItems = [];
    members.forEach((m) => {
      const arr = nodesByMaster[m.master_id] || [];
      const found = arr.find((sl) => sl.mac === m.mac);
      if (found && found.pc_on) {
        onItems.push(found.nameShort || found.mac);
      }
    });

    return (
      <div
        className="modalBackdrop"
        onClick={closeListOnGroup}
      >
        <div
          className="modalCard"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modalTitle">
            Allumés – {group ? group.name : "?"}
          </div>
          <div className="scrollY">
            {onItems.length === 0 ? (
              <div className="smallNote">
                Aucun esclave détecté comme allumé.
              </div>
            ) : (
              onItems.map((label, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "13px",
                    lineHeight: "1.4",
                    padding: "4px 0",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#000",
                  }}
                >
                  {label}
                </div>
              ))
            )}
          </div>
          <div className="rowBetween">
            <button
              className="primaryBtn"
              onClick={closeListOnGroup}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     MODAL: EDITION MEMBRES GROUPE
     (checkboxes avec état PERSISTANT)
     ========================================================= */
  function GroupMembersEditor() {
    if (!editGroupId) return null;
    const gid = editGroupId;
    const grp = groups.find((g) => g.id === gid);

    // tous les slaves connus (tous masters confondus)
    const allSlaves = useMemo(() => {
      const acc = [];
      Object.entries(nodesByMaster).forEach(([mid, arr]) => {
        arr.forEach((sl) => {
          acc.push({
            master_id: mid,
            mac: sl.mac,
            nameShort: sl.nameShort || sl.mac,
          });
        });
      });
      return acc;
    }, [nodesByMaster]);

    function toggleOne(masterId, mac) {
      const key = `${masterId}|${mac}`;
      setEditMembersSel((sel) => {
        const n = new Set(sel);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    }

    return (
      <div
        className="modalBackdrop"
        onClick={closeEditGroupMembers}
      >
        <div
          className="modalCard"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modalTitle">
            Membres du groupe{" "}
            <strong>{grp ? grp.name : "?"}</strong>
          </div>

          <div className="scrollY">
            {allSlaves.length === 0 && (
              <div className="smallNote">
                Aucun slave détecté.
              </div>
            )}
            {allSlaves.map((sl) => {
              const key = `${sl.master_id}|${sl.mac}`;
              return (
                <label key={key} className="checkboxRow">
                  <input
                    type="checkbox"
                    checked={editMembersSel.has(key)}
                    onChange={() =>
                      toggleOne(sl.master_id, sl.mac)
                    }
                  />
                  <span>
                    <strong>{sl.nameShort}</strong>
                    <br />
                    <span className="smallLabel">
                      {sl.mac} • Master{" "}
                      {sl.master_id.slice(0, 8)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="rowBetween">
            <button
              className="primaryBtn"
              onClick={() => saveGroupMembers(gid)}
            >
              Enregistrer
            </button>
            <button
              className="primaryBtn"
              onClick={closeEditGroupMembers}
            >
              Annuler
            </button>
          </div>

          <div className="smallNote">
            Astuce : un groupe peut contenir
            des slaves de masters différents.
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     HEADER TOP BAR (REMOTE POWER + actions globales)
     ========================================================= */
  function TopBar() {
    // On va afficher l'état global "online/offline" ?
    // Ici on calcule si au moins un master est live.
    const anyLive = devices.some((d) => isMasterLive(d));

    return (
      <div className="topBar">
        <div className="topLeft">
          <span>REMOTE POWER</span>
          <small>
            {anyLive ? (
              <span className="badgeOnline">Actif</span>
            ) : (
              <span className="badgeOffline">Inactif</span>
            )}{" "}
            • tableau de contrôle
          </small>
        </div>

        <div className="topRight">
          <span className="topUserMail">
            {authReady
              ? user?.email || "non connecté"
              : "…auth..."}
          </span>

          {!user ? (
            <button
              className="topBtn primary"
              onClick={async () => {
                const { data, error } =
                  await sb.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                      redirectTo: location.href,
                      queryParams: {
                        prompt: "select_account",
                      },
                      skipBrowserRedirect: true,
                    },
                  });
                if (error) alert(error.message);
                else if (data?.url) location.href = data.url;
              }}
            >
              Connexion Google
            </button>
          ) : (
            <button
              className="topBtn"
              onClick={() => {
                sb.auth.signOut();
              }}
            >
              Déconnexion
            </button>
          )}

          <button
            className="topBtn"
            onClick={openPairDialog}
          >
            + MASTER
          </button>

          <button
            className="topBtn"
            onClick={createGroup}
          >
            + Groupe
          </button>

          <button
            className="topBtn"
            onClick={loadAllData}
          >
            Rafraîchir
          </button>
        </div>
      </div>
    );
  }

  /* =========================================================
     SECTION GROUPES
     ========================================================= */
  function GroupsSection() {
    return (
      <section className="sectionBlock">
        <div className="sectionHeader">
          <div className="sectionTitle">
            <span>Groupes</span>
            <span className="sectionSubtitle">
              Contrôler plusieurs machines en même temps
            </span>
          </div>
          {/* actions de section si besoin */}
        </div>

        <div className="groupsWrap">
          {groups.length === 0 ? (
            <div className="glassCard">
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-dim)",
                }}
              >
                Aucun groupe. Clique sur “+ Groupe” pour
                en créer un.
              </div>
            </div>
          ) : (
            groups.map((g) => <GroupCard key={g.id} g={g} />)
          )}
        </div>
      </section>
    );
  }

  /* =========================================================
     SECTION MASTERS
     ========================================================= */
  function MastersSection() {
    return (
      <section className="sectionBlock">
        <div className="sectionHeader">
          <div className="sectionTitle">
            <span>Masters</span>
            <span className="sectionSubtitle">
              Chaque master pilote ses slaves
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "20px",
          }}
        >
          {devices.length === 0 ? (
            <div className="glassCard">
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-dim)",
                }}
              >
                Aucun master pour l’instant.
                Ajoute-en un avec “+ MASTER”.
              </div>
            </div>
          ) : (
            devices.map((d) => (
              <MasterCard key={d.id} d={d} />
            ))
          )}
        </div>
      </section>
    );
  }

  /* =========================================================
     RENDU PRINCIPAL
     ========================================================= */
  return (
    <>
      <style>{styles}</style>

      {/* BARRE FIXE HAUT */}
      <TopBar />

      {/* MODALS */}
      <PairDialog />
      <SlaveMoreMenu />
      <OnListModal />
      <GroupMembersEditor />

      {/* CONTENU PAGE */}
      <div className="appBg">
        <div className="pageContent">
          <GroupsSection />
          <MastersSection />

          {/* Journal global */}
          <div className="journalBlock">
            <div className="journalTitle">Journal</div>
            <div className="journalBox" ref={logRef}>
              {lines.join("\n")}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
