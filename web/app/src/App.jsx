import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   CONFIG SUPABASE
   ========================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const sb =
  SUPABASE_URL && SUPA_ANON_KEY
    ? createClient(SUPABASE_URL, SUPA_ANON_KEY)
    : null;

const LIVE_TTL_MS = 25_000;
const DEFAULT_IO_PIN = 26;

// Image de fond de la page
const BACKGROUND_IMAGE_URL =
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60";

/* =========================================================
   PALETTE / COULEURS / TOKENS
   ========================================================= */
const COLORS = {
  textMain: "#0f172a",
  textWeak: "rgba(15,23,42,0.6)",
  textWeaker: "rgba(15,23,42,0.4)",

  glassBorder: "rgba(0,0,0,0.08)",
  glassFillHi: "rgba(255,255,255,0.45)",
  glassFillLo: "rgba(255,255,255,0.25)",
  glassFillTileHi: "rgba(255,255,255,0.18)",
  glassFillTileLo: "rgba(255,255,255,0.08)",

  btnBorder: "rgba(0,0,0,0.2)",
  dangerText: "#7f1d1d",
  dangerBorder: "rgba(127,29,29,0.3)",

  onlineBg: "rgba(16,185,129,0.15)",
  onlineText: "#065f46",
  onlineBorder: "rgba(5,150,105,0.4)",

  offlineBg: "rgba(239,68,68,0.12)",
  offlineText: "#7f1d1d",
  offlineBorder: "rgba(127,29,29,0.4)",

  pcOnText: "#065f46",
  pcOffText: "#7f1d1d",
};

/* =========================================================
   HELPERS
   ========================================================= */
const fmtTS = (s) => (s ? new Date(s).toLocaleString() : "jamais");
const isLive = (device) => {
  if (!device.last_seen) return false;
  return Date.now() - new Date(device.last_seen) < LIVE_TTL_MS;
};

/* =========================================================
   BOUTON ROND (IO / RESET / … / OFF / HARD)
   ========================================================= */
function CircleButton({ label, tone = "normal", sizePx = 48, onClick }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);

  const baseBorder =
    tone === "danger" ? COLORS.dangerBorder : COLORS.btnBorder;
  const baseColor = tone === "danger" ? COLORS.dangerText : COLORS.textMain;

  const bgHover =
    tone === "danger"
      ? "rgba(127,29,29,0.07)"
      : "rgba(0,0,0,0.05)";
  const bgActive =
    tone === "danger"
      ? "rgba(127,29,29,0.12)"
      : "rgba(0,0,0,0.1)";

  const styleBtn = {
    borderRadius: 9999,
    border: `1px solid ${baseBorder}`,
    background: active
      ? bgActive
      : hover
      ? bgHover
      : "rgba(255,255,255,0.2)",
    boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
    color: baseColor,
    minWidth: sizePx,
    minHeight: sizePx,
    width: sizePx,
    height: sizePx,
    fontSize: sizePx < 44 ? 10 : 11,
    fontWeight: 500,
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <button
      style={styleBtn}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      {label}
    </button>
  );
}

/* =========================================================
   SLAVE CARD
   ========================================================= */
function SlaveCard({
  nameShort,
  editName,
  onEditNameChange,
  onSubmitRename,
  mac,
  isOn,
  phase, // "queue"|"send"|"hacked"|null
  isInfoOpen,
  onToggleInfo,
  isMoreOpen,
  onMoreToggle,
  onIO,
  onReset,
  onForceOff,
  onHardReset,
}) {
  const cardRef = useRef(null);
  const [cardW, setCardW] = useState(180);

  // resize pour boutons responsives
  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        setCardW(w);
      }
    });
    ro.observe(cardRef.current);
    return () => {
      ro.disconnect();
    };
  }, []);

  const btnSize = useMemo(() => {
    const clamped = Math.max(38, Math.min(52, cardW * 0.26));
    return Math.round(clamped);
  }, [cardW]);

  // barre noire en bas de l'état
  let pct = 0;
  let showBar = false;
  if (phase === "queue") {
    pct = 33;
    showBar = true;
  } else if (phase === "send") {
    pct = 66;
    showBar = true;
  } else if (phase === "hacked") {
    pct = 100;
    showBar = true;
  }

  // styles
  const styleTile = {
    borderRadius: 20,
    padding: 16,
    background: `linear-gradient(to bottom right, ${COLORS.glassFillTileHi}, ${COLORS.glassFillTileLo})`,
    border: `1px solid ${COLORS.glassBorder}`,
    boxShadow: "0 24px 48px rgba(0,0,0,0.08)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    color: COLORS.textMain,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",

    height: 256,
    width: "clamp(160px,40vw,192px)",
  };

  const styleTopBar = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    minHeight: 24,
  };

  const styleInfoBtn = {
    background: "transparent",
    border: `1px solid ${COLORS.btnBorder}`,
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
    color: COLORS.textMain,
    cursor: "pointer",
    lineHeight: 1,
  };

  const styleInfoBox = {
    fontSize: 12,
    lineHeight: 1.4,
    color: COLORS.textWeak,
    background: "rgba(255,255,255,0.3)",
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: 14,
    padding: 10,
    wordBreak: "break-word",
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const styleNameEditRow = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  };

  const styleNameInput = {
    flexGrow: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 1.3,
    color: COLORS.textMain,
    background: "rgba(255,255,255,0.6)",
    border: `1px solid ${COLORS.btnBorder}`,
    borderRadius: 8,
    padding: "4px 6px",
    outline: "none",
  };

  const styleRenameBtn = {
    fontSize: 11,
    lineHeight: 1.2,
    fontWeight: 500,
    color: COLORS.textMain,
    background: "transparent",
    border: `1px solid ${COLORS.btnBorder}`,
    borderRadius: 9999,
    padding: "4px 8px",
    cursor: "pointer",
  };

  const styleNameBig = {
    flexShrink: 0,
    textAlign: "center",
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    color: COLORS.textMain,
    letterSpacing: "-0.03em",
    marginTop: isInfoOpen ? 12 : 24,
    wordBreak: "break-word",
  };

  const styleStatus = {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 1.3,
    fontWeight: 500,
    color: isOn ? COLORS.pcOnText : COLORS.pcOffText,
    marginTop: 4,
  };

  const styleProgressOuter = {
    marginTop: 6,
    height: 4,
    width: "100%",
    borderRadius: 9999,
    background: "rgba(0,0,0,0.15)",
    overflow: "hidden",
  };

  const styleProgressInner = {
    height: "100%",
    width: pct + "%",
    background: "#000",
    transition: "width 0.2s ease",
  };

  const styleBottomBlock = {
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: "auto",
  };

  const styleBtnRow = {
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  const styleMoreZone = {
    display: isMoreOpen ? "flex" : "none",
    flexDirection: "column",
    gap: 8,
  };

  const styleDangerRow = {
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  return (
    <div style={styleTile} ref={cardRef}>
      {/* petit bouton "i" en haut à droite */}
      <div style={styleTopBar}>
        <button
          style={styleInfoBtn}
          onClick={onToggleInfo}
          title="Infos / Renommer"
        >
          i
        </button>
      </div>

      {isInfoOpen && (
        <div style={styleInfoBox}>
          <div style={styleNameEditRow}>
            <input
              style={styleNameInput}
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
            />
            <button style={styleRenameBtn} onClick={onSubmitRename}>
              Renommer
            </button>
          </div>
          <div>
            MAC : <code>{mac}</code>
          </div>
        </div>
      )}

      {/* Nom du slave */}
      <div style={styleNameBig}>{nameShort}</div>

      {/* État ordinateur */}
      <div style={styleStatus}>
        {isOn ? "Ordinateur allumé" : "Ordinateur éteint"}
      </div>

      {/* Barre noire d'état commande */}
      {showBar && (
        <div style={styleProgressOuter}>
          <div style={styleProgressInner} />
        </div>
      )}

      {/* Boutons du bas */}
      <div style={styleBottomBlock}>
        <div style={styleBtnRow}>
          <CircleButton label="IO" sizePx={btnSize} onClick={onIO} />
          <CircleButton
            label="RESET"
            sizePx={btnSize}
            onClick={onReset}
          />
          <CircleButton
            label="…"
            sizePx={btnSize}
            onClick={onMoreToggle}
          />
        </div>

        <div style={styleMoreZone}>
          <div style={styleDangerRow}>
            <CircleButton
              label="OFF"
              tone="danger"
              sizePx={btnSize}
              onClick={onForceOff}
            />
            <CircleButton
              label="HARD"
              tone="danger"
              sizePx={btnSize}
              onClick={onHardReset}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MASTER CARD
   ========================================================= */
function MasterCard({
  name,
  id,
  mac,
  lastSeen,
  live,
  infoOpen,
  onToggleInfo,
  onRename,
  onDelete,
  slaves,
  onIOPulse,
  onPowerOn,
  onPowerOff,
  onReset,
}) {
  const badgeBase = {
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 500,
    borderRadius: 9999,
    padding: "2px 8px",
    border: "1px solid transparent",
  };
  const badgeStyle = live
    ? {
        ...badgeBase,
        background: COLORS.onlineBg,
        color: COLORS.onlineText,
        border: `1px solid ${COLORS.onlineBorder}`,
      }
    : {
        ...badgeBase,
        background: COLORS.offlineBg,
        color: COLORS.offlineText,
        border: `1px solid ${COLORS.offlineBorder}`,
      };

  const cardStyle = {
    borderRadius: 24,
    padding: 20,
    background: `linear-gradient(to bottom right, ${COLORS.glassFillHi}, ${COLORS.glassFillLo})`,
    border: `1px solid ${COLORS.glassBorder}`,
    boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    color: COLORS.textMain,
    display: "flex",
    flexDirection: "column",
    gap: 16,

    // un peu plus large pour mieux voir les slaves
    maxWidth: "100%",
  };

  const headerRow = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  };

  const leftCol = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  };

  const masterTopLine = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  };

  const masterName = {
    fontSize: 15,
    fontWeight: 600,
    color: COLORS.textMain,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
    wordBreak: "break-word",
  };

  const masterDetailsBox = {
    fontSize: 12,
    lineHeight: 1.4,
    color: COLORS.textWeak,
    background: "rgba(255,255,255,0.3)",
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: 16,
    padding: 12,
    wordBreak: "break-word",
  };

  const rightAct = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  };

  const miniBtn = {
    background: "transparent",
    border: `1px solid ${COLORS.btnBorder}`,
    color: COLORS.textMain,
    fontSize: 11,
    lineHeight: 1.2,
    borderRadius: 9999,
    padding: "6px 12px",
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const miniBtnDanger = {
    ...miniBtn,
    color: COLORS.dangerText,
    border: `1px solid ${COLORS.dangerBorder}`,
  };

  const infoCircle = {
    background: "transparent",
    border: `1px solid ${COLORS.btnBorder}`,
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
    color: COLORS.textMain,
    cursor: "pointer",
    lineHeight: 1,
  };

  const slavesWrap = {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "center", // 👈 centrage horizontal
  };

  const noSlaveMsg = {
    fontSize: 12,
    lineHeight: 1.4,
    color: COLORS.textWeaker,
    textAlign: "center",
    fontStyle: "italic",
    padding: "24px 12px",
  };

  const divider = {
    height: 1,
    background: "rgba(0,0,0,0.07)",
  };

  const bottomRow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  };

  const actionChip = {
    background: "transparent",
    border: `1px solid ${COLORS.btnBorder}`,
    borderRadius: 9999,
    color: COLORS.textMain,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <section style={cardStyle}>
      {/* HEADER MASTER */}
      <div style={headerRow}>
        <div style={leftCol}>
          <div style={masterTopLine}>
            <div style={masterName}>{name || id || "MASTER"}</div>
            <span style={badgeStyle}>
              {live ? "EN LIGNE" : "HORS LIGNE"}
            </span>
          </div>

          {infoOpen && (
            <div style={masterDetailsBox}>
              <div>
                ID : <code>{id}</code>
              </div>
              <div>
                MAC : <code>{mac || "—"}</code>
              </div>
              <div>Dernier contact : {fmtTS(lastSeen)}</div>
            </div>
          )}
        </div>

        <div style={rightAct}>
          <button style={miniBtn} onClick={onRename}>
            Renommer
          </button>
          <button style={miniBtnDanger} onClick={onDelete}>
            Supprimer
          </button>
          <button
            style={infoCircle}
            onClick={onToggleInfo}
            title="Infos MASTER"
          >
            i
          </button>
        </div>
      </div>

      {/* SLAVES */}
      <div style={slavesWrap}>
        {slaves.length ? (
          slaves
        ) : (
          <div style={noSlaveMsg}>
            Aucun slave encore appairé.
            <br />
            (Maintiens le bouton PAIR sur le master)
          </div>
        )}
      </div>

      <div style={divider} />

      {/* ACTIONS GLOBALES MASTER */}
      <div style={bottomRow}>
        <button style={actionChip} onClick={onIOPulse}>
          Pulse 500ms
        </button>
        <button style={actionChip} onClick={onPowerOn}>
          Power ON
        </button>
        <button style={actionChip} onClick={onPowerOff}>
          Power OFF
        </button>
        <button style={actionChip} onClick={onReset}>
          Reset
        </button>
      </div>
    </section>
  );
}

/* =========================================================
   APP PRINCIPALE
   ========================================================= */
export default function App() {
  /* ---------- STATES GLOBAUX ---------- */
  const [user, setUser] = useState(null);

  // devices = [{id, name, master_mac, last_seen, online}]
  const [devices, setDevices] = useState([]);

  // nodesByMaster = { master_id: [ { mac, friendly_name?, is_on? } ] }
  const [nodesByMaster, setNodesByMaster] = useState({});
  // phase visuelle barre noire
  const [slavePhase, setSlavePhase] = useState({}); // { mac: "queue"|"send"|"hacked"|null }

  // états UI locaux
  const [openMasterInfo, setOpenMasterInfo] = useState({});
  const [openSlaveInfo, setOpenSlaveInfo] = useState({});
  const [openSlaveMore, setOpenSlaveMore] = useState({});

  // noms éditables slaves
  const [editNames, setEditNames] = useState({});

  // modale Pair-code
  const [pair, setPair] = useState({
    open: false,
    code: null,
    expires_at: null,
  });

  // journal
  const [lines, setLines] = useState([]);
  const logRef = useRef(null);
  const log = (t) =>
    setLines((ls) => [
      ...ls,
      `${new Date().toLocaleTimeString()}  ${t}`,
    ]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  // realtime channels
  const chDevices = useRef(null);
  const chNodes = useRef(null);
  const chCmds = useRef(null);

  /* ---------- TOGGLES UI ---------- */
  const toggleMasterInfo = useCallback((mid) => {
    setOpenMasterInfo((m) => ({ ...m, [mid]: !m[mid] }));
  }, []);

  const toggleSlaveInfo = useCallback((mac) => {
    setOpenSlaveInfo((m) => ({ ...m, [mac]: !m[mac] }));
  }, []);

  const toggleSlaveMore = useCallback((mac) => {
    setOpenSlaveMore((m) => ({ ...m, [mac]: !m[mac] }));
  }, []);

  const updateEditName = useCallback((mac, val) => {
    setEditNames((m) => ({ ...m, [mac]: val }));
  }, []);

  /* =========================================================
     AUTH INIT / STABILISÉ
     ========================================================= */
  useEffect(() => {
    if (!sb) return;
    let mounted = true;

    // 1. récupérer la session actuelle
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!mounted) return;
      setUser(session?.user || null);
      if (session?.user) {
        attachRealtime();
        loadAll();
      }
    })();

    // 2. écouter les changements d'auth
    const { data: sub } = sb.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        setUser(session?.user || null);
        if (session?.user) {
          attachRealtime();
          loadAll();
        } else {
          cleanupRealtime();
          setDevices([]);
          setNodesByMaster({});
          setSlavePhase({});
          log("Déconnecté");
        }
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     REALTIME
     ========================================================= */
  function cleanupRealtime() {
    if (chDevices.current) sb.removeChannel(chDevices.current);
    if (chNodes.current) sb.removeChannel(chNodes.current);
    if (chCmds.current) sb.removeChannel(chCmds.current);
    chDevices.current = chNodes.current = chCmds.current = null;
  }

  async function refreshSlavesFor(masterId) {
    if (!sb) return;
    const { data, error } = await sb
      .from("nodes")
      .select("slave_mac,friendly_name,is_on")
      .eq("master_id", masterId);

    if (error) {
      log("Err load slaves: " + error.message);
      return;
    }

    setNodesByMaster((prev) => {
      const clone = { ...prev };
      clone[masterId] = (data || []).map((n) => ({
        mac: n.slave_mac,
        friendly_name: n.friendly_name || "",
        is_on: !!n.is_on,
      }));
      return clone;
    });

    // init editNames si nécessaire
    setEditNames((prev) => {
      const next = { ...prev };
      (data || []).forEach((n) => {
        if (next[n.slave_mac] == null) {
          next[n.slave_mac] = n.friendly_name || n.slave_mac;
        }
      });
      return next;
    });
  }

  function attachRealtime() {
    if (!sb) return;
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
          refreshSlavesFor(p.new.id);
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
          setDevices((ds) =>
            ds.filter((x) => x.id !== p.old.id)
          );
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
      .subscribe();

    // commands
    chCmds.current = sb
      .channel("rt:commands")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "commands" },
        (p) => {
          bumpSlavePhaseFromStatus(p.new);
          log(
            `cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "commands" },
        (p) => {
          bumpSlavePhaseFromStatus(p.new);
          log(
            `cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`
          );
        }
      )
      .subscribe();
  }

  /* =========================================================
     COMMANDES / PHASE BARRE NOIRE
     ========================================================= */
  function bumpSlavePhase(mac, phase) {
    setSlavePhase((cur) => ({ ...cur, [mac]: phase }));
    if (!phase || phase === "hacked") {
      setTimeout(() => {
        setSlavePhase((cur2) => ({ ...cur2, [mac]: null }));
      }, 2000);
    }
  }

  function bumpSlavePhaseFromStatus(cmdRow) {
    const mac = cmdRow.target_mac;
    if (!mac) return;
    const st = (cmdRow.status || "").toUpperCase();

    if (st === "PENDING" || st === "QUEUED") {
      bumpSlavePhase(mac, "queue");
    } else if (st === "SENT") {
      bumpSlavePhase(mac, "send");
    } else if (st === "FORCE" || st === "HARD") {
      bumpSlavePhase(mac, "hacked");
    } else if (
      st === "DONE" ||
      st === "ACK" ||
      st === "OK"
    ) {
      bumpSlavePhase(mac, null);
    }
  }

  async function sendCmd(masterId, mac, action, payload = {}) {
    if (!sb) return;
    if (mac) bumpSlavePhase(mac, "queue");

    const { error } = await sb.from("commands").insert({
      master_id: masterId,
      target_mac: mac || null,
      action,
      payload,
    });

    if (error) {
      log("cmd err: " + error.message);
      if (mac) {
        setTimeout(() => {
          bumpSlavePhase(mac, null);
        }, 1000);
      }
    } else {
      log(
        `[cmd] ${action} → ${masterId}${
          mac ? " ▶ " + mac : ""
        }`
      );
    }
  }

  // actions slave
  function handleIO(masterId, mac) {
    sendCmd(masterId, mac, "SLV_IO", {
      pin: DEFAULT_IO_PIN,
      mode: "OUT",
      value: 1,
    });
  }
  function handleReset(masterId, mac) {
    sendCmd(masterId, mac, "SLV_RESET", {});
  }
  function handleForceOff(masterId, mac) {
    sendCmd(masterId, mac, "SLV_FORCE_OFF", {});
  }
  function handleHardReset(masterId, mac) {
    sendCmd(masterId, mac, "SLV_HARD_RESET", { ms: 3000 });
  }

  // actions master
  function handlePulse(masterId) {
    sendCmd(masterId, null, "PULSE", { ms: 500 });
  }
  function handlePowerOn(masterId) {
    sendCmd(masterId, null, "POWER_ON", {});
  }
  function handlePowerOff(masterId) {
    sendCmd(masterId, null, "POWER_OFF", {});
  }
  function handleMasterReset(masterId) {
    sendCmd(masterId, null, "RESET", {});
  }

  /* =========================================================
     RENAME MASTER / RENAME SLAVE
     ========================================================= */
  async function renameMaster(id) {
    if (!sb) return;
    const name = prompt("Nouveau nom du master ?", "");
    if (!name) return;
    const { error } = await sb
      .from("devices")
      .update({ name })
      .eq("id", id);
    if (error) alert(error.message);
    else log(`Renommé master ${id} → ${name}`);
  }

  async function renameSlave(mac) {
    if (!sb) return;
    const newName = editNames[mac] || mac;
    // nécessite `friendly_name` dans nodes
    const { error } = await sb
      .from("nodes")
      .update({ friendly_name: newName })
      .eq("slave_mac", mac);
    if (error) {
      alert(error.message);
    } else {
      log(`Renommé slave ${mac} → ${newName}`);
    }
  }

  /* =========================================================
     SUPPRESSION MASTER
     ========================================================= */
  async function deleteDevice(id) {
    if (!sb) return;
    if (!confirm(`Supprimer ${id} ?`)) return;
    const {
      data: { session },
    } = await sb.auth.getSession();
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
        body: JSON.stringify({ master_id: id }),
      }
    );
    log(
      r.ok
        ? `MASTER supprimé : ${id}`
        : `❌ Suppression : ${await r.text()}`
    );
  }

  /* =========================================================
     PAIRING MASTER
     ========================================================= */
  async function openPairDialog() {
    if (!sb) return;
    const {
      data: { session },
    } = await sb.auth.getSession();
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
      setPair({ open: true, code, expires_at });
      log(`Pair-code ${code}`);
    } catch (e) {
      log("Erreur pair-code: " + e);
    }
  }

  /* =========================================================
     LOGIN / LOGOUT
     ========================================================= */
  async function doLogin() {
    if (!sb) return;
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: location.href,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) alert(error.message);
    else if (data?.url) location.href = data.url;
  }

  function doLogout() {
    if (!sb) return;
    sb.auth.signOut();
  }

  /* =========================================================
     CHARGEMENT INITIAL DEVICES + NODES
     ========================================================= */
  async function loadAll() {
    if (!sb) return;

    // devices
    const { data: devs, error: edev } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });
    if (edev) {
      log("Err devices: " + edev.message);
    } else {
      setDevices(devs || []);
    }

    // nodes
    const { data: nodes, error: enodes } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,is_on");
    if (enodes) {
      log("Err nodes: " + enodes.message);
    } else {
      const map = {};
      (nodes || []).forEach((n) => {
        if (!map[n.master_id]) map[n.master_id] = [];
        map[n.master_id].push({
          mac: n.slave_mac,
          friendly_name: n.friendly_name || "",
          is_on: !!n.is_on,
        });
      });
      setNodesByMaster(map);

      // init editNames
      setEditNames((prev) => {
        const next = { ...prev };
        (nodes || []).forEach((n) => {
          if (next[n.slave_mac] == null) {
            next[n.slave_mac] =
              n.friendly_name || n.slave_mac;
          }
        });
        return next;
      });
    }
  }

  /* =========================================================
     HEADER + PAGE LAYOUT
     ========================================================= */
  // fond plein écran + pas de débordement horizontal
  const pageStyle = {
    minHeight: "100vh",
    maxHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    overflowX: "hidden",

    backgroundImage:
      'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%), url("' +
      BACKGROUND_IMAGE_URL +
      '")',
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",

    color: COLORS.textMain,
    fontFamily:
      'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  };

  // barre du haut sticky largeur totale
  const headerBarFull = {
    position: "sticky",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    width: "100%",
    maxWidth: "100vw",
    boxSizing: "border-box",
    overflowX: "hidden",

    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,

    background: COLORS.glassFillHi,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderBottom: `1px solid ${COLORS.glassBorder}`,
    boxShadow: "0 20px 40px rgba(0,0,0,0.12)",

    padding: "16px 20px",
  };

  const headerLeft = {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  };
  const headerTitleRow = {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  };
  const headerTitle = {
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.textMain,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  };
  const headerSub = {
    fontSize: 12,
    color: COLORS.textWeak,
    lineHeight: 1.3,
  };
  const headerAuth = {
    fontSize: 11,
    color: COLORS.textWeaker,
    lineHeight: 1.3,
  };

  const headerRight = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  };
  const headerBtn = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    border: `1px solid ${COLORS.btnBorder}`,
    background: "transparent",
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: 500,
    padding: "8px 14px",
    lineHeight: 1.2,
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  // zone scrollable en dessous
  const contentScroll = {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",

    width: "100%",
    display: "flex",
    justifyContent: "center",

    padding: 16,
    paddingBottom: 24,
    boxSizing: "border-box",
  };

  // colonne centrale (un peu plus large qu'avant)
  const mainCol = {
    width: "100%",
    maxWidth: 640,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const journalCardStyle = {
    borderRadius: 20,
    padding: 16,
    background: `linear-gradient(to bottom right, ${COLORS.glassFillHi}, ${COLORS.glassFillLo})`,
    border: `1px solid ${COLORS.glassBorder}`,
    boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    color: COLORS.textMain,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };
  const journalTitleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textMain,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  };
  const journalBoxStyle = {
    background: "rgba(255,255,255,0.4)",
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: 16,
    padding: 10,
    maxHeight: 150,
    overflowY: "auto",
    fontSize: 12,
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    color: COLORS.textMain,
  };

  /* =========================================================
     BOUTONS HEADER (LOGIN / LOGOUT...)
     ========================================================= */
  function HeaderButtons() {
    if (!user) {
      return (
        <div style={headerRight}>
          <button style={headerBtn} onClick={doLogin}>
            Connexion Google
          </button>
        </div>
      );
    }
    return (
      <div style={headerRight}>
        <button style={headerBtn} onClick={openPairDialog}>
          Ajouter un MASTER
        </button>
        <button style={headerBtn} onClick={loadAll}>
          Rafraîchir
        </button>
        <button style={headerBtn} onClick={doLogout}>
          Déconnexion
        </button>
      </div>
    );
  }

  /* =========================================================
     COMPOSITION UI
     ========================================================= */
  function renderSlavesForMaster(m) {
    const arr = nodesByMaster[m.id] || [];
    return arr.map((sl) => {
      const mac = sl.mac;
      return (
        <SlaveCard
          key={mac}
          nameShort={
            editNames[mac] != null
              ? editNames[mac]
              : sl.friendly_name || mac
          }
          editName={
            editNames[mac] != null
              ? editNames[mac]
              : sl.friendly_name || mac
          }
          onEditNameChange={(val) => updateEditName(mac, val)}
          onSubmitRename={() => renameSlave(mac)}
          mac={mac}
          isOn={!!sl.is_on}
          phase={slavePhase[mac] || null}
          isInfoOpen={!!openSlaveInfo[mac]}
          onToggleInfo={() => toggleSlaveInfo(mac)}
          isMoreOpen={!!openSlaveMore[mac]}
          onMoreToggle={() => toggleSlaveMore(mac)}
          onIO={() => handleIO(m.id, mac)}
          onReset={() => handleReset(m.id, mac)}
          onForceOff={() => handleForceOff(m.id, mac)}
          onHardReset={() => handleHardReset(m.id, mac)}
        />
      );
    });
  }

  function renderMasters() {
    return devices.map((d) => {
      const live = isLive(d);
      const slaveCards = renderSlavesForMaster(d);
      return (
        <MasterCard
          key={d.id}
          name={d.name}
          id={d.id}
          mac={d.master_mac}
          lastSeen={d.last_seen}
          live={live}
          infoOpen={!!openMasterInfo[d.id]}
          onToggleInfo={() => toggleMasterInfo(d.id)}
          onRename={() => renameMaster(d.id)}
          onDelete={() => deleteDevice(d.id)}
          slaves={slaveCards}
          onIOPulse={() => handlePulse(d.id)}
          onPowerOn={() => handlePowerOn(d.id)}
          onPowerOff={() => handlePowerOff(d.id)}
          onReset={() => handleMasterReset(d.id)}
        />
      );
    });
  }

  function renderPairCountdown() {
    if (!pair.expires_at) return "0:00";
    const end = new Date(pair.expires_at).getTime();
    const l = Math.max(
      0,
      Math.floor((end - Date.now()) / 1000)
    );
    return (
      Math.floor(l / 60) +
      ":" +
      String(l % 60).padStart(2, "0")
    );
  }

  /* =========================================================
     FALLBACK SI PAS DE CONFIG
     ========================================================= */
  if (!SUPABASE_URL || !SUPA_ANON_KEY || !sb) {
    return (
      <div
        style={{
          padding: 20,
          color: "#fff",
          background: "#111827",
          height: "100vh",
          boxSizing: "border-box",
          fontFamily:
            'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
        }}
      >
        <h2>Configuration manquante</h2>
        <p>
          Définis les variables d’environnement Vite
          pendant le build :
        </p>
        <pre
          style={{
            background: "#1f2937",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #374151",
            whiteSpace: "pre-wrap",
            color: "#e5e7eb",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
{`VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
`}
        </pre>
        <p>
          Vérifie aussi que les secrets GitHub Actions
          injectent bien ces valeurs au moment du build.
        </p>
      </div>
    );
  }

  /* =========================================================
     RENDU FINAL
     ========================================================= */
  return (
    <div style={pageStyle}>
      {/* HEADER STICKY */}
      <header style={headerBarFull}>
        <div style={headerLeft}>
          <div style={headerTitleRow}>
            <div style={headerTitle}>Remote Power</div>
          </div>

          <div style={headerSub}>
            Compte : {user?.email || "—"}
          </div>
          <div style={headerAuth}>
            {user ? "Authentifié" : "Non connecté"}
          </div>
        </div>

        <HeaderButtons />
      </header>

      {/* CONTENU SCROLLABLE */}
      <div style={contentScroll}>
        <main style={mainCol}>
          {/* Masters */}
          {renderMasters()}

          {/* Journal */}
          <section style={journalCardStyle}>
            <div style={journalTitleStyle}>Journal</div>
            <div style={journalBoxStyle} ref={logRef}>
              {lines.join("\n")}
            </div>
          </section>
        </main>
      </div>

      {/* MODALE PAIR-CODE */}
      {pair.open && (
        <dialog
          open
          onClose={() =>
            setPair({
              open: false,
              code: null,
              expires_at: null,
            })
          }
          style={{
            border: `1px solid ${COLORS.glassBorder}`,
            borderRadius: 16,
            background: `linear-gradient(to bottom right, ${COLORS.glassFillHi}, ${COLORS.glassFillLo})`,
            color: COLORS.textMain,
            boxShadow: "0 40px 80px rgba(0,0,0,0.3)",
            backdropFilter: "blur(30px)",
            WebkitBackdropFilter: "blur(30px)",
          }}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minWidth: 260,
              maxWidth: 320,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                lineHeight: 1.2,
                fontWeight: 600,
                color: COLORS.textMain,
              }}
            >
              Appairer un MASTER
            </h3>

            <div
              style={{
                fontSize: 14,
                lineHeight: 1.4,
                color: COLORS.textMain,
              }}
            >
              Code :{" "}
              <code
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                {String(pair.code).padStart(6, "0")}
              </code>{" "}
              (expire{" "}
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                {renderPairCountdown()}
              </span>
              )
            </div>

            <div
              style={{
                fontSize: 12,
                lineHeight: 1.4,
                color: COLORS.textWeak,
              }}
            >
              Saisis ce code dans le portail
              Wi-Fi de l’ESP32.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                style={headerBtn}
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
    </div>
  );
}
