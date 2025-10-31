// web/app/src/App.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================
   SUPABASE (inline, sans dossier lib)
========================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================================
   Constantes UI / logique
========================================= */
const LIVE_TTL_MS = 8_000;   // un master est "online" si last_seen < 8s
const DEFAULT_IO_PIN = 26;   // pin IO par défaut côté SLAVE

/* ========= Helpers ========= */
function fmtTS(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}
function isLiveDevice(dev) {
  if (!dev?.last_seen) return false;
  return Date.now() - new Date(dev.last_seen).getTime() < LIVE_TTL_MS;
}
// Nettoie l’URL après OAuth (évite 404 GH Pages & paramètres moches)
function stripOAuthParams() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    ["code", "state", "provider", "error", "error_description"].forEach((p) => {
      if (url.searchParams.has(p)) { url.searchParams.delete(p); changed = true; }
    });
    if (url.hash && /access_token|refresh_token|error/i.test(url.hash)) {
      url.hash = "";
      changed = true;
    }
    if (changed) window.history.replaceState({}, document.title, url.toString());
  } catch {}
}

/* ========= UI éléments ========= */
function SubtleButton({ children, onClick, disabled, style }) {
  return (
    <button className="subtleBtn" disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
function CircleBtn({ children, onClick, disabled, extraClass }) {
  return (
    <button className={`circleBtn ${extraClass || ""}`} disabled={disabled} onClick={onClick}>
      <span className="circleBtnInner">{children}</span>
    </button>
  );
}
function ActionBar({ phase }) {
  if (!phase || phase === "idle") return null;
  const isAck = phase === "acked";
  return (
    <div className="actionBarBlock">
      {isAck && <div className="actionStatusText">succès</div>}
      <div className="actionBarWrapper">
        <div
          className={
            "actionBarFill " +
            (phase === "queue"
              ? "queueAnim"
              : phase === "send"
              ? "sendAnim"
              : isAck
              ? "ackedFill"
              : "")
          }
        />
      </div>
    </div>
  );
}
function ModalShell({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="smallCloseBtn" onClick={onClose}>✕</button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
function SlaveInfoModal({ open, onClose, slaveMac, masterId, currentName, onRename, pcOn }) {
  const [nameDraft, setNameDraft] = useState(currentName || "");
  useEffect(() => { setNameDraft(currentName || ""); }, [currentName, slaveMac, open]);
  return (
    <ModalShell open={open} onClose={onClose} title="Détails du Slave">
      <div className="modalSection">
        <label className="modalLabel">Nom du slave</label>
        <input className="modalInput" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Nom lisible…" />
        <button className="subtleBtn" style={{ marginTop: 8 }} onClick={() => onRename(nameDraft)}>Enregistrer</button>
      </div>
      <div className="modalSection">
        <div className="modalInfoRow"><span className="modalInfoKey">MAC :</span><span className="modalInfoVal">{slaveMac || "—"}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">Master :</span><span className="modalInfoVal">{masterId || "—"}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">PC :</span><span className="modalInfoVal">{pcOn ? "allumé" : "éteint"}</span></div>
      </div>
    </ModalShell>
  );
}
function GroupOnListModal({ open, onClose, members }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Machines allumées">
      {(!members || !members.length) && <div className="modalEmpty">Aucune machine allumée</div>}
      {(members || []).map((m) => (
        <div key={m.mac} className="modalInfoRow">
          <span className="modalInfoKey">{m.friendly_name || m.mac}</span>
          <span className="modalInfoVal">{m.pc_on ? "Allumé" : "Éteint"}</span>
        </div>
      ))}
    </ModalShell>
  );
}
function GroupMembersModal({ open, onClose, groupName, allSlaves, checkedMap, onToggleMac, onSave }) {
  return (
    <ModalShell open={open} onClose={onClose} title={`Membres de "${groupName}"`}>
      <div className="modalSection">
        {(allSlaves || []).map((sl) => (
          <label key={sl.mac} className="checkRow">
            <input type="checkbox" checked={!!checkedMap[sl.mac]} onChange={() => onToggleMac(sl.mac)} />
            <span className="checkName">{sl.friendly_name || sl.mac}</span>
            <span className="checkState">{sl.pc_on ? "allumé" : "éteint"}</span>
          </label>
        ))}
      </div>
      <div style={{ textAlign: "right", marginTop: 8 }}>
        <button className="subtleBtn" onClick={onSave}>Enregistrer</button>
      </div>
    </ModalShell>
  );
}
function SlaveCard({ masterId, mac, friendlyName, pcOn, onInfoClick, onIO, onReset, onMore, actionBarPhase }) {
  return (
    <div className="slaveCard">
      <div className="infoChip" onClick={onInfoClick} title="Infos / renommer">i</div>
      <div className="slaveNameMain">{friendlyName || mac}</div>
      <div className="slaveSub">{pcOn ? "Ordinateur allumé" : "Ordinateur éteint"}</div>
      <ActionBar phase={actionBarPhase} />
      <div className="slaveBtnsRow">
        <CircleBtn onClick={onIO}>⏻</CircleBtn>
        <CircleBtn onClick={onReset}>↺</CircleBtn>
        <CircleBtn extraClass="moreBtn" onClick={onMore}>⋯</CircleBtn>
      </div>
    </div>
  );
}
function MasterCard({ device, slaves, onMasterRename, onMasterDelete, onSendMasterCmd, openSlaveInfoFor, onSlaveIO, onSlaveReset, onSlaveMore, slavePhases }) {
  const live = isLiveDevice(device);
  return (
    <section className="masterCard">
      <div className="masterTopRow">
        <div className="masterTitleLeft">
          <div className="masterNameLine">
            <span className="masterCardTitle">{device.name || device.id}</span>
            <span className={"onlineBadge " + (live ? "onlineYes" : "onlineNo")}>{live ? "EN LIGNE" : "HORS LIGNE"}</span>
          </div>
          <div className="masterMeta smallText">
            <span className="kv"><span className="k">ID :</span> <span className="v">{device.id}</span></span> ·{" "}
            <span className="kv"><span className="k">MAC :</span> <span className="v">{device.master_mac || "—"}</span></span> ·{" "}
            <span className="kv"><span className="k">Dernier contact :</span> <span className="v">{device.last_seen ? fmtTS(device.last_seen) : "jamais"}</span></span>
          </div>
        </div>
        <div className="masterActionsRow">
          <SubtleButton onClick={() => onMasterRename(device.id)}>Renommer</SubtleButton>
          <SubtleButton onClick={() => onMasterDelete(device.id)}>Supprimer</SubtleButton>
          <SubtleButton onClick={() => onSendMasterCmd(device.id, null, "PULSE", { ms: 500 })}>Pulse 500ms</SubtleButton>
          <SubtleButton onClick={() => onSendMasterCmd(device.id, null, "POWER_ON", {})}>Power ON</SubtleButton>
          <SubtleButton onClick={() => onSendMasterCmd(device.id, null, "POWER_OFF", {})}>Power OFF</SubtleButton>
          <SubtleButton onClick={() => onSendMasterCmd(device.id, null, "RESET", {})}>Reset</SubtleButton>
        </div>
      </div>
      <div className="slavesWrap">
        <div className="slavesGrid">
          {(slaves || []).map((sl) => (
            <SlaveCard
              key={sl.mac}
              masterId={device.id}
              mac={sl.mac}
              friendlyName={sl.friendly_name}
              pcOn={!!sl.pc_on}
              actionBarPhase={slavePhases[sl.mac] || "idle"}
              onInfoClick={() => openSlaveInfoFor(device.id, sl.mac)}
              onIO={() => onSlaveIO(device.id, sl.mac)}
              onReset={() => onSlaveReset(device.id, sl.mac)}
              onMore={() => onSlaveMore(device.id, sl.mac)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
function GroupCard({ group, onRenameGroup, onDeleteGroup, onOpenMembersEdit, onOpenOnList, onGroupCmd }) {
  const { id, name, statsOn, statsTotal } = group;
  return (
    <div className="groupCard">
      <div className="groupHeadRow">
        <div className="groupMainInfo">
          <div className="groupNameLine">{name}</div>
          <div className="groupSubLine">
            {statsOn}/{statsTotal} allumé(s)
            <button className="chipBtn" style={{ marginLeft: 6 }} onClick={() => onOpenOnList(id)} disabled={!statsTotal}>Voir la liste</button>
          </div>
        </div>
        <div className="groupMiniActions">
          <SubtleButton onClick={() => onRenameGroup(id)}>Renommer</SubtleButton>
          <SubtleButton onClick={() => onDeleteGroup(id)}>Supprimer</SubtleButton>
          <SubtleButton onClick={() => onOpenMembersEdit(id)}>Membres</SubtleButton>
        </div>
      </div>
      <div className="groupCmdRow">
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_IO_ON")}>IO ON</SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "RESET")}>RESET</SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_IO_OFF")}>OFF</SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_FORCE_OFF")}>HARD OFF</SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_HARD_RESET")}>HARD RESET</SubtleButton>
      </div>
    </div>
  );
}

/* ========== Login plein écran (par défaut si non connecté) ========== */
function LoginScreen({ onLogin }) {
  return (
    <div className="loginScreen">
      <div className="loginCard">
        <h1 className="loginTitle">HIZAYA SWITCH</h1>
        <p className="loginSub">Connecte-toi pour accéder au tableau de bord</p>
        <button className="subtleBtn" onClick={onLogin}>Connexion Google</button>
      </div>
    </div>
  );
}

/* =========================================================
   APP PRINCIPALE
========================================================= */

// Flag module-level pour éviter d'attacher le realtime plusieurs fois
let realtimeAttached = false;

export default function App() {
  /* ----------- AUTH -------------- */
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [accountName, setAccountName] = useState("");

  /* ----------- DATA STATE -------- */
  const [devices, setDevices] = useState([]);               // masters
  const [nodesByMaster, setNodesByMaster] = useState({});   // { master_id: [ ... ] }
  const [slavePhases, setSlavePhases] = useState({});       // { mac: phase }
  const [groupsData, setGroupsData] = useState([]);         // groupes

  /* journal */
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);
  function addLog(text) {
    setLogs((old) => [...old.slice(-199), new Date().toLocaleTimeString() + "  " + text]);
  }

  /* Modales */
  const [slaveInfoOpen, setSlaveInfoOpen] = useState({ open: false, masterId: "", mac: "" });
  const [groupOnListOpen, setGroupOnListOpen] = useState({ open: false, groupId: "" });
  const [groupMembersOpen, setGroupMembersOpen] = useState({ open: false, groupId: "" });
  const [editMembersChecked, setEditMembersChecked] = useState({}); // { mac: true }

  /* ---------- REALTIME ---------- */
  const chDevices = useRef(null);
  const chNodes = useRef(null);
  const chCmds = useRef(null);
  const chGroups = useRef(null);

  function cleanupRealtime() {
    if (chDevices.current) sb.removeChannel(chDevices.current);
    if (chNodes.current) sb.removeChannel(chNodes.current);
    if (chCmds.current) sb.removeChannel(chCmds.current);
    if (chGroups.current) sb.removeChannel(chGroups.current);
    chDevices.current = null; chNodes.current = null; chCmds.current = null; chGroups.current = null;
    realtimeAttached = false;
  }

  function attachRealtime() {
    if (realtimeAttached) return;
    cleanupRealtime();

    chDevices.current = sb
      .channel("rt:devices")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => {
        addLog("[RT] devices changed"); refetchDevicesOnly();
      })
      .subscribe();

    chNodes.current = sb
      .channel("rt:nodes")
      .on("postgres_changes", { event: "*", schema: "public", table: "nodes" }, () => {
        addLog("[RT] nodes changed"); refetchNodesOnly(); refetchGroupsOnly();
      })
      .subscribe();

    chCmds.current = sb
      .channel("rt:commands")
      .on("postgres_changes", { event: "*", schema: "public", table: "commands" }, (payload) => {
        const row = payload.new;
        if (row && row.target_mac && row.status === "acked") {
          setSlavePhases((old) => ({ ...old, [row.target_mac]: "acked" }));
          setTimeout(() => setSlavePhases((old2) => ({ ...old2, [row.target_mac]: "idle" })), 2000);
        }
        if (row?.status === "acked") {
          addLog(`[SUCCESS] ${row?.action} → ${row?.master_id}${row?.target_mac ? " ▶ " + row?.target_mac : ""}`);
        } else {
          addLog(`[cmd ${payload.eventType}] ${row?.action} (${row?.status}) → ${row?.master_id}`);
        }
      })
      .subscribe();

    chGroups.current = sb
      .channel("rt:groups+members")
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        addLog("[RT] groups changed"); refetchGroupsOnly();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        addLog("[RT] group_members changed"); refetchGroupsOnly();
      })
      .subscribe();

    realtimeAttached = true;
  }

  /* ------------- AUTH FLOW ---------------- */
  useEffect(() => {
    let isMounted = true;

    async function initSessionOnce() {
      const { data } = await sb.auth.getSession();
      stripOAuthParams(); // nettoie l’URL au boot
      const sess = data.session;

      if (!isMounted) return;

      if (sess?.user) {
        setUser(sess.user);
        setAuthReady(true);
        await fullReload();
        attachRealtime();
      } else {
        setUser(null);
        setAuthReady(true);
      }
    }

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_IN") {
        stripOAuthParams(); // nettoie après OAuth
        setUser(session?.user || null);
        await fullReload();
        attachRealtime();
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setDevices([]);
        setNodesByMaster({});
        setGroupsData([]);
        setSlavePhases({});
        cleanupRealtime();
      } else if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setUser(session?.user || null);
      }

      setAuthReady(true);
    });

    initSessionOnce();

    return () => {
      isMounted = false;
      sub?.subscription?.unsubscribe();
      cleanupRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- FETCHERS ---------- */
  async function refetchDevicesOnly() {
    const { data: devs, error } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online,created_at")
      .order("created_at", { ascending: false });
    if (!error && devs) setDevices(devs);
  }

  async function refetchNodesOnly() {
    const { data: rows, error } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if (error) { addLog("Err nodes: " + error.message); return; }
    const map = {};
    for (const r of rows || []) {
      if (!map[r.master_id]) map[r.master_id] = [];
      map[r.master_id].push({ mac: r.slave_mac, friendly_name: r.friendly_name, pc_on: r.pc_on });
    }
    setNodesByMaster(map);
  }

  async function refetchGroupsOnly() {
    const { data: gs, error: gErr } = await sb.from("groups").select("id,name");
    if (gErr) { addLog("Err groups: " + gErr.message); return; }
    const { data: membs, error: mErr } = await sb.from("group_members").select("group_id,slave_mac,master_id");
    if (mErr) { addLog("Err group_members: " + mErr.message); return; }
    const { data: allNodes, error: nErr } = await sb.from("nodes").select("master_id,slave_mac,friendly_name,pc_on");
    if (nErr) { addLog("Err nodes in groups: " + nErr.message); return; }

    const membersByGroup = {};
    for (const gm of membs || []) {
      if (!membersByGroup[gm.group_id]) membersByGroup[gm.group_id] = [];
      const nodeInfo = (allNodes || []).find((nd) => nd.slave_mac === gm.slave_mac);
      membersByGroup[gm.group_id].push({
        mac: gm.slave_mac,
        master_id: nodeInfo?.master_id || gm.master_id || null,
        friendly_name: nodeInfo?.friendly_name || gm.slave_mac,
        pc_on: !!nodeInfo?.pc_on,
      });
    }

    const final = (gs || []).map((g) => {
      const mems = membersByGroup[g.id] || [];
      const onCount = mems.filter((x) => x.pc_on).length;
      return { id: g.id, name: g.name, statsOn: onCount, statsTotal: mems.length, members: mems };
    });

    setGroupsData(final);
  }

  async function fullReload() {
    await Promise.all([refetchDevicesOnly(), refetchNodesOnly(), refetchGroupsOnly()]);
  }

  /* ---------- COMMANDES / ACTIONS ---------- */
  async function renameMaster(id) {
    const newName = window.prompt("Nouveau nom du master ?", "");
    if (!newName) return;
    const { error } = await sb.from("devices").update({ name: newName }).eq("id", id);
    if (error) { window.alert(error.message); }
    else { addLog(`Master ${id} renommé en ${newName}`); await refetchDevicesOnly(); }
  }
  async function deleteMaster(id) {
    if (!window.confirm(`Supprimer le master ${id} ?`)) return;
    const { data: sessionRes } = await sb.auth.getSession();
    const token = sessionRes?.session?.access_token;
    if (!token) { window.alert("Non connecté."); return; }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ master_id: id }),
    });
    if (!r.ok) { const txt = await r.text(); addLog("❌ Suppression : " + txt); }
    else { addLog(`MASTER supprimé : ${id}`); }
    await fullReload();
  }
  async function doRenameSlave(masterId, mac, newName) {
    const { error } = await sb.from("nodes").update({ friendly_name: newName }).eq("master_id", masterId).eq("slave_mac", mac);
    if (error) window.alert("Erreur rename slave: " + error.message);
    else { addLog(`Slave ${mac} renommé en ${newName}`); await refetchNodesOnly(); await refetchGroupsOnly(); }
  }
  async function sendCmd(masterId, targetMac, action, payload = {}) {
    if (targetMac) setSlavePhases((old) => ({ ...old, [targetMac]: "queue" }));
    const { error } = await sb.from("commands").insert({ master_id: masterId, target_mac: targetMac || null, action, payload });
    if (error) { addLog("cmd err: " + error.message); if (targetMac) setSlavePhases((old) => ({ ...old, [targetMac]: "idle" })); }
    else { addLog(`[cmd] ${action} → ${masterId}${targetMac ? " ▶ " + targetMac : ""}`); if (targetMac) setSlavePhases((old) => ({ ...old, [targetMac]: "send" })); }
  }
  async function sendGroupCmd(groupId, actionKey) {
    const g = groupsData.find((x) => x.id === groupId);
    if (!g) return;
    for (const m of g.members) {
      if (!m.master_id) continue;
      switch (actionKey) {
        case "SLV_IO_ON":  await sendCmd(m.master_id, m.mac, "SLV_IO", { pin: DEFAULT_IO_PIN, mode: "OUT", value: 1 }); break;
        case "SLV_IO_OFF": await sendCmd(m.master_id, m.mac, "SLV_IO", { pin: DEFAULT_IO_PIN, mode: "OUT", value: 0 }); break;
        case "RESET":      await sendCmd(m.master_id, m.mac, "SLV_RESET", {}); break;
        case "SLV_FORCE_OFF": await sendCmd(m.master_id, m.mac, "SLV_FORCE_OFF", {}); break;
        case "SLV_HARD_RESET": await sendCmd(m.master_id, m.mac, "SLV_HARD_RESET", { ms: 3000 }); break;
        default: break;
      }
    }
  }
  async function renameGroup(id) {
    const newName = window.prompt("Nouveau nom du groupe ?", "");
    if (!newName) return;
    const { error } = await sb.from("groups").update({ name: newName }).eq("id", id);
    if (error) window.alert("Erreur rename group: " + error.message);
    else { addLog(`Groupe ${id} renommé en ${newName}`); await refetchGroupsOnly(); }
  }
  async function deleteGroup(id) {
    if (!window.confirm("Supprimer ce groupe ?")) return;
    const { error: e1 } = await sb.from("group_members").delete().eq("group_id", id);
    if (e1) { window.alert("Erreur suppr membres groupe: " + e1.message); return; }
    const { error: e2 } = await sb.from("groups").delete().eq("id", id);
    if (e2) { window.alert("Erreur suppr groupe: " + e2.message); return; }
    addLog(`Groupe ${id} supprimé`); await refetchGroupsOnly();
  }
  async function askAddMaster() {
    const { data: sessionRes } = await sb.auth.getSession();
    const token = sessionRes?.session?.access_token;
    if (!token) { window.alert("Non connecté."); return; }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ttl_minutes: 10 }),
    });
    if (!r.ok) { const txt = await r.text(); window.alert("Erreur pair-code: " + txt); return; }
    const { code, expires_at } = await r.json();
    const end = new Date(expires_at).getTime(); const ttlSec = Math.floor((end - Date.now()) / 1000);
    window.alert(`Code: ${String(code).padStart(6, "0")} (expire dans ~${ttlSec}s)\nSaisis ce code dans le portail Wi-Fi du MASTER.`);
  }
  async function askAddGroup() {
    const gname = window.prompt("Nom du nouveau groupe ?", ""); if (!gname) return;
    const { data: ins, error } = await sb.from("groups").insert({ name: gname }).select("id").single();
    if (error) { window.alert("Erreur création groupe: " + error.message); return; }
    addLog(`Groupe créé (${ins?.id || "?"}): ${gname}`); await refetchGroupsOnly();
  }
  function renameAccountLabel() {
    const newLabel = window.prompt("Nom du compte ?", accountName || (user?.email || ""));
    if (!newLabel) return; setAccountName(newLabel); addLog(`Compte nommé : ${newLabel}`);
  }

  // Login/Logout
  function handleLogout() { sb.auth.signOut(); }
  function handleLogin() {
    // URL propre (root de la page gh-pages) — fonctionne sans router
    const returnTo = window.location.origin + window.location.pathname;
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: returnTo, queryParams: { prompt: "select_account" } }
    });
  }

  /* ---------- Modales ---------- */
  function openSlaveInfo(masterId, mac) { setSlaveInfoOpen({ open: true, masterId, mac }); }
  function closeSlaveInfo() { setSlaveInfoOpen({ open: false, masterId: "", mac: "" }); }
  function openGroupOnListModal(groupId) { setGroupOnListOpen({ open: true, groupId }); }
  function closeGroupOnListModal() { setGroupOnListOpen({ open: false, groupId: "" }); }
  function openGroupMembersModal(groupId) { setGroupMembersOpen({ open: true, groupId }); }
  function closeGroupMembersModal() { setGroupMembersOpen({ open: false, groupId: "" }); }

  // Pré-cocher uniquement à l'ouverture
  useEffect(() => {
    if (!groupMembersOpen.open) return;
    const g = groupsData.find((gg) => gg.id === groupMembersOpen.groupId); if (!g) return;
    const initialMap = {}; for (const m of g.members || []) initialMap[m.mac] = true;
    setEditMembersChecked(initialMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMembersOpen.open]);

  function toggleCheckMac(mac) { setEditMembersChecked((old) => ({ ...old, [mac]: !old[mac] })); }
  async function saveGroupMembers() {
    const gid = groupMembersOpen.groupId; if (!gid) return;
    const macToMaster = {}; for (const s of allSlavesFlat) macToMaster[s.mac] = s.master_id;
    const { error: delErr } = await sb.from("group_members").delete().eq("group_id", gid);
    if (delErr) { window.alert("Erreur clear membres: " + delErr.message); return; }
    const rows = Object.entries(editMembersChecked)
      .filter(([, ok]) => ok)
      .map(([mac]) => ({ group_id: gid, slave_mac: mac, master_id: macToMaster[mac] || null }))
      .filter((r) => r.master_id);
    if (rows.length) {
      const { error: insErr } = await sb.from("group_members").insert(rows);
      if (insErr) { window.alert("Erreur insert membres: " + insErr.message); return; }
    }
    addLog(`Membres groupe ${gid} mis à jour.`); closeGroupMembersModal(); await refetchGroupsOnly();
  }

  // Sélections mémo
  const currentSlaveInfo = useMemo(() => {
    if (!slaveInfoOpen.open) return null;
    const { masterId, mac } = slaveInfoOpen;
    const list = nodesByMaster[masterId] || [];
    return list.find((s) => s.mac === mac) || null;
  }, [slaveInfoOpen, nodesByMaster]);

  const currentGroupForOnList = useMemo(() => {
    if (!groupOnListOpen.open) return null;
    return groupsData.find((g) => g.id === groupOnListOpen.groupId) || null;
  }, [groupOnListOpen, groupsData]);

  const currentGroupForMembers = useMemo(() => {
    if (!groupMembersOpen.open) return null;
    return groupsData.find((g) => g.id === groupMembersOpen.groupId) || null;
  }, [groupMembersOpen, groupsData]);

  const allSlavesFlat = useMemo(() => {
    const arr = [];
    for (const mid of Object.keys(nodesByMaster)) {
      for (const sl of nodesByMaster[mid]) arr.push({ mac: sl.mac, master_id: mid, friendly_name: sl.friendly_name, pc_on: sl.pc_on });
    }
    return arr;
  }, [nodesByMaster]);

  /* ---------- Rendu ---------- */
  if (!authReady) {
    return (
      <div style={{ color: "#fff", padding: "2rem" }}>
        Chargement…
      </div>
    );
  }

  const isLogged = !!user;

  if (!isLogged) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <>
      {/* HEADER STICKY */}
      <header className="topHeader">
        <div className="topHeaderInner">
          <div className="leftBlock">
            <div className="appTitleRow">
              <div className="appName">HIZAYA SWITCH</div>
              <div className="appStatus">Actif</div>
            </div>
            <div className="appSubtitle smallText">tableau de contrôle</div>
          </div>

          <div className="rightBlock">
            <div className="userMail smallText">{accountName || user.email}</div>
            <SubtleButton onClick={renameAccountLabel}>Renommer compte</SubtleButton>
            <SubtleButton onClick={handleLogout}>Déconnexion</SubtleButton>
            <SubtleButton onClick={askAddMaster}>+ MASTER</SubtleButton>
            <SubtleButton onClick={askAddGroup}>+ Groupe</SubtleButton>
            <SubtleButton onClick={fullReload}>Rafraîchir</SubtleButton>
          </div>
        </div>
      </header>

      {/* CONTENU PAGE */}
      <div className="pageBg">
        <div className="pageContent">
          {/* Groupes */}
          <div className="groupsSection">
            <div className="sectionTitleRow">
              <div className="sectionTitle">Groupes</div>
              <div className="sectionSub">Contrôler plusieurs machines en même temps</div>
            </div>
            {!groupsData.length ? (
              <div className="noGroupsNote smallText">Aucun groupe pour l’instant</div>
            ) : (
              <div className="groupListWrap">
                {groupsData.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    onRenameGroup={renameGroup}
                    onDeleteGroup={deleteGroup}
                    onOpenMembersEdit={(id) => openGroupMembersModal(id)}
                    onOpenOnList={(id) => openGroupOnListModal(id)}
                    onGroupCmd={(id, act) => sendGroupCmd(id, act)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Masters */}
          <div className="mastersSection">
            <div className="sectionTitleRow">
              <div className="sectionTitle">Masters</div>
              <div className="sectionSub">Chaque master pilote ses slaves</div>
            </div>
            {!devices.length ? (
              <div className="noGroupsNote smallText">Aucun master</div>
            ) : (
              devices.map((dev) => (
                <MasterCard
                  key={dev.id}
                  device={dev}
                  slaves={nodesByMaster[dev.id] || []}
                  onMasterRename={renameMaster}
                  onMasterDelete={deleteMaster}
                  onSendMasterCmd={sendCmd}
                  openSlaveInfoFor={openSlaveInfo}
                  onSlaveIO={(mid, mac) => sendCmd(mid, mac, "SLV_IO", { pin: DEFAULT_IO_PIN, mode: "OUT", value: 1 })}
                  onSlaveReset={(mid, mac) => sendCmd(mid, mac, "SLV_RESET", {})}
                  onSlaveMore={(mid, mac) => {
                    const act = window.prompt("Action ?\n1 = HARD OFF\n2 = HARD RESET", "1");
                    if (act === "1") sendCmd(mid, mac, "SLV_FORCE_OFF", {});
                    else if (act === "2") sendCmd(mid, mac, "SLV_HARD_RESET", { ms: 3000 });
                  }}
                  slavePhases={slavePhases}
                />
              ))
            )}
          </div>

          {/* Journal */}
          <div className="journalSection">
            <div className="sectionTitleRow"><div className="sectionTitle">Journal</div></div>
            <div className="logBox" ref={logRef}>{logs.join("\n")}</div>
          </div>
        </div>
      </div>

      {/* MODALES */}
      <SlaveInfoModal
        open={slaveInfoOpen.open}
        onClose={closeSlaveInfo}
        slaveMac={slaveInfoOpen.mac}
        masterId={slaveInfoOpen.masterId}
        currentName={(nodesByMaster[slaveInfoOpen.masterId] || []).find((s) => s.mac === slaveInfoOpen.mac)?.friendly_name || slaveInfoOpen.mac}
        pcOn={!!(nodesByMaster[slaveInfoOpen.masterId] || []).find((s) => s.mac === slaveInfoOpen.mac)?.pc_on}
        onRename={(newName) => { doRenameSlave(slaveInfoOpen.masterId, slaveInfoOpen.mac, newName); closeSlaveInfo(); }}
      />
      <GroupOnListModal
        open={groupOnListOpen.open}
        onClose={closeGroupOnListModal}
        members={(groupsData.find((g) => g.id === groupOnListOpen.groupId)?.members) || []}
      />
      <GroupMembersModal
        open={groupMembersOpen.open}
        onClose={closeGroupMembersModal}
        groupName={(groupsData.find((g) => g.id === groupMembersOpen.groupId)?.name) || ""}
        allSlaves={useMemo(() => {
          const arr = [];
          for (const mid of Object.keys(nodesByMaster)) for (const sl of nodesByMaster[mid]) arr.push({ mac: sl.mac, master_id: mid, friendly_name: sl.friendly_name, pc_on: sl.pc_on });
          return arr;
        }, [nodesByMaster])}
        checkedMap={editMembersChecked}
        onToggleMac={toggleCheckMac}
        onSave={saveGroupMembers}
      />
    </>
  );
}
