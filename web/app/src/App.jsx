import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CONFIG RUNTIME
   ========================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = createClient(SUPABASE_URL, SUPA_ANON);

/* TTL "online" (ms) */
const LIVE_TTL_MS = 8000;

/* GPIO "IO" par défaut pour l'impulsion power du slave */
const DEFAULT_IO_PIN = 26;

/* Image de fond */
const BG_URL =
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60";

/* =========================
   STYLES GLOBAUX
   ========================= */
const styles = `
:root {
  --glass-bg: rgba(255,255,255,0.18);
  --glass-bg-strong: rgba(255,255,255,0.28);
  --glass-stroke: rgba(255,255,255,0.45);
  --text-main: #000;
  --text-dim: rgba(0,0,0,0.55);
  --text-dimmer: rgba(0,0,0,0.38);
  --danger-bg: rgba(255,0,0,0.08);
  --danger-stroke: rgba(255,0,0,0.3);
  --ok-bg: rgba(16,185,129,0.12);
  --ok-stroke: rgba(16,185,129,0.4);
  --off-bg: rgba(255,0,0,0.08);
  --off-stroke: rgba(255,0,0,0.4);
  --panel-backdrop-blur: blur(20px);
  --header-h: 64px;
  --slave-minw: 180px;
  --slave-maxw: 240px;
}

/* fond global plein écran */
html,body,#root {
  margin: 0;
  padding: 0;
  min-height: 100%;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial;
  color: var(--text-main);
  background-color: #f4f4f8;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%),
    url("${BG_URL}");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

/* barre top sticky */
.appHeader {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(255,255,255,0.3);
  border-bottom: 1px solid rgba(255,255,255,0.6);
  backdrop-filter: var(--panel-backdrop-blur);
  -webkit-backdrop-filter: var(--panel-backdrop-blur);
  z-index: 999;
}

.appHeader-left {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.appTitle {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}
.appSub {
  font-size: 12px;
  color: var(--text-dim);
}
.appSession {
  font-size: 11px;
  color: var(--text-dimmer);
  margin-top: 2px;
}

/* zone droite du header */
.appHeader-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-dim);
  flex-wrap: wrap;
}

.topBtn {
  border-radius: 16px;
  background: rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.12);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 10px;
  line-height: 1.2;
  cursor: pointer;
  transition: background .15s, box-shadow .15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.topBtn.primary {
  background: rgba(0,0,0,0.85);
  color: #fff;
  border: 1px solid rgba(0,0,0,0.9);
}
.topBtn:hover {
  background: rgba(0,0,0,0.08);
}
.topBtn.primary:hover {
  background: rgba(0,0,0,0.7);
}

/* main layout */
.appMainOuter {
  padding: 16px 16px 64px;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  row-gap: 24px;
  color: var(--text-main);
}

/* carte MASTER (contient les slaves) */
.masterCard {
  width: 100%;
  max-width: 1300px;
  margin: 0 auto;
  border-radius: 24px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-stroke);
  backdrop-filter: var(--panel-backdrop-blur);
  -webkit-backdrop-filter: var(--panel-backdrop-blur);
  box-shadow: 0 30px 80px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  padding: 16px 16px 20px;
  row-gap: 16px;
}

/* en-tête master */
.masterTopRow {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  row-gap: 12px;
  column-gap: 16px;
  justify-content: space-between;
}

.masterLeft {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.masterNameRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.masterNameTxt {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
}
.badgeOnline {
  font-size: 11px;
  line-height: 1.2;
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ok-bg);
  border: 1px solid var(--ok-stroke);
  color: #065f46;
}
.badgeOffline {
  font-size: 11px;
  line-height: 1.2;
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--off-bg);
  border: 1px solid var(--off-stroke);
  color: #991b1b;
}

.masterMeta {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.4;
  word-break: break-word;
}

/* actions master (renommer / supprimer / power global) */
.masterActions {
  display: flex;
  flex-direction: column;
  row-gap: 8px;
  align-items: flex-end;
  flex-shrink: 0;
  min-width: 160px;
}
.masterButtonsRow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.miniBtn {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  border-radius: 14px;
  background: rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.12);
  color: var(--text-main);
  padding: 6px 10px;
  cursor: pointer;
  transition: background .15s;
}
.miniBtn:hover {
  background: rgba(0,0,0,0.08);
}
.miniBtn.danger {
  background: var(--danger-bg);
  border: 1px solid var(--danger-stroke);
  color: #7f1d1d;
}

/* zone des slaves */
.slaveGridOuter {
  width: 100%;
  display: flex;
  justify-content: center;
}
.slaveGrid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  width: 100%;
}

/* carte SLAVE individuelle */
.slaveCard {
  position: relative;
  flex: 0 1 clamp(var(--slave-minw),20vw,var(--slave-maxw));
  min-width: var(--slave-minw);
  max-width: var(--slave-maxw);
  min-height: 260px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-stroke);
  border-radius: 20px;
  backdrop-filter: var(--panel-backdrop-blur);
  -webkit-backdrop-filter: var(--panel-backdrop-blur);
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  padding: 16px 12px 14px;
  color: var(--text-main);
}

/* petit bouton "i" et menu ... */
.slaveTopRow {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.infoBtn,
.moreBtn {
  cursor: pointer;
  background: rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 999px;
  font-size: 11px;
  line-height:1;
  padding: 6px 8px;
  color: var(--text-main);
  transition: background .15s, color .15s;
}
.infoBtn:hover,
.moreBtn:hover {
  background: rgba(0,0,0,0.08);
}

/* Nom du slave + état PC */
.slaveNameBlock {
  text-align: center;
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  align-items:center;
  justify-content: flex-start;
  min-height: 80px;
  margin-bottom: 8px;
}
.slaveName {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-main);
  word-break: break-word;
  text-align: center;
}
.slavePcState {
  margin-top: 6px;
  font-size: 13px;
  line-height:1.3;
  color: var(--text-dim);
}

/* barre de progression noire */
.progressOuter {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: rgba(0,0,0,0.08);
  overflow: hidden;
  margin: 8px 0 12px;
}
.progressFill {
  height: 100%;
  background: rgba(0,0,0,0.8);
  width: 0%;
  transition: width .2s;
}
.progressFill.queue { width:33%; }
.progressFill.send { width:66%; }
.progressFill.hacked { width:100%; }

/* rangée de boutons ronds */
.slaveBtns {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: nowrap;
  margin-top: auto;
}
.iconBtn {
  width: 44px;
  height: 44px;
  min-width:44px;
  min-height:44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(0,0,0,0.15);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  transition: background .15s, box-shadow .15s, transform .1s;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.iconBtn:hover {
  background: rgba(0,0,0,0.08);
  box-shadow:0 8px 20px rgba(0,0,0,0.2);
}
.iconBtn:active {
  transform: scale(.96);
}

/* panneau info */
.infoPanel {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 64px;
  background: rgba(255,255,255,0.9);
  border:1px solid rgba(0,0,0,0.15);
  border-radius:16px;
  box-shadow:0 20px 40px rgba(0,0,0,0.2);
  padding:12px;
  font-size:12px;
  line-height:1.4;
  color:#000;
  z-index:20;
}
.infoLineLabel {
  font-weight:500;
  color:#000;
}
.infoMac {
  font-family: ui-monospace, monospace;
  font-size:12px;
  word-break: break-word;
  color:#000;
}
.renameRow {
  display:flex;
  align-items:center;
  gap:6px;
  margin-top:8px;
}
.renameInput {
  flex:1;
  font-size:12px;
  padding:6px 8px;
  line-height:1.2;
  border-radius:10px;
  border:1px solid rgba(0,0,0,0.3);
  background:#fff;
  color:#000;
}
.renameSaveBtn {
  font-size:12px;
  border-radius:10px;
  background:#000;
  color:#fff;
  border:1px solid #000;
  line-height:1.2;
  padding:6px 8px;
  cursor:pointer;
}

/* panneau "..." */
.morePanel {
  position: absolute;
  right: 8px;
  bottom: 64px;
  background: rgba(255,255,255,0.95);
  border:1px solid rgba(0,0,0,0.15);
  border-radius:16px;
  box-shadow:0 20px 40px rgba(0,0,0,0.25);
  padding:10px;
  font-size:12px;
  line-height:1.35;
  color:#000;
  z-index:30;
  min-width:120px;
}
.moreActionBtn {
  width:100%;
  text-align:left;
  background:transparent;
  border:0;
  padding:6px 8px;
  border-radius:8px;
  color:#000;
  cursor:pointer;
  display:block;
  font-size:12px;
}
.moreActionBtn:hover {
  background:rgba(0,0,0,0.07);
}

/* hr light */
.masterHr {
  width:100%;
  height:1px;
  background: rgba(0,0,0,0.07);
  border-radius:1px;
  margin-top:4px;
  margin-bottom:8px;
}

/* commandes récentes */
.cmdSectionHeader {
  font-size:12px;
  font-weight:500;
  color: var(--text-dim);
}
.cmdList {
  margin:0;
  padding-left:18px;
  max-height:140px;
  overflow:auto;
  font-size:12px;
  line-height:1.4;
  color:var(--text-main);
}
.cmdList code {
  background:rgba(0,0,0,0.06);
  border-radius:6px;
  padding:2px 4px;
  font-size:11px;
}

/* journal global debug */
.logWrap {
  border-radius:16px;
  background: rgba(255,255,255,0.25);
  border:1px solid rgba(255,255,255,0.45);
  box-shadow:0 20px 60px rgba(0,0,0,0.15);
  padding:12px 16px 16px;
  backdrop-filter: var(--panel-backdrop-blur);
  -webkit-backdrop-filter: var(--panel-backdrop-blur);
  max-width:1300px;
  width:100%;
  margin:0 auto 40px;
}
.logTitle {
  font-size:13px;
  font-weight:600;
  color:var(--text-main);
  margin:0 0 8px;
}
.logBox {
  white-space:pre-wrap;
  background:rgba(0,0,0,0.7);
  color:#fff;
  font-size:12px;
  line-height:1.4;
  border-radius:12px;
  padding:10px;
  height:150px;
  overflow:auto;
  border:1px solid rgba(0,0,0,0.8);
}

/* dialog pairing */
dialog[open] {
  border:1px solid rgba(0,0,0,0.25);
  border-radius:20px;
  background:#fff;
  color:#000;
  max-width:320px;
  box-shadow:0 40px 120px rgba(0,0,0,0.4);
  font-size:14px;
}
.pairInner {
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:12px;
}
.pairTitle {
  font-size:15px;
  font-weight:600;
  color:#000;
  margin:0;
}
.pairCodeBox code {
  background:#000;
  color:#fff;
  padding:2px 6px;
  border-radius:6px;
}
.smallText {
  font-size:12px;
  color:#555;
  line-height:1.4;
}
.closeBtnRow {
  display:flex;
  justify-content:flex-end;
}
.closeBtn {
  background:#000;
  color:#fff;
  border:1px solid #000;
  border-radius:10px;
  font-size:13px;
  line-height:1.2;
  padding:6px 10px;
  cursor:pointer;
}
`;

/* =========================
   HELPERS
   ========================= */

function fmtTS(s) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function isLiveDevice(dev) {
  if (!dev?.last_seen) return false;
  return Date.now() - new Date(dev.last_seen) < LIVE_TTL_MS;
}

// fallback nom si pas de friendly_name
function fallbackSlaveName(mac) {
  if (!mac) return "—";
  const parts = mac.split(":").map((p) => p.toUpperCase());
  return parts.slice(-3).join(":"); // ex: "AA:BB:CC"
}

/* =========================
   SLAVE CARD
   ========================= */
function SlaveCard({
  mac,
  displayName,
  pcOn,
  phase,
  infoOpen,
  moreOpen,
  editName,
  onEditNameChange,
  onSubmitRename,
  onToggleInfo,
  onToggleMore,
  onIO,
  onReset,
  onForceOff,
  onHardReset,
}) {
  const pcStateTxt =
    pcOn === true
      ? "Ordinateur allumé"
      : pcOn === false
      ? "Ordinateur éteint"
      : "État inconnu";

  const pcStateColor =
    pcOn === true
      ? { color: "#065f46" }
      : pcOn === false
      ? { color: "#991b1b" }
      : { color: "var(--text-dim)" };

  return (
    <div className="slaveCard">
      <div className="slaveTopRow">
        <button className="infoBtn" onClick={onToggleInfo}>
          i
        </button>
        <button className="moreBtn" onClick={onToggleMore}>
          •••
        </button>
      </div>

      <div className="slaveNameBlock">
        <div className="slaveName">{displayName}</div>
        <div className="slavePcState" style={pcStateColor}>
          {pcStateTxt}
        </div>

        <div className="progressOuter">
          {phase ? (
            <div
              className={
                "progressFill " +
                (phase === "queue"
                  ? "queue"
                  : phase === "send"
                  ? "send"
                  : phase === "hacked"
                  ? "hacked"
                  : "")
              }
            />
          ) : (
            <div className="progressFill" />
          )}
        </div>
      </div>

      <div className="slaveBtns">
        <button className="iconBtn" title="Impulsion IO" onClick={onIO}>
          ⏻
        </button>
        <button className="iconBtn" title="Reset normal" onClick={onReset}>
          ↺
        </button>
        <button className="iconBtn" title="Plus" onClick={onToggleMore}>
          ⋯
        </button>
      </div>

      {infoOpen && (
        <div className="infoPanel">
          <div>
            <span className="infoLineLabel">MAC : </span>
            <span className="infoMac">{mac}</span>
          </div>

          <div className="renameRow">
            <input
              className="renameInput"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              placeholder="Nom du slave"
            />
            <button className="renameSaveBtn" onClick={onSubmitRename}>
              OK
            </button>
          </div>
        </div>
      )}

      {moreOpen && (
        <div className="morePanel">
          <button className="moreActionBtn" onClick={onForceOff}>
            ⚠ Force OFF
          </button>
          <button className="moreActionBtn" onClick={onHardReset}>
            ⚡ Hard Reset
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================
   APP
   ========================= */
export default function App() {
  /* ---------- auth / session ---------- */
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  /* ---------- devices / slaves ---------- */
  // devices = liste des masters
  const [devices, setDevices] = useState([]);

  // nodesByMaster = { masterId: [ { mac, friendly_name, pc_on }, ... ] }
  const [nodesByMaster, setNodesByMaster] = useState({});

  // UI par slave (phase, infoOpen, moreOpen, editName...)
  const [slaveUI, setSlaveUI] = useState({});

  // pair dialog
  const [pair, setPair] = useState({
    open: false,
    code: null,
    expires_at: null,
  });

  // logs
  const [lines, setLines] = useState([]);
  const logRef = useRef(null);
  const log = (t) => {
    setLines((ls) => [...ls, `${new Date().toLocaleTimeString()}  ${t}`]);
  };
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  // liste des commandes par master pour affichage
  const cmdLists = useRef(new Map());
  function upsertCmdRow(masterId, c) {
    const ul = cmdLists.current.get(masterId);
    if (!ul) return;
    const rowId = `cmd-${c.id}`;
    const html = `<code>${c.status}</code> · ${c.action}${
      c.target_mac ? " → " + c.target_mac : " (local)"
    } <span style="color:rgba(0,0,0,0.5)">· ${fmtTS(c.created_at)}</span>`;
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

  // realtime refs
  const chDevices = useRef(null);
  const chNodes = useRef(null);
  const chCmds = useRef(null);

  function cleanupRealtime() {
    if (chDevices.current) sb.removeChannel(chDevices.current);
    if (chNodes.current) sb.removeChannel(chNodes.current);
    if (chCmds.current) sb.removeChannel(chCmds.current);
    chDevices.current = chNodes.current = chCmds.current = null;
  }

  /* =========================
     UI helpers / per-slave state
     ========================= */
  function bumpSlavePhase(mac, newPhase) {
    setSlaveUI((prev) => ({
      ...prev,
      [mac]: {
        ...(prev[mac] || {}),
        phase: newPhase,
      },
    }));
  }

  function bumpSlavePhaseFromStatus(mac, status) {
    if (!mac) return;

    const st = (status || "").toUpperCase();
    const queuedStates = ["QUEUED", "PENDING"];
    const sentStates = ["SENT", "DELIVERED"];
    const doneStates = ["DONE", "ACK", "OK", "SUCCESS"];

    if (queuedStates.includes(st)) {
      bumpSlavePhase(mac, "queue");
      return;
    }
    if (sentStates.includes(st)) {
      bumpSlavePhase(mac, "send");
      return;
    }
    if (doneStates.includes(st)) {
      bumpSlavePhase(mac, "hacked");
      setTimeout(() => {
        bumpSlavePhase(mac, null);
      }, 800);
      return;
    }

    bumpSlavePhase(mac, null);
  }

  function toggleInfo(mac) {
    setSlaveUI((prev) => ({
      ...prev,
      [mac]: {
        ...(prev[mac] || {}),
        infoOpen: !prev[mac]?.infoOpen,
        moreOpen: false,
      },
    }));
  }

  function toggleMore(mac) {
    setSlaveUI((prev) => ({
      ...prev,
      [mac]: {
        ...(prev[mac] || {}),
        moreOpen: !prev[mac]?.moreOpen,
        infoOpen: false,
      },
    }));
  }

  function handleEditNameChange(mac, val) {
    setSlaveUI((prev) => ({
      ...prev,
      [mac]: {
        ...(prev[mac] || {}),
        editName: val,
      },
    }));
  }

  async function handleSubmitRename(masterId, mac) {
    const newName = (slaveUI[mac]?.editName || "").trim();
    if (!newName) {
      log(`rename ignoré (vide) pour ${mac}`);
      return;
    }
    const { error } = await sb
      .from("nodes")
      .update({ friendly_name: newName })
      .match({ master_id: masterId, slave_mac: mac });

    if (error) {
      log("rename err: " + error.message);
      return;
    }

    log(`rename OK ${mac} -> ${newName}`);

    setNodesByMaster((prev) => {
      const list = prev[masterId] || [];
      const updated = list.map((sl) =>
        sl.mac === mac ? { ...sl, friendly_name: newName } : sl
      );
      return { ...prev, [masterId]: updated };
    });

    setSlaveUI((prev) => ({
      ...prev,
      [mac]: {
        ...(prev[mac] || {}),
        infoOpen: false,
      },
    }));
  }

  /* =========================
     DB fetch helpers
     ========================= */

  // Essaie de SELECT avec pc_on. Si ça échoue (colonne absente),
  // retente sans pc_on pour ne pas bloquer l'UI.
  async function fetchNodesAllMasters() {
    // tentative avec pc_on
    let { data: nodes, error } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");

    if (error) {
      // fallback sans pc_on
      log("Err nodes (avec pc_on): " + error.message + " -> retry sans pc_on");
      const fallback = await sb
        .from("nodes")
        .select("master_id,slave_mac,friendly_name");
      nodes = fallback.data;
      error = fallback.error;
    }

    if (error) {
      log("Err nodes (fallback): " + error.message);
      return {};
    }

    const map = {};
    (nodes || []).forEach((n) => {
      if (!map[n.master_id]) map[n.master_id] = [];
      map[n.master_id].push({
        mac: n.slave_mac,
        friendly_name: n.friendly_name || null,
        pc_on:
          typeof n.pc_on === "boolean" ? n.pc_on : undefined,
      });
    });
    return map;
  }

  async function fetchNodesForMaster(masterId) {
    // tentative avec pc_on
    let { data, error } = await sb
      .from("nodes")
      .select("slave_mac,friendly_name,pc_on")
      .eq("master_id", masterId);

    if (error) {
      log(
        "Err nodes refresh (avec pc_on): " +
          error.message +
          " -> retry sans pc_on"
      );
      const fallback = await sb
        .from("nodes")
        .select("slave_mac,friendly_name")
        .eq("master_id", masterId);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      log("Err nodes refresh (fallback): " + error.message);
      return [];
    }

    return (data || []).map((x) => ({
      mac: x.slave_mac,
      friendly_name: x.friendly_name || null,
      pc_on:
        typeof x.pc_on === "boolean" ? x.pc_on : undefined,
    }));
  }

  async function loadAll() {
    // masters
    const { data: devs, error: ed } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });

    if (ed) {
      log("Err devices: " + ed.message);
      return;
    }
    setDevices(devs || []);

    // slaves (tous masters)
    const map = await fetchNodesAllMasters();
    setNodesByMaster(map);

    // commandes
    for (const d of devs || []) {
      await refreshCommands(d.id);
    }
  }

  async function refreshSlavesFor(masterId) {
    const list = await fetchNodesForMaster(masterId);
    setNodesByMaster((m) => ({
      ...m,
      [masterId]: list,
    }));
  }

  async function refreshCommands(mid) {
    const { data, error } = await sb
      .from("commands")
      .select("id,action,target_mac,status,created_at")
      .eq("master_id", mid)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      log("Err cmds: " + error.message);
      return;
    }
    const ul = cmdLists.current.get(mid);
    if (!ul) return;
    ul.innerHTML = "";
    (data || []).forEach((c) => {
      upsertCmdRow(mid, c);
    });
  }

  /* =========================
     COMMANDS to Supabase
     ========================= */
  async function sendCmd(mid, mac, action, payload = {}) {
    if (mac) {
      bumpSlavePhase(mac, "queue");
    }
    const { error } = await sb.from("commands").insert({
      master_id: mid,
      target_mac: mac || null,
      action,
      payload,
    });
    if (error) {
      log("cmd err: " + error.message);
    } else {
      log(`[cmd] ${action} → ${mid}${mac ? " ▶ " + mac : ""}`);
    }
  }

  async function renameMaster(id) {
    const name = prompt("Nouveau nom du master ?", "");
    if (!name) return;
    const { error } = await sb.from("devices").update({ name }).eq("id", id);
    if (error) alert(error.message);
    else log(`Renommé ${id} → ${name}`);
  }

  async function deleteDevice(id) {
    if (!confirm(`Supprimer ${id} ?`)) return;
    const {
      data: { session },
      error: sessErr,
    } = await sb.auth.getSession();
    if (sessErr) {
      log("auth session err: " + sessErr.message);
    }
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
          apikey: SUPA_ANON,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ master_id: id }),
      }
    );
    log(
      r.ok
        ? `MASTER supprimé : ${id}`
        : `❌ Suppression : ${await r.text()}`
    );
  }

  async function openPairDialog() {
    const {
      data: { session },
      error: sessErr,
    } = await sb.auth.getSession();
    if (sessErr) {
      log("auth session err: " + sessErr.message);
    }
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
            apikey: SUPA_ANON,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ttl_minutes: 10 }),
        }
      );
      if (!r.ok) {
        const msg = await r.text();
        alert(msg);
        log("pair_code err: " + msg);
        return;
      }
      const { code, expires_at } = await r.json();
      setPair({ open: true, code, expires_at });
      log(`Pair-code ${code}`);
    } catch (e) {
      log("Erreur pair-code: " + e);
    }
  }

  /* =========================
     AUTH bootstrap + realtime
     ========================= */
  useEffect(() => {
    const sub = sb.auth.onAuthStateChange((ev, session) => {
      setUser(session?.user || null);
      setAuthReady(true);

      if (session?.user) {
        attachRealtime();
        loadAll();
      } else {
        cleanupRealtime();
        setDevices([]);
        setNodesByMaster({});
      }
    });

    (async () => {
      const { data: { session }, error: sessErr } =
        await sb.auth.getSession();
      if (sessErr) {
        log("auth init err: " + sessErr.message);
      }
      setUser(session?.user || null);
      setAuthReady(true);

      if (session?.user) {
        attachRealtime();
        loadAll();
      }
    })();

    return () => {
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function attachRealtime() {
    cleanupRealtime();

    // devices
    chDevices.current = sb
      .channel("rt:devices")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "devices" },
        (p) => {
          log(`+ device ${p.new.id}`);
          setDevices((ds) => [p.new, ...ds]);
          refreshCommands(p.new.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "devices" },
        (p) => {
          const d = p.new;
          setDevices((ds) =>
            ds.map((x) => (x.id === d.id ? { ...x, ...d } : x))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "devices" },
        (p) => {
          log(`- device ${p.old.id}`);
          setDevices((ds) => ds.filter((x) => x.id !== p.old.id));
        }
      )
      .subscribe();

    // nodes
    chNodes.current = sb
      .channel("rt:nodes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nodes" },
        (p) => {
          log(`+ node ${p.new.slave_mac} → ${p.new.master_id}`);
          refreshSlavesFor(p.new.master_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "nodes" },
        (p) => {
          log(`- node ${p.old.slave_mac} ← ${p.old.master_id}`);
          refreshSlavesFor(p.old.master_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "nodes" },
        (p) => {
          log(`~ node ${p.new.slave_mac} (${p.new.master_id}) update`);
          refreshSlavesFor(p.new.master_id);
        }
      )
      .subscribe();

    // commands
    chCmds.current = sb
      .channel("rt:commands")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "commands" },
        (p) => {
          upsertCmdRow(p.new.master_id, p.new);
          log(
            `cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`
          );
          if (p.new.target_mac) {
            bumpSlavePhaseFromStatus(p.new.target_mac, p.new.status);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "commands" },
        (p) => {
          upsertCmdRow(p.new.master_id, p.new);
          log(
            `cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`
          );
          if (p.new.target_mac) {
            bumpSlavePhaseFromStatus(p.new.target_mac, p.new.status);
          }
        }
      )
      .subscribe();
  }

  /* =========================
     RENDER
     ========================= */

  if (!authReady) {
    return (
      <>
        <style>{styles}</style>
        <header className="appHeader">
          <div className="appHeader-left">
            <div className="appTitle">REMOTE POWER</div>
            <div className="appSub">Initialisation de la session…</div>
            <div className="appSession">Session: inconnue</div>
          </div>
          <div className="appHeader-right" />
        </header>

        <main className="appMainOuter">
          <div className="logWrap">
            <p className="logTitle">Journal</p>
            <div className="logBox" ref={logRef}>
              {lines.join("\n")}
            </div>
          </div>
        </main>
      </>
    );
  }

  const headerRight = (
    <div className="appHeader-right">
      <div style={{ color: "var(--text-dim)" }}>
        {user?.email || "non connecté"}
      </div>

      {!user ? (
        <button
          className="topBtn primary"
          onClick={async () => {
            const { data, error } = await sb.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: location.href,
                queryParams: { prompt: "select_account" },
              },
            });
            if (error) {
              alert(error.message);
              log("auth signIn error: " + error.message);
            } else if (data?.url) {
              window.location = data.url;
            }
          }}
        >
          <span>Connexion Google</span>
        </button>
      ) : (
        <button
          className="topBtn"
          onClick={async () => {
            const { error } = await sb.auth.signOut();
            if (error) {
              log("auth signOut error: " + error.message);
            }
          }}
        >
          Déconnexion
        </button>
      )}

      {user && (
        <button className="topBtn" onClick={openPairDialog}>
          <span>＋ Ajouter un MASTER</span>
        </button>
      )}

      {user && (
        <button className="topBtn" onClick={loadAll}>
          Rafraîchir
        </button>
      )}
    </div>
  );

  return (
    <>
      <style>{styles}</style>

      {/* HEADER STICKY */}
      <header className="appHeader">
        <div className="appHeader-left">
          <div className="appTitle">REMOTE POWER</div>
          <div className="appSub">Compte : {user?.email || "—"}</div>
          <div className="appSession">
            Session: {user ? "connectée" : "déconnectée"}
          </div>
        </div>
        {headerRight}
      </header>

      {/* CONTENU */}
      <main className="appMainOuter">
        {devices.map((dev) => {
          const live = isLiveDevice(dev);
          const slaveList = nodesByMaster[dev.id] || [];

          return (
            <section className="masterCard" key={dev.id}>
              <div className="masterTopRow">
                <div className="masterLeft">
                  <div className="masterNameRow">
                    <div className="masterNameTxt">
                      {dev.name || dev.id}
                    </div>
                    {live ? (
                      <div className="badgeOnline">
                        <span
                          style={{
                            display: "inline-block",
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#10b981",
                          }}
                        />
                        <span>En ligne</span>
                      </div>
                    ) : (
                      <div className="badgeOffline">
                        <span
                          style={{
                            display: "inline-block",
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#dc2626",
                          }}
                        />
                        <span>Hors ligne</span>
                      </div>
                    )}
                  </div>

                  <div className="masterMeta">
                    <div>
                      Dernier contact : {fmtTS(dev.last_seen) || "jamais"}
                    </div>
                    <div>ID : {dev.id}</div>
                    <div>MAC : {dev.master_mac || "—"}</div>
                  </div>
                </div>

                <div className="masterActions">
                  <div className="masterButtonsRow">
                    <button
                      className="miniBtn"
                      onClick={() => renameMaster(dev.id)}
                    >
                      Renommer
                    </button>

                    <button
                      className="miniBtn danger"
                      onClick={() => deleteDevice(dev.id)}
                    >
                      Supprimer
                    </button>
                  </div>

                  <div className="masterButtonsRow">
                    <button
                      className="miniBtn"
                      onClick={() =>
                        sendCmd(dev.id, null, "POWER_ON", {})
                      }
                    >
                      Power ON
                    </button>
                    <button
                      className="miniBtn"
                      onClick={() =>
                        sendCmd(dev.id, null, "POWER_OFF", {})
                      }
                    >
                      Power OFF
                    </button>
                    <button
                      className="miniBtn"
                      onClick={() =>
                        sendCmd(dev.id, null, "RESET", {})
                      }
                    >
                      Reset
                    </button>
                  </div>

                  <div className="masterButtonsRow">
                    <button
                      className="miniBtn"
                      onClick={() =>
                        sendCmd(dev.id, null, "PULSE", { ms: 500 })
                      }
                    >
                      Pulse 500 ms
                    </button>
                  </div>
                </div>
              </div>

              <div className="masterHr" />

              <div className="slaveGridOuter">
                <div className="slaveGrid">
                  {slaveList.map((sl) => {
                    const mac = sl.mac;
                    const ui = slaveUI[mac] || {};

                    const nameToShow =
                      ui.editName && ui.editName.trim()
                        ? ui.editName.trim()
                        : sl.friendly_name && sl.friendly_name.trim()
                        ? sl.friendly_name.trim()
                        : fallbackSlaveName(mac);

                    return (
                      <SlaveCard
                        key={mac}
                        mac={mac}
                        displayName={nameToShow}
                        pcOn={sl.pc_on}
                        phase={ui.phase || null}
                        infoOpen={!!ui.infoOpen}
                        moreOpen={!!ui.moreOpen}
                        editName={
                          ui.editName !== undefined
                            ? ui.editName
                            : sl.friendly_name || ""
                        }
                        onEditNameChange={(val) =>
                          handleEditNameChange(mac, val)
                        }
                        onSubmitRename={() =>
                          handleSubmitRename(dev.id, mac)
                        }
                        onToggleInfo={() => toggleInfo(mac)}
                        onToggleMore={() => toggleMore(mac)}
                        onIO={() =>
                          sendCmd(dev.id, mac, "SLV_IO", {
                            pin: DEFAULT_IO_PIN,
                            mode: "OUT",
                            value: 1,
                          })
                        }
                        onReset={() =>
                          sendCmd(dev.id, mac, "SLV_RESET", {})
                        }
                        onForceOff={() =>
                          sendCmd(dev.id, mac, "SLV_FORCE_OFF", {})
                        }
                        onHardReset={() =>
                          sendCmd(dev.id, mac, "SLV_HARD_RESET", {
                            ms: 3000,
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>

              <div className="masterHr" />

              <div className="cmdSectionHeader">
                Commandes (20 dernières)
              </div>
              <ul
                className="cmdList"
                ref={(el) => {
                  if (el) cmdLists.current.set(dev.id, el);
                }}
              />
            </section>
          );
        })}

        <div className="logWrap">
          <p className="logTitle">Journal</p>
          <div className="logBox" ref={logRef}>
            {lines.join("\n")}
          </div>
        </div>
      </main>

      {pair.open && (
        <dialog
          open
          onClose={() =>
            setPair({ open: false, code: null, expires_at: null })
          }
        >
          <div className="pairInner">
            <h3 className="pairTitle">Appairer un MASTER</h3>
            <div className="pairCodeBox">
              Code :{" "}
              <code>
                {String(pair.code || "").padStart(6, "0")}
              </code>{" "}
              (expire{" "}
              <span className="smallText">
                {(() => {
                  const end = pair.expires_at
                    ? new Date(pair.expires_at).getTime()
                    : 0;
                  const l = Math.max(
                    0,
                    Math.floor((end - Date.now()) / 1000)
                  );
                  return `${Math.floor(l / 60)}:${String(
                    l % 60
                  ).padStart(2, "0")}`;
                })()}
              </span>
              )
            </div>
            <div className="smallText">
              Saisis ce code dans le portail Wi-Fi de l’ESP32.
            </div>
            <div className="closeBtnRow">
              <button
                className="closeBtn"
                onClick={() =>
                  setPair({
                    open: false,
                    code: null,
                    expires_at: null,
                  })
                }
              >
                Fermer
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
