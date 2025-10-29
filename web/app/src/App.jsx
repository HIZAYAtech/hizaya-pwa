import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================
   CONFIG SUPABASE
   ========================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* règles de "online": un master est "en ligne" si last_seen < 8s */
const LIVE_TTL_MS = 8_000;

/* pin par défaut pour IO sur le SLAVE */
const DEFAULT_IO_PIN = 26;

/* -----------------------------------------
   helpers formatage / status
----------------------------------------- */
function isSessionValid(sess) {
  // sess peut être undefined/null
  // On dit "valide" si on a un access_token string non vide
  return !!sess?.access_token;
}
function fmtTS(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}
function isLiveDevice(dev) {
  if (!dev?.last_seen) return false;
  return Date.now() - new Date(dev.last_seen).getTime() < LIVE_TTL_MS;
}

/* -----------------------------------------
   Bouton capsule gris réutilisable
----------------------------------------- */
function SubtleButton({ children, onClick, disabled, style }) {
  return (
    <button
      className="subtleBtn"
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}

/* -----------------------------------------
   Bouton rond (IO / reset / more)
----------------------------------------- */
function CircleBtn({ children, onClick, disabled, extraClass }) {
  return (
    <button
      className={`circleBtn ${extraClass || ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="circleBtnInner">{children}</span>
    </button>
  );
}

/* -----------------------------------------
   Barre de progression / statut d'action
   phase:
   - "idle": rien → barre cachée
   - "queue": en attente → petite anim pulsée
   - "send": envoi → anim de remplissage
   - "acked": succès → plein + ✓ puis disparaît
----------------------------------------- */
function ActionBar({ phase }) {
  if (!phase || phase === "idle") return null;
  const isAck = phase === "acked";
  return (
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
      {isAck && <div className="actionBarAck">✓</div>}
    </div>
  );
}

/* =========================================================
   MODALE FLOTTANTE GÉNÉRIQUE
========================================================= */
function ModalShell({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalCard"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="smallCloseBtn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

/* =========================================================
   MODALE INFOS SLAVE (renommer + détails)
========================================================= */
function SlaveInfoModal({
  open,
  onClose,
  slaveMac,
  masterId,
  currentName,
  onRename,
  pcOn,
}) {
  const [nameDraft, setNameDraft] = useState(currentName || "");

  useEffect(() => {
    setNameDraft(currentName || "");
  }, [currentName, slaveMac, open]);

  return (
    <ModalShell open={open} onClose={onClose} title="Détails du Slave">
      <div className="modalSection">
        <label className="modalLabel">Nom du slave</label>
        <input
          className="modalInput"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Nom lisible…"
        />
        <button
          className="subtleBtn"
          style={{ marginTop: "8px" }}
          onClick={() => {
            onRename(nameDraft);
          }}
        >
          Enregistrer
        </button>
      </div>

      <div className="modalSection">
        <div className="modalInfoRow">
          <span className="modalInfoKey">MAC :</span>
          <span className="modalInfoVal">{slaveMac || "—"}</span>
        </div>
        <div className="modalInfoRow">
          <span className="modalInfoKey">Master :</span>
          <span className="modalInfoVal">{masterId || "—"}</span>
        </div>
        <div className="modalInfoRow">
          <span className="modalInfoKey">PC :</span>
          <span className="modalInfoVal">{pcOn ? "allumé" : "éteint"}</span>
        </div>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   MODALE "Machines allumées" d'un groupe
========================================================= */
function GroupOnListModal({ open, onClose, members }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Machines allumées">
      {(!members || !members.length) && (
        <div className="modalEmpty">Aucune machine allumée</div>
      )}
      {(members || []).map((m) => (
        <div key={m.mac} className="modalInfoRow">
          <span className="modalInfoKey">{m.friendly_name || m.mac}</span>
          <span className="modalInfoVal">
            {m.pc_on ? "Allumé" : "Éteint"}
          </span>
        </div>
      ))}
    </ModalShell>
  );
}

/* =========================================================
   MODALE "Éditer les membres d'un groupe"
========================================================= */
function GroupMembersModal({
  open,
  onClose,
  groupName,
  allSlaves,
  checkedMap,
  onToggleMac,
  onSave,
}) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Membres de "${groupName}"`}
    >
      <div className="modalSection">
        {(allSlaves || []).map((sl) => (
          <label key={sl.mac} className="checkRow">
            <input
              type="checkbox"
              checked={!!checkedMap[sl.mac]}
              onChange={() => onToggleMac(sl.mac)}
            />
            <span className="checkName">{sl.friendly_name || sl.mac}</span>
            <span className="checkState">{sl.pc_on ? "allumé" : "éteint"}</span>
          </label>
        ))}
      </div>
      <div style={{ textAlign: "right", marginTop: "8px" }}>
        <button className="subtleBtn" onClick={onSave}>
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   SlaveCard
========================================================= */
function SlaveCard({
  masterId,
  mac,
  friendlyName,
  pcOn,
  onInfoClick,
  onIO,
  onReset,
  onMore,
  actionBarPhase,
}) {
  return (
    <div className="slaveCard">
      {/* bouton info en haut à droite */}
      <div
        className="infoChip"
        onClick={onInfoClick}
        title="Infos / renommer"
      >
        i
      </div>

      {/* nom du slave en gros */}
      <div className="slaveNameMain">{friendlyName || mac}</div>

      {/* état PC */}
      <div className="slaveSub">
        {pcOn ? "Ordinateur allumé" : "Ordinateur éteint"}
      </div>

      {/* barre d'action (progression) */}
      <ActionBar phase={actionBarPhase} />

      {/* boutons ronds bas de carte */}
      <div className="slaveBtnsRow">
        <CircleBtn onClick={onIO} disabled={false}>
          ⏻
        </CircleBtn>
        <CircleBtn onClick={onReset} disabled={false}>
          ↺
        </CircleBtn>
        <CircleBtn extraClass="moreBtn" onClick={onMore} disabled={false}>
          ⋯
        </CircleBtn>
      </div>
    </div>
  );
}

/* =========================================================
   MasterCard
========================================================= */
function MasterCard({
  device,
  slaves,
  onMasterRename,
  onMasterDelete,
  onSendMasterCmd,
  openSlaveInfoFor,
  onSlaveRename,
  onSlaveIO,
  onSlaveReset,
  onSlaveMore,
  slavePhases,
}) {
  const live = isLiveDevice(device);

  return (
    <section className="masterCard">
      <div className="masterTopRow">
        <div className="masterTitleLeft">
          <div className="masterNameLine">
            <span className="masterCardTitle">{device.name || device.id}</span>
            <span
              className={
                "onlineBadge " + (live ? "onlineYes" : "onlineNo")
              }
            >
              {live ? "EN LIGNE" : "HORS LIGNE"}
            </span>
          </div>

          <div className="masterMeta smallText">
            <span className="kv">
              <span className="k">ID :</span>{" "}
              <span className="v">{device.id}</span>
            </span>{" "}
            ·{" "}
            <span className="kv">
              <span className="k">MAC :</span>{" "}
              <span className="v">{device.master_mac || "—"}</span>
            </span>{" "}
            ·{" "}
            <span className="kv">
              <span className="k">Dernier contact :</span>{" "}
              <span className="v">
                {device.last_seen ? fmtTS(device.last_seen) : "jamais"}
              </span>
            </span>
          </div>
        </div>

        {/* actions globales master */}
        <div className="masterActionsRow">
          <SubtleButton onClick={() => onMasterRename(device.id)}>
            Renommer
          </SubtleButton>
          <SubtleButton onClick={() => onMasterDelete(device.id)}>
            Supprimer
          </SubtleButton>
          <SubtleButton
            onClick={() =>
              onSendMasterCmd(device.id, null, "PULSE", { ms: 500 })
            }
          >
            Pulse 500ms
          </SubtleButton>
          <SubtleButton
            onClick={() =>
              onSendMasterCmd(device.id, null, "POWER_ON", {})
            }
          >
            Power ON
          </SubtleButton>
          <SubtleButton
            onClick={() =>
              onSendMasterCmd(device.id, null, "POWER_OFF", {})
            }
          >
            Power OFF
          </SubtleButton>
          <SubtleButton
            onClick={() => onSendMasterCmd(device.id, null, "RESET", {})}
          >
            Reset
          </SubtleButton>
        </div>
      </div>

      {/* zone slaves */}
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
              onInfoClick={() => {
                openSlaveInfoFor(device.id, sl.mac);
              }}
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

/* =========================================================
   GroupCard
========================================================= */
function GroupCard({
  group,
  onRenameGroup,
  onDeleteGroup,
  onOpenMembersEdit,
  onOpenOnList,
  onGroupCmd,
}) {
  const { id, name, statsOn, statsTotal } = group;
  return (
    <div className="groupCard">
      <div className="groupHeadRow">
        <div className="groupMainInfo">
          <div className="groupNameLine">{name}</div>
          <div className="groupSubLine">
            {statsOn}/{statsTotal} allumé(s)
            <button
              className="chipBtn"
              style={{ marginLeft: "6px" }}
              onClick={() => onOpenOnList(id)}
              disabled={!statsTotal}
            >
              Voir la liste
            </button>
          </div>
        </div>

        <div className="groupMiniActions">
          <SubtleButton onClick={() => onRenameGroup(id)}>
            Renommer
          </SubtleButton>
          <SubtleButton onClick={() => onDeleteGroup(id)}>
            Supprimer
          </SubtleButton>
          <SubtleButton onClick={() => onOpenMembersEdit(id)}>
            Membres
          </SubtleButton>
        </div>
      </div>

      <div className="groupCmdRow">
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_IO_ON")}>
          IO ON
        </SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "RESET")}>
          RESET
        </SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_IO_OFF")}>
          OFF
        </SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_FORCE_OFF")}>
          HARD OFF
        </SubtleButton>
        <SubtleButton onClick={() => onGroupCmd(id, "SLV_HARD_RESET")}>
          HARD RESET
        </SubtleButton>
      </div>
    </div>
  );
}

/* =========================================================
   APP PRINCIPALE
========================================================= */
export default function App() {
  /* ----------- AUTH -------------- */
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  /* ----------- DATA STATE -------- */
  const [devices, setDevices] = useState([]); // masters
  // nodesByMaster = { [master_id]: [ { mac, friendly_name, pc_on }, ...] }
  const [nodesByMaster, setNodesByMaster] = useState({});
  // état visuel d’action pour chaque slave_mac
  const [slavePhases, setSlavePhases] = useState({});
  // groupsData = [
  //   { id, name, statsOn, statsTotal, members:[{mac, master_id, friendly_name, pc_on}] }
  // ]
  const [groupsData, setGroupsData] = useState([]);

  /* journal */
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);
  function addLog(text) {
    setLogs((old) => [
      ...old.slice(-199),
      new Date().toLocaleTimeString() + "  " + text,
    ]);
  }

  /* Modales */
  const [slaveInfoOpen, setSlaveInfoOpen] = useState({
    open: false,
    masterId: "",
    mac: "",
  });
  const [groupOnListOpen, setGroupOnListOpen] = useState({
    open: false,
    groupId: "",
  });
  const [groupMembersOpen, setGroupMembersOpen] = useState({
    open: false,
    groupId: "",
  });
  const [editMembersChecked, setEditMembersChecked] = useState({}); // { mac: true }

  /* ------------- AUTH FLOW ---------------- */
useEffect(() => {
  // écoute des changements de session (login/logout/refresh token)
  const { data: sub } = sb.auth.onAuthStateChange(
    async (_event, session) => {
      const valid = isSessionValid(session);
      setUser(valid ? session.user : null);
      setAuthReady(true);

      if (valid) {
        await fullReload();
        attachRealtime();
      } else {
        cleanupRealtime();
        setDevices([]);
        setNodesByMaster({});
        setGroupsData([]);
      }
    }
  );

  // init au premier rendu
  (async () => {
    const { data } = await sb.auth.getSession();
    const valid = isSessionValid(data.session);
    setUser(valid ? data.session.user : null);
    setAuthReady(true);

    if (valid) {
      await fullReload();
      attachRealtime();
    }
  })();

  return () => {
    sub?.subscription?.unsubscribe();
    cleanupRealtime();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

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
    chDevices.current = chNodes.current = chCmds.current = chGroups.current =
      null;
  }

  function attachRealtime() {
    cleanupRealtime();
    // devices
    chDevices.current = sb
      .channel("rt:devices")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        () => {
          addLog("[RT] devices changed");
          refetchDevicesOnly();
        }
      )
      .subscribe();

    // nodes
    chNodes.current = sb
      .channel("rt:nodes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nodes" },
        () => {
          addLog("[RT] nodes changed");
          refetchNodesOnly();
          refetchGroupsOnly(); // groupes utilisent slaves
        }
      )
      .subscribe();

    // commands
    chCmds.current = sb
      .channel("rt:commands")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commands" },
        (payload) => {
          const row = payload.new;
          if (row && row.target_mac) {
            if (row.status === "acked") {
              setSlavePhases((old) => ({
                ...old,
                [row.target_mac]: "acked",
              }));
              setTimeout(() => {
                setSlavePhases((old2) => ({
                  ...old2,
                  [row.target_mac]: "idle",
                }));
              }, 2000);
            }
          }
          addLog(
            `[cmd ${payload.eventType}] ${row?.action} (${row?.status}) → ${row?.master_id}`
          );
        }
      )
      .subscribe();

    // groups + group_members
    chGroups.current = sb
      .channel("rt:groups+members")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        () => {
          addLog("[RT] groups changed");
          refetchGroupsOnly();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        () => {
          addLog("[RT] group_members changed");
          refetchGroupsOnly();
        }
      )
      .subscribe();
  }

  /* ---------- FETCHERS ---------- */

  async function refetchDevicesOnly() {
    const { data: devs, error } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });
    if (!error && devs) setDevices(devs);
  }

  async function refetchNodesOnly() {
    // récupère tous les slaves
    const { data: rows, error } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if (error) {
      addLog("Err nodes: " + error.message);
      return;
    }
    const map = {};
    for (const r of rows || []) {
      if (!map[r.master_id]) map[r.master_id] = [];
      map[r.master_id].push({
        mac: r.slave_mac,
        friendly_name: r.friendly_name,
        pc_on: r.pc_on,
      });
    }
    setNodesByMaster(map);
  }

  // groupes + membres + status ON
  async function refetchGroupsOnly() {
    // 1. lire groupes
    const { data: gs, error: gErr } = await sb
      .from("groups")
      .select("id,name");
    if (gErr) {
      addLog("Err groups: " + gErr.message);
      return;
    }
    // 2. lire membres
    const { data: membs, error: mErr } = await sb
      .from("group_members")
      .select("group_id,slave_mac");
    if (mErr) {
      addLog("Err group_members: " + mErr.message);
      return;
    }
    // 3. lire nodes pour friendly_name + pc_on + master_id
    const { data: allNodes, error: nErr } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if (nErr) {
      addLog("Err nodes in groups: " + nErr.message);
      return;
    }

    const membersByGroup = {};
    for (const gm of membs || []) {
      if (!membersByGroup[gm.group_id]) {
        membersByGroup[gm.group_id] = [];
      }
      const nodeInfo = (allNodes || []).find(
        (nd) => nd.slave_mac === gm.slave_mac
      );
      membersByGroup[gm.group_id].push({
        mac: gm.slave_mac,
        master_id: nodeInfo?.master_id,
        friendly_name: nodeInfo?.friendly_name || gm.slave_mac,
        pc_on: !!nodeInfo?.pc_on,
      });
    }

    const final = (gs || []).map((g) => {
      const mems = membersByGroup[g.id] || [];
      const onCount = mems.filter((x) => x.pc_on).length;
      return {
        id: g.id,
        name: g.name,
        statsOn: onCount,
        statsTotal: mems.length,
        members: mems,
      };
    });

    setGroupsData(final);
  }

  async function fullReload() {
    await Promise.all([
      refetchDevicesOnly(),
      refetchNodesOnly(),
      refetchGroupsOnly(),
    ]);
  }

  /* ---------- COMMANDES / ACTIONS ---------- */

  // Master rename
  async function renameMaster(id) {
    const newName = window.prompt("Nouveau nom du master ?", "");
    if (!newName) return;
    const { error } = await sb
      .from("devices")
      .update({ name: newName })
      .eq("id", id);
    if (error) {
      window.alert(error.message);
    } else {
      addLog(`Master ${id} renommé en ${newName}`);
      await refetchDevicesOnly();
    }
  }

  // Master delete
  async function deleteMaster(id) {
    if (!window.confirm(`Supprimer le master ${id} ?`)) return;

    const { data: sessionRes } = await sb.auth.getSession();
    const token = sessionRes?.session?.access_token;
    if (!token) {
      window.alert("Non connecté.");
      return;
    }
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/release_and_delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ master_id: id }),
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      addLog("❌ Suppression : " + txt);
    } else {
      addLog(`MASTER supprimé : ${id}`);
    }
    await fullReload();
  }

  // Slave rename
  async function doRenameSlave(masterId, mac, newName) {
    const { error } = await sb
      .from("nodes")
      .update({ friendly_name: newName })
      .eq("master_id", masterId)
      .eq("slave_mac", mac);
    if (error) {
      window.alert("Erreur rename slave: " + error.message);
    } else {
      addLog(`Slave ${mac} renommé en ${newName}`);
      await refetchNodesOnly();
      await refetchGroupsOnly();
    }
  }

  // Envoi d'une commande master/slave
  async function sendCmd(masterId, targetMac, action, payload = {}) {
    // effet visuel "queue" → "send"
    if (targetMac) {
      setSlavePhases((old) => ({
        ...old,
        [targetMac]: "queue",
      }));
    }

    const { error } = await sb.from("commands").insert({
      master_id: masterId,
      target_mac: targetMac || null,
      action,
      payload,
    });

    if (error) {
      addLog("cmd err: " + error.message);
      if (targetMac) {
        setSlavePhases((old) => ({
          ...old,
          [targetMac]: "idle",
        }));
      }
    } else {
      addLog(
        `[cmd] ${action} → ${masterId}${targetMac ? " ▶ " + targetMac : ""}`
      );
      if (targetMac) {
        setSlavePhases((old) => ({
          ...old,
          [targetMac]: "send",
        }));
      }
    }
  }

  // Commandes groupées
  async function sendGroupCmd(groupId, actionKey) {
    const g = groupsData.find((x) => x.id === groupId);
    if (!g) return;

    for (const m of g.members) {
      if (!m.master_id) continue; // sécurité

      switch (actionKey) {
        case "SLV_IO_ON":
          await sendCmd(m.master_id, m.mac, "SLV_IO", {
            pin: DEFAULT_IO_PIN,
            mode: "OUT",
            value: 1,
          });
          break;
        case "SLV_IO_OFF":
          await sendCmd(m.master_id, m.mac, "SLV_IO", {
            pin: DEFAULT_IO_PIN,
            mode: "OUT",
            value: 0,
          });
          break;
        case "RESET":
          await sendCmd(m.master_id, m.mac, "SLV_RESET", {});
          break;
        case "SLV_FORCE_OFF":
          await sendCmd(m.master_id, m.mac, "SLV_FORCE_OFF", {});
          break;
        case "SLV_HARD_RESET":
          await sendCmd(m.master_id, m.mac, "SLV_HARD_RESET", {
            ms: 3000,
          });
          break;
        default:
          break;
      }
    }
  }

  // Renommer un groupe
  async function renameGroup(id) {
    const newName = window.prompt("Nouveau nom du groupe ?", "");
    if (!newName) return;
    const { error } = await sb
      .from("groups")
      .update({ name: newName })
      .eq("id", id);
    if (error) {
      window.alert("Erreur rename group: " + error.message);
    } else {
      addLog(`Groupe ${id} renommé en ${newName}`);
      await refetchGroupsOnly();
    }
  }

  // Supprimer un groupe
  async function deleteGroup(id) {
    if (!window.confirm("Supprimer ce groupe ?")) return;
    // 1. purge membres
    const { error: e1 } = await sb
      .from("group_members")
      .delete()
      .eq("group_id", id);
    if (e1) {
      window.alert("Erreur suppr membres groupe: " + e1.message);
      return;
    }
    // 2. suppr le groupe
    const { error: e2 } = await sb
      .from("groups")
      .delete()
      .eq("id", id);
    if (e2) {
      window.alert("Erreur suppr groupe: " + e2.message);
      return;
    }
    addLog(`Groupe ${id} supprimé`);
    await refetchGroupsOnly();
  }

  // +MASTER = récupérer un pair-code
  async function askAddMaster() {
    const { data: sessionRes } = await sb.auth.getSession();
    const token = sessionRes?.session?.access_token;
    if (!token) {
      window.alert("Non connecté.");
      return;
    }
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/create_pair_code`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ttl_minutes: 10 }),
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      window.alert("Erreur pair-code: " + txt);
      return;
    }
    const { code, expires_at } = await r.json();
    const end = new Date(expires_at).getTime();
    const ttlSec = Math.floor((end - Date.now()) / 1000);
    window.alert(
      `Code: ${String(code).padStart(6, "0")} (expire dans ~${ttlSec}s)\nSaisis ce code dans le portail Wi-Fi du MASTER.`
    );
  }

  // +Groupe
  async function askAddGroup() {
    const gname = window.prompt("Nom du nouveau groupe ?", "");
    if (!gname) return;
    const { data: ins, error } = await sb
      .from("groups")
      .insert({ name: gname })
      .select("id")
      .single();
    if (error) {
      window.alert("Erreur création groupe: " + error.message);
      return;
    }
    addLog(`Groupe créé (${ins?.id || "?"}): ${gname}`);
    await refetchGroupsOnly();
  }

  // Logout / Login
  function handleLogout() {
    sb.auth.signOut();
  }
  function handleLogin() {
    sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: location.href,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  /* ---------- Modales ouvr/ferm ---------- */
  function openSlaveInfo(masterId, mac) {
    setSlaveInfoOpen({ open: true, masterId, mac });
  }
  function closeSlaveInfo() {
    setSlaveInfoOpen({ open: false, masterId: "", mac: "" });
  }

  function openGroupOnListModal(groupId) {
    setGroupOnListOpen({ open: true, groupId });
  }
  function closeGroupOnListModal() {
    setGroupOnListOpen({ open: false, groupId: "" });
  }

  function openGroupMembersModal(groupId) {
    setGroupMembersOpen({ open: true, groupId });
  }
  function closeGroupMembersModal() {
    setGroupMembersOpen({ open: false, groupId: "" });
  }

  // quand on ouvre l'éditeur membres -> précocher les slaves existants
useEffect(() => {
  // On ne sync que AU MOMENT où la modale passe open = true.
  if (!groupMembersOpen.open) return;

  const g = groupsData.find(
    (gg) => gg.id === groupMembersOpen.groupId
  );
  if (!g) return;

  const initialMap = {};
  for (const m of g.members || []) {
    initialMap[m.mac] = true;
  }
  setEditMembersChecked(initialMap);

  // IMPORTANT :
  // pas de dépendance sur groupsData ici,
  // donc on ne va PAS reécraser pendant que tu coches.
}, [groupMembersOpen.open]);

  function toggleCheckMac(mac) {
    setEditMembersChecked((old) => ({
      ...old,
      [mac]: !old[mac],
    }));
  }

  async function saveGroupMembers() {
    const gid = groupMembersOpen.groupId;
    if (!gid) return;
    // clear membres
    const { error: delErr } = await sb
      .from("group_members")
      .delete()
      .eq("group_id", gid);
    if (delErr) {
      window.alert("Erreur clear membres: " + delErr.message);
      return;
    }
    // reinsert cochés
    const rows = Object.entries(editMembersChecked)
      .filter(([_, ok]) => ok)
      .map(([mac]) => ({
        group_id: gid,
        slave_mac: mac,
      }));
    if (rows.length > 0) {
      const { error: insErr } = await sb
        .from("group_members")
        .insert(rows);
      if (insErr) {
        window.alert("Erreur insert membres: " + insErr.message);
        return;
      }
    }
    addLog(`Membres groupe ${gid} mis à jour.`);
    closeGroupMembersModal();
    await refetchGroupsOnly();
  }

  // infos courantes pour les modales
  const currentSlaveInfo = useMemo(() => {
    if (!slaveInfoOpen.open) return null;
    const { masterId, mac } = slaveInfoOpen;
    const list = nodesByMaster[masterId] || [];
    return list.find((s) => s.mac === mac) || null;
  }, [slaveInfoOpen, nodesByMaster]);

  const currentGroupForOnList = useMemo(() => {
    if (!groupOnListOpen.open) return null;
    return (
      groupsData.find((g) => g.id === groupOnListOpen.groupId) || null
    );
  }, [groupOnListOpen, groupsData]);

  const currentGroupForMembers = useMemo(() => {
    if (!groupMembersOpen.open) return null;
    return (
      groupsData.find((g) => g.id === groupMembersOpen.groupId) || null
    );
  }, [groupMembersOpen, groupsData]);

  // tous les slaves (pour modale membres)
  const allSlavesFlat = useMemo(() => {
    const arr = [];
    for (const mid of Object.keys(nodesByMaster)) {
      for (const sl of nodesByMaster[mid]) {
        arr.push({
          mac: sl.mac,
          friendly_name: sl.friendly_name,
          pc_on: sl.pc_on,
        });
      }
    }
    return arr;
  }, [nodesByMaster]);

  /* ---------- Sections UI ---------- */
  function renderGroupsSection() {
    return (
      <div className="groupsSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">Groupes</div>
          <div className="sectionSub">
            Contrôler plusieurs machines en même temps
          </div>
        </div>

        {!groupsData.length ? (
          <div className="noGroupsNote smallText">
            Aucun groupe pour l’instant
          </div>
        ) : (
          <div className="groupListWrap">
            {groupsData.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onRenameGroup={renameGroup}
                onDeleteGroup={deleteGroup}
                onOpenMembersEdit={(id) => {
                  openGroupMembersModal(id);
                }}
                onOpenOnList={(id) => {
                  openGroupOnListModal(id);
                }}
                onGroupCmd={(id, act) => {
                  sendGroupCmd(id, act);
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderMastersSection() {
    return (
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
              onSlaveRename={doRenameSlave}
              onSlaveIO={(mid, mac) =>
                sendCmd(mid, mac, "SLV_IO", {
                  pin: DEFAULT_IO_PIN,
                  mode: "OUT",
                  value: 1,
                })
              }
              onSlaveReset={(mid, mac) =>
                sendCmd(mid, mac, "SLV_RESET", {})
              }
              onSlaveMore={(mid, mac) => {
                const act = window.prompt(
                  "Action ?\n1 = HARD OFF\n2 = HARD RESET",
                  "1"
                );
                if (act === "1") {
                  sendCmd(mid, mac, "SLV_FORCE_OFF", {});
                } else if (act === "2") {
                  sendCmd(mid, mac, "SLV_HARD_RESET", {
                    ms: 3000,
                  });
                }
              }}
              slavePhases={slavePhases}
            />
          ))
        )}
      </div>
    );
  }

  function renderJournal() {
    return (
      <div className="journalSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">Journal</div>
        </div>
        <div className="logBox" ref={logRef}>
          {logs.join("\n")}
        </div>
      </div>
    );
  }

  /* ---------- Rendu global ---------- */
  if (!authReady) {
    return (
      <>
        <style>{STYLES}</style>
        <div
          style={{
            color: "#fff",
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif',
            padding: "2rem",
          }}
        >
          Chargement…
        </div>
      </>
    );
  }

  const isLogged = !!user;

  return (
    <>
      <style>{STYLES}</style>

      {/* HEADER STICKY */}
      <header className="topHeader">
        <div className="topHeaderInner">
          <div className="leftBlock">
            <div className="appTitleRow">
              <div className="appName">REMOTE POWER</div>
              <div className="appStatus">Actif</div>
            </div>
            <div className="appSubtitle smallText">tableau de contrôle</div>
          </div>

          <div className="rightBlock">
            <div className="userMail smallText">
              {isLogged ? user.email : "non connecté"}
            </div>
            {isLogged ? (
              <>
                <SubtleButton onClick={handleLogout}>Déconnexion</SubtleButton>
                <SubtleButton onClick={askAddMaster}>+ MASTER</SubtleButton>
                <SubtleButton onClick={askAddGroup}>+ Groupe</SubtleButton>
                <SubtleButton onClick={fullReload}>Rafraîchir</SubtleButton>
              </>
            ) : (
              <SubtleButton onClick={handleLogin}>
                Connexion Google
              </SubtleButton>
            )}
          </div>
        </div>
      </header>

      {/* CONTENU PAGE (fond photo + cartes alignées) */}
      <div className="pageBg">
        <div className="pageContent">
          {renderGroupsSection()}
          {renderMastersSection()}
          {renderJournal()}
        </div>
      </div>

      {/* MODALE SLAVE INFO */}
      <SlaveInfoModal
        open={slaveInfoOpen.open}
        onClose={closeSlaveInfo}
        slaveMac={slaveInfoOpen.mac}
        masterId={slaveInfoOpen.masterId}
        currentName={
          currentSlaveInfo?.friendly_name || slaveInfoOpen.mac
        }
        pcOn={!!currentSlaveInfo?.pc_on}
        onRename={(newName) => {
          doRenameSlave(
            slaveInfoOpen.masterId,
            slaveInfoOpen.mac,
            newName
          );
          closeSlaveInfo();
        }}
      />

      {/* MODALE LISTE ALLUMÉS */}
      <GroupOnListModal
        open={groupOnListOpen.open}
        onClose={closeGroupOnListModal}
        members={currentGroupForOnList?.members || []}
      />

      {/* MODALE EDIT MEMBRES */}
      <GroupMembersModal
        open={groupMembersOpen.open}
        onClose={closeGroupMembersModal}
        groupName={currentGroupForMembers?.name || ""}
        allSlaves={allSlavesFlat}
        checkedMap={editMembersChecked}
        onToggleMac={toggleCheckMac}
        onSave={saveGroupMembers}
      />
    </>
  );
}

/* =========================================================
   STYLES
========================================================= */
 const STYLES = `
:root{
  --bg-page:#0d0f10;
  --glass-bg:rgba(255,255,255,0.08);
  --glass-border:rgba(255,255,255,0.14);
  --glass-inner-bg:rgba(255,255,255,0.22);
  --text-main:#fff;
  --text-dim:rgba(255,255,255,0.75);
  --text-soft:rgba(255,255,255,0.55);
  --bubble-bg:rgba(255,255,255,0.06);
  --bubble-bg-hover:rgba(255,255,255,0.10);
  --bubble-border:rgba(255,255,255,0.20);
  --online-green:#4ade80;
  --online-red:#f87171;
  --modal-bg:rgba(0,0,0,0.45);

  /* plus d'ombres */
  --shadow-card:none;
  --shadow-small:none;

  --transition-fast:0.15s ease;

  font-size:14px;
  line-height:1.4;
  color-scheme:dark;
  -webkit-font-smoothing:antialiased;
}
*{box-sizing:border-box;}
html,body,#root{
  margin:0;
  padding:0;
  background:var(--bg-page);
  color:var(--text-main);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;
}

.smallText{
  font-size:12px;
  color:var(--text-soft);
}

/* HEADER sticky */
.topHeader{
  position:sticky;
  top:0;
  left:0;
  right:0;
  z-index:2000;
  backdrop-filter:blur(20px) saturate(140%);
  -webkit-backdrop-filter:blur(20px) saturate(140%);
  background:rgba(20,20,20,0.55);
  border-bottom:1px solid rgba(255,255,255,0.12);
  box-shadow:var(--shadow-card);
  padding:12px 16px;
  color:#fff;
}
.topHeaderInner{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  flex-wrap:wrap;
  max-width:1200px;
  margin:0 auto;
  row-gap:8px;
}
.appTitleRow{
  display:flex;
  align-items:baseline;
  gap:8px;
}
.appName{
  font-weight:600;
  font-size:16px;
  color:var(--text-main);
  letter-spacing:.02em;
}
.appStatus{
  font-size:12px;
  color:var(--online-green);
  font-weight:500;
}
.appSubtitle{
  color:var(--text-soft);
  font-size:12px;
}
.rightBlock{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
  justify-content:flex-end;
}
.userMail{
  color:var(--text-dim);
  margin-right:4px;
  font-size:12px;
}

/* BG full-screen */
.pageBg{
  min-height:100vh;
  background:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%),
    url("https://4kwallpapers.com/images/walls/thumbs_3t/9729.jpg");
  background-size:cover;
  background-position:center;
  padding:24px 16px 80px;
  position:relative;
}
.pageBg::after{
  content:"";
  position:absolute;
  inset:0;
  background:rgba(0,0,0,0.28);
}
.pageContent{
  position:relative;
  z-index:10;
  max-width:1200px;
  margin:0 auto;
  display:flex;
  flex-direction:column;
  gap:24px;
  padding-bottom:96px;
  color:var(--text-main);
}

/* Sections : Groupes / Masters / Journal */
.groupsSection,
.mastersSection,
.journalSection{
  background:var(--glass-bg);
  border:1px solid var(--glass-border);
  border-radius:16px;
  box-shadow:var(--shadow-card);
  backdrop-filter:blur(18px) saturate(140%);
  -webkit-backdrop-filter:blur(18px) saturate(140%);
  padding:16px;
  color:var(--text-main);
}

/* Titres de section */
.sectionTitleRow{
  display:flex;
  flex-direction:column;
  margin-bottom:12px;
}
.sectionTitle{
  color:var(--text-main);
  font-weight:600;
  font-size:14px;
}
.sectionSub{
  color:var(--text-soft);
  font-size:12px;
}
.noGroupsNote{
  color:var(--text-soft);
  font-size:12px;
}

/* GROUPS */
.groupListWrap{
  display:flex;
  flex-wrap:wrap;
  gap:16px;
}
.groupCard{
  min-width:260px;
  flex:1 1 260px;
  background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.16);
  border-radius:16px;
  padding:16px;
  color:var(--text-main);
  position:relative;
  box-shadow:var(--shadow-card);
  backdrop-filter:blur(18px) saturate(140%);
  -webkit-backdrop-filter:blur(18px) saturate(140%);
}
.groupHeadRow{
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}
.groupMainInfo{
  flex:1;
  min-width:150px;
}
.groupNameLine{
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:.02em;
}
.groupSubLine{
  font-size:12px;
  color:var(--text-dim);
  margin-top:4px;
  display:flex;
  flex-wrap:wrap;
  align-items:center;
}
.groupMiniActions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  justify-content:flex-end;
}
.groupCmdRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  font-size:12px;
}

/* Masters */
.mastersSection > .sectionTitleRow + .noGroupsNote{
  margin-bottom:8px;
}
.masterCard{
  background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.16);
  border-radius:16px;
  padding:16px;
  margin-bottom:16px;
  color:var(--text-main);
  box-shadow:var(--shadow-card);
  backdrop-filter:blur(18px) saturate(140%);
  -webkit-backdrop-filter:blur(18px) saturate(140%);
}
.masterTopRow{
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  gap:12px;
  margin-bottom:16px;
}
.masterTitleLeft{
  min-width:200px;
  flex:1;
}
.masterNameLine{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
  margin-bottom:6px;
}
.masterCardTitle{
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:.02em;
}
.onlineBadge{
  font-size:11px;
  font-weight:500;
  border-radius:9999px;
  padding:2px 8px;
  line-height:1.2;
  border:1px solid rgba(255,255,255,0.18);
}
.onlineYes{
  color:var(--online-green);
  background:rgba(16,185,129,0.10);
  border-color:rgba(16,185,129,0.32);
}
.onlineNo{
  color:var(--online-red);
  background:rgba(239,68,68,0.10);
  border-color:rgba(239,68,68,0.32);
}
.masterMeta{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  font-size:12px;
  line-height:1.3;
  color:var(--text-soft);
}
.kv .k{
  color:var(--text-soft);
  font-weight:500;
  font-size:12px;
}
.kv .v{
  color:var(--text-main);
  font-size:12px;
}
.masterActionsRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  justify-content:flex-end;
  align-items:flex-start;
}

/* grille de slaves centrée */
.slavesWrap{
  display:flex;
  justify-content:center;
}
.slavesGrid{
  width:100%;
  max-width:1000px;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:16px;
  justify-items:center;
}

/* Slave card */
.slaveCard{
  position:relative;
  width:100%;
  max-width:200px;
  min-width:160px;
  background:rgba(255,255,255,0.09);
  border:1px solid rgba(255,255,255,0.20);
  border-radius:20px;
  box-shadow:var(--shadow-card);
  backdrop-filter:blur(18px) saturate(140%);
  -webkit-backdrop-filter:blur(18px) saturate(140%);
  padding:18px 14px 14px;
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  color:var(--text-main);
}
.infoChip{
  position:absolute;
  top:10px;
  right:10px;
  width:20px;
  height:20px;
  font-size:12px;
  line-height:20px;
  border-radius:9999px;
  background:var(--bubble-bg);
  color:var(--text-dim);
  border:1px solid var(--bubble-border);
  text-align:center;
  cursor:pointer;
  user-select:none;
  transition:all var(--transition-fast);
  box-shadow:var(--shadow-small);
}
.infoChip:hover{
  background:var(--bubble-bg-hover);
  color:var(--text-main);
}
.slaveNameMain{
  font-size:16px;
  font-weight:600;
  color:var(--text-main);
  margin-top:26px;
  margin-bottom:6px;
  min-height:2.6em;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  text-align:center;
  line-height:1.2;
  letter-spacing:.02em;
}
.slaveSub{
  font-size:12px;
  line-height:1.3;
  color:var(--text-soft);
  margin-bottom:10px;
  min-height:1.4em;
  letter-spacing:.02em;
}
.actionBarWrapper{
  width:100%;
  height:4px;
  border-radius:999px;
  background:rgba(0,0,0,0.4);
  border:1px solid rgba(255,255,255,0.12);
  position:relative;
  overflow:hidden;
  margin-bottom:12px;
  box-shadow:var(--shadow-small);
}
.actionBarFill{
  position:absolute;
  top:0;
  left:0;
  bottom:0;
  background:#000;
}
.queueAnim{
  width:30%;
  animation:pulseBar 1.2s infinite;
}
.sendAnim{
  width:100%;
  animation:fillBar 1s forwards;
}
.ackedFill{
  width:100%;
  background:#000;
}
.actionBarAck{
  position:absolute;
  right:6px;
  top:-18px;
  font-size:10px;
  font-weight:600;
  color:#000;
  background:#fff;
  border-radius:6px;
  padding:2px 4px;
  box-shadow:var(--shadow-small);
}
@keyframes pulseBar{
  0%{opacity:0.4;}
  50%{opacity:1;}
  100%{opacity:0.4;}
}
@keyframes fillBar{
  0%{width:0%;}
  100%{width:100%;}
}
.slaveBtnsRow{
  display:flex;
  flex-wrap:nowrap;
  align-items:flex-end;
  justify-content:center;
  gap:12px;
  margin-top:auto;
}
.circleBtn{
  width:44px;
  height:44px;
  border-radius:9999px;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  box-shadow:var(--shadow-small);
  color:var(--text-main);
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  transition:all var(--transition-fast);
  padding:0;
}
.circleBtn:hover{
  background:var(--bubble-bg-hover);
}
.circleBtn:active{
  transform:scale(.96);
}
.circleBtn.moreBtn{
  font-weight:500;
}
.circleBtn > span,
.circleBtnInner{
  font-size:16px;
  line-height:1;
  display:flex;
  align-items:center;
  justify-content:center;
  margin-top:0;
}

/* Journal */
.journalSection .logBox{
  width:100%;
  min-height:120px;
  max-height:200px;
  background:rgba(0,0,0,0.45);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:12px;
  padding:12px;
  font-size:12px;
  line-height:1.4;
  color:var(--text-dim);
  white-space:pre-wrap;
  overflow:auto;
  box-shadow:none;
}

/* Boutons "capsule" */
.subtleBtn{
  appearance:none;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  border-radius:9999px;
  font-size:12px;
  line-height:1.2;
  color:var(--text-main);
  cursor:pointer;
  padding:6px 10px;
  min-height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:var(--shadow-small);
  transition:all var(--transition-fast);
}
.subtleBtn:hover{
  background:var(--bubble-bg-hover);
}
.subtleBtn:active{
  transform:scale(.97);
}

.chipBtn{
  appearance:none;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  border-radius:9999px;
  font-size:11px;
  line-height:1.2;
  color:var(--text-main);
  cursor:pointer;
  padding:4px 8px;
  box-shadow:var(--shadow-small);
  transition:all var(--transition-fast);
}
.chipBtn:hover{
  background:var(--bubble-bg-hover);
}
.chipBtn:active{
  transform:scale(.97);
}

/* MODALES */
.modalOverlay{
  position:fixed;
  inset:0;
  background:var(--modal-bg);
  backdrop-filter:blur(4px);
  -webkit-backdrop-filter:blur(4px);
  z-index:3000;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
}
.modalCard{
  width:100%;
  max-width:360px;
  background:rgba(20,20,20,0.8);
  border:1px solid rgba(255,255,255,0.16);
  border-radius:16px;
  box-shadow:var(--shadow-card);
  color:var(--text-main);
  backdrop-filter:blur(18px) saturate(140%);
  -webkit-backdrop-filter:blur(18px) saturate(140%);
  display:flex;
  flex-direction:column;
  padding:16px;
}
.modalHeader{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  margin-bottom:12px;
}
.modalTitle{
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
}
.smallCloseBtn{
  appearance:none;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  border-radius:8px;
  color:var(--text-main);
  cursor:pointer;
  line-height:1;
  font-size:12px;
  padding:4px 6px;
  min-width:28px;
  text-align:center;
  box-shadow:var(--shadow-small);
}
.smallCloseBtn:hover{
  background:var(--bubble-bg-hover);
}
.smallCloseBtn:active{
  transform:scale(.97);
}
.modalBody{
  font-size:13px;
  display:flex;
  flex-direction:column;
  gap:16px;
  color:var(--text-main);
}
.modalSection{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.modalLabel{
  font-size:12px;
  color:var(--text-soft);
}
.modalInput{
  width:100%;
  background:rgba(0,0,0,0.6);
  border:1px solid rgba(255,255,255,0.2);
  color:var(--text-main);
  font-size:13px;
  border-radius:8px;
  padding:8px;
  outline:none;
}
.modalInput:focus{
  border-color:rgba(255,255,255,0.4);
}
.modalInfoRow{
  display:flex;
  justify-content:space-between;
  font-size:13px;
  line-height:1.4;
  color:var(--text-main);
  background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:8px;
  padding:6px 8px;
}
.modalInfoKey{
  color:var(--text-soft);
  margin-right:8px;
}
.modalInfoVal{
  color:var(--text-main);
  font-weight:500;
  text-align:right;
  word-break:break-all;
}
.modalEmpty{
  font-size:12px;
  color:var(--text-soft);
  text-align:center;
  padding:12px;
}
.checkRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:13px;
  line-height:1.4;
  padding:6px 8px;
  background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:8px;
  color:var(--text-main);
  margin-bottom:6px;
}
.checkName{
  flex:1;
  margin-left:6px;
  color:var(--text-main);
  font-weight:500;
}
.checkState{
  color:var(--text-soft);
  font-size:12px;
}

/* Scrollbars */
.logBox::-webkit-scrollbar,
.modalBody::-webkit-scrollbar,
.pageContent::-webkit-scrollbar{
  width:6px;
  height:6px;
}
.logBox::-webkit-scrollbar-track,
.modalBody::-webkit-scrollbar-track,
.pageContent::-webkit-scrollbar-track{
  background:rgba(255,255,255,0.05);
  border-radius:999px;
}
.logBox::-webkit-scrollbar-thumb,
.modalBody::-webkit-scrollbar-thumb,
.pageContent::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,0.2);
  border-radius:999px;
}

/* responsive petits écrans */
@media(max-width:600px){
  .topHeaderInner{
    flex-direction:column;
    align-items:flex-start;
  }
  .rightBlock{
    width:100%;
    justify-content:flex-start;
    flex-wrap:wrap;
  }
  .groupCard{
    flex:1 1 100%;
    min-width:0;
  }
  .slavesGrid{
    grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
    gap:12px;
  }
  .slaveCard{
    max-width:190px;
    min-width:160px;
  }
  .circleBtn{
    width:42px;
    height:42px;
  }
  .circleBtnInner{
    font-size:15px;
  }
}
`;
