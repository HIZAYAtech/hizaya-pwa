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
      {children}
    </button>
  );
}

/* -----------------------------------------
   Barre de progression / statut d'action
   phase:
   - "idle": rien → barre cachée
   - "queue": en attente → petite anim pulsée
   - "send": envoi → anim de remplissage
   - "acked": succès → plein + ✓
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
    <ModalShell open={open} onClose={onClose} title="Détails de la machine">
      <div className="modalSection">
        <label className="modalLabel">Nom de la machine</label>
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
          <span className="modalInfoKey">
            {m.friendly_name || m.mac}
          </span>
          <span className="modalInfoVal">{m.pc_on ? "Allumé" : "Éteint"}</span>
        </div>
      ))}
    </ModalShell>
  );
}

/* =========================================================
   MODALE "Éditer les membres d'un groupe"
   - coche/décoche les slaves
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
    <ModalShell open={open} onClose={onClose} title={`Membres de "${groupName}"`}>
      <div className="modalSection">
        {(allSlaves || []).map((sl) => (
          <label key={sl.mac} className="checkRow">
            <input
              type="checkbox"
              checked={!!checkedMap[sl.mac]}
              onChange={() => onToggleMac(sl.mac)}
            />
            <span className="checkName">
              {sl.friendly_name || sl.mac}
            </span>
            <span className="checkState">
              {sl.pc_on ? "allumé" : "éteint"}
            </span>
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
   SlaveCard (une machine)
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

      {/* nom en gros */}
      <div className="slaveNameMain">{friendlyName || mac}</div>

      {/* état PC */}
      <div className="slaveSub">
        {pcOn ? "Ordinateur allumé" : "Ordinateur éteint"}
      </div>

      {/* barre d'action */}
      <ActionBar phase={actionBarPhase} />

      {/* boutons ronds */}
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
            onClick={() => onSendMasterCmd(device.id, null, "POWER_ON", {})}
          >
            Power ON
          </SubtleButton>
          <SubtleButton
            onClick={() => onSendMasterCmd(device.id, null, "POWER_OFF", {})}
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

      {/* liste des slaves */}
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
              Liste
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
  // nom personnalisable du compte (affiché dans le header)
  const [accountName, setAccountName] = useState("");

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
  // autoscroll journal
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

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
  // { mac: true }
  const [editMembersChecked, setEditMembersChecked] = useState({});

  /* ------------- AUTH FLOW ---------------- */
  useEffect(() => {
    // écoute auth
    const { data: sub } = sb.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user || null);
        setAuthReady(true);
        if (session?.user) {
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

    // init
    (async () => {
      const { data } = await sb.auth.getSession();
      setUser(data.session?.user || null);
      setAuthReady(true);
      if (data.session?.user) {
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
    chDevices.current = chNodes.current = chCmds.current = chGroups.current = null;
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
          refetchGroupsOnly(); // group cards dépendent des slaves
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
              // après 2s on cache
              setTimeout(() => {
                setSlavePhases((old2) => ({
                  ...old2,
                  [row.target_mac]: "idle",
                }));
              }, 2000);
            }
          }

          // journal lisible : si acked => SUCCESS
          if (row?.status === "acked") {
            addLog(
              `[SUCCESS] ${row?.action} → ${row?.master_id}${
                row?.target_mac ? " ▶ " + row?.target_mac : ""
              }`
            );
          } else {
            addLog(
              `[cmd ${payload.eventType}] ${row?.action} (${row?.status}) → ${row?.master_id}`
            );
          }
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

    // reconstruire
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
      window.alert("Erreur rename machine: " + error.message);
    } else {
      addLog(`Machine ${mac} renommée en ${newName}`);
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
        `[cmd] ${action} → ${masterId}${
          targetMac ? " ▶ " + targetMac : ""
        }`
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
      window.alert("Erreur rename groupe: " + error.message);
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

  // renommer le compte (affichage header côté UI uniquement pour l'instant)
  function renameAccountLabel() {
    const newLabel = window.prompt(
      "Nom du compte ?",
      accountName || user?.email || ""
    );
    if (!newLabel) return;
    setAccountName(newLabel);
    addLog(`Compte nommé : ${newLabel}`);
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
    if (!groupMembersOpen.open) return;
    const g = groupsData.find(
      (gg) => gg.id === groupMembersOpen.groupId
    );
    if (g) {
      const map = {};
      for (const m of g.members || []) {
        map[m.mac] = true;
      }
      setEditMembersChecked(map);
    }
  }, [groupMembersOpen, groupsData]);

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
      groupsData.find((g) => g.id === groupOnListOpen.groupId) ||
      null
    );
  }, [groupOnListOpen, groupsData]);

  const currentGroupForMembers = useMemo(() => {
    if (!groupMembersOpen.open) return null;
    return (
      groupsData.find((g) => g.id === groupMembersOpen.groupId) ||
      null
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
          <div className="sectionSub">
            Chaque master pilote ses machines
          </div>
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
              <div className="appName">HIZAYA SWITCH</div>
              <div className="appStatus">Actif</div>
            </div>
            <div className="appSubtitle smallText">tableau de contrôle</div>
          </div>

          <div className="rightBlock">
            <div className="userMail smallText">
              {isLogged ? (accountName || user.email) : "non connecté"}
            </div>

            {isLogged ? (
              <>
                <SubtleButton onClick={renameAccountLabel}>
                  Renommer compte
                </SubtleButton>
                <SubtleButton onClick={handleLogout}>
                  Déconnexion
                </SubtleButton>
                <SubtleButton onClick={askAddMaster}>
                  + MASTER
                </SubtleButton>
                <SubtleButton onClick={askAddGroup}>
                  + Groupe
                </SubtleButton>
                <SubtleButton onClick={fullReload}>
                  Rafraîchir
                </SubtleButton>
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
   (sans ombre agressive, glass doux)
========================================================= */
const STYLES = `
:root{
  --bg-page:#0d0f10;
  --glass-bg:rgba(255,255,255,0.08);
  --glass-bg-mid:rgba(255,255,255,0.12);
  --glass-border:rgba(255,255,255,0.16);
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

  --transition-fast:0.15s ease;

  font-size:14px;
  line-height:1.4;
  color-scheme:dark;
  -webkit-font-smoothing:antialiased;
}
*{
  box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
}
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

/* HEADER sticky bande pleine largeur */
.topHeader{
  position:sticky;
  top:0;
  left:0;
  right:0;
  z-index:1000;
  background:rgba(0,0,0,0.6);
  backdrop-filter:blur(10px);
  border-bottom:1px solid rgba(255,255,255,0.12);
}
.topHeaderInner{
  max-width:1400px;
  margin:0 auto;
  padding:12px 16px;
  display:flex;
  flex-wrap:wrap;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
}
.leftBlock{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.appTitleRow{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:16px;
  font-weight:600;
  color:var(--text-main);
}
.appName{
  font-size:16px;
  font-weight:600;
}
.appStatus{
  font-size:12px;
  font-weight:500;
  color:var(--text-main);
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  padding:2px 8px;
  border-radius:999px;
}
.appSubtitle{
  font-size:12px;
}

.rightBlock{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  color:var(--text-main);
  font-size:13px;
}
.userMail{
  font-size:12px;
  min-width:140px;
  color:var(--text-dim);
}

/* BOUTONS TOP HEADER ET GÉNÉRIQUES */
.subtleBtn{
  appearance:none;
  background:var(--bubble-bg);
  color:var(--text-main);
  border:1px solid var(--bubble-border);
  border-radius:999px;
  padding:6px 10px;
  font-size:12px;
  line-height:1.2;
  cursor:pointer;
  transition:background var(--transition-fast),border var(--transition-fast),color var(--transition-fast);
}
.subtleBtn:hover{
  background:var(--bubble-bg-hover);
}
.subtleBtn:disabled{
  opacity:0.4;
  cursor:default;
}

/* PAGE BG : dégradés + photo plein écran */
.pageBg{
  min-height:100vh;
  background:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 70%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60");
  background-size:cover;
  background-position:center;
  background-repeat:no-repeat;
  padding:24px 16px 64px;
}
.pageContent{
  max-width:1400px;
  margin:0 auto;
  display:flex;
  flex-wrap:wrap;
  align-items:flex-start;
  justify-content:center;
  gap:24px;
}

/* SECTIONS PRINCIPALES: Groupes / Masters / Journal */
.groupsSection,
.mastersSection,
.journalSection{
  background:var(--glass-bg);
  border:1px solid var(--glass-border);
  border-radius:20px;
  padding:16px;
  color:var(--text-main);
  min-width:260px;
  backdrop-filter:blur(20px);
}

.groupsSection{
  flex:0 1 320px;
  max-width:360px;
}
.mastersSection{
  flex:1 1 600px;
  min-width:480px;
  max-width:800px;
}
.journalSection{
  flex:0 1 300px;
  max-width:320px;
}

/* Titres de section */
.sectionTitleRow{
  display:flex;
  flex-direction:column;
  gap:2px;
  margin-bottom:12px;
}
.sectionTitle{
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
}
.sectionSub{
  font-size:12px;
  color:var(--text-soft);
}

/* Groupes */
.groupListWrap{
  display:flex;
  flex-direction:column;
  gap:12px;
}
.groupCard{
  background:var(--glass-bg-mid);
  border:1px solid var(--glass-border);
  border-radius:16px;
  padding:12px 12px 10px;
  display:flex;
  flex-direction:column;
  gap:12px;
  backdrop-filter:blur(20px);
}
.groupHeadRow{
  display:flex;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:8px;
}
.groupMainInfo{
  min-width:160px;
}
.groupNameLine{
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
}
.groupSubLine{
  font-size:12px;
  color:var(--text-soft);
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:6px;
}
.chipBtn{
  appearance:none;
  background:var(--bubble-bg);
  color:var(--text-main);
  border:1px solid var(--bubble-border);
  border-radius:999px;
  padding:4px 8px;
  font-size:11px;
  line-height:1.2;
  cursor:pointer;
}
.chipBtn:disabled{
  opacity:0.4;
  cursor:default;
}

.groupMiniActions{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}
.groupCmdRow{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  font-size:12px;
}

/* Master card */
.masterCard{
  background:var(--glass-bg-mid);
  border:1px solid var(--glass-border);
  border-radius:20px;
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:16px;
  color:var(--text-main);
  backdrop-filter:blur(20px);
}
.masterTopRow{
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  gap:12px;
}
.masterTitleLeft{
  display:flex;
  flex-direction:column;
  gap:6px;
  min-width:220px;
  flex:1 1 auto;
}
.masterNameLine{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
}
.masterCardTitle{
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
}
.onlineBadge{
  font-size:11px;
  font-weight:500;
  line-height:1.2;
  padding:2px 8px;
  border-radius:999px;
  border:1px solid var(--bubble-border);
}
.onlineYes{
  background:rgba(16,185,129,0.12);
  color:var(--online-green);
  border-color:rgba(16,185,129,0.4);
}
.onlineNo{
  background:rgba(239,68,68,0.12);
  color:var(--online-red);
  border-color:rgba(239,68,68,0.4);
}
.masterMeta{
  font-size:12px;
  color:var(--text-soft);
  display:flex;
  flex-wrap:wrap;
  gap:4px 8px;
}
.kv .k{
  color:var(--text-soft);
}
.kv .v{
  color:var(--text-dim);
}

.masterActionsRow{
  display:flex;
  flex-wrap:wrap;
  align-items:flex-start;
  gap:6px;
  min-width:200px;
  flex-shrink:0;
  font-size:12px;
}

/* zone slaves dans un master */
.slavesWrap{
  width:100%;
}
.slavesGrid{
  /* on centre les cartes */
  display:flex;
  flex-wrap:wrap;
  gap:16px;
  justify-content:center;
}

/* Slave Card */
.slaveCard{
  position:relative;
  background:var(--glass-bg);
  border:1px solid var(--glass-border);
  border-radius:16px;
  padding:16px 12px 12px;
  width:150px;
  max-width:180px;
  min-width:140px;
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  color:var(--text-main);
  backdrop-filter:blur(20px);
}
.infoChip{
  position:absolute;
  top:8px;
  right:8px;
  font-size:11px;
  font-weight:500;
  line-height:1;
  width:20px;
  height:20px;
  border-radius:999px;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  color:var(--text-main);
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
}
.infoChip:hover{
  background:var(--bubble-bg-hover);
}
.slaveNameMain{
  font-size:15px;
  font-weight:600;
  line-height:1.2;
  color:var(--text-main);
  margin-top:20px; /* pour éviter de se battre avec le i */
  word-break:break-word;
}
.slaveSub{
  font-size:12px;
  line-height:1.3;
  color:var(--text-soft);
  margin-top:4px;
  min-height:16px;
}

/* Barre d'action sous l'état PC */
.actionBarWrapper{
  position:relative;
  width:100%;
  height:4px;
  border-radius:999px;
  background:rgba(0,0,0,0.5);
  overflow:hidden;
  margin-top:8px;
  margin-bottom:12px;
}
.actionBarFill{
  position:absolute;
  top:0;left:0;bottom:0;
  background:#000;
  width:20%;
}
.queueAnim{
  animation:queuePulse 0.8s infinite alternate;
}
@keyframes queuePulse{
  0%{opacity:0.4;width:20%}
  100%{opacity:0.8;width:30%}
}
.sendAnim{
  animation:sendFill 1s infinite linear;
}
@keyframes sendFill{
  0%{width:0%}
  100%{width:100%}
}
.ackedFill{
  width:100%;
  background:#000;
}
.actionBarAck{
  position:absolute;
  top:-18px;
  right:4px;
  font-size:11px;
  color:#000;
  background:#fff;
  border-radius:6px;
  padding:2px 4px;
  font-weight:500;
  line-height:1.2;
}

/* Boutons ronds en bas de la carte */
.slaveBtnsRow{
  display:flex;
  flex-wrap:nowrap;
  align-items:flex-end;
  justify-content:center;
  gap:12px;
  width:100%;
}
.circleBtn{
  appearance:none;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  border-radius:999px;
  width:36px;
  height:36px;
  font-size:16px;
  line-height:1;
  color:var(--text-main);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0;
}
.circleBtn:hover{
  background:var(--bubble-bg-hover);
}
.circleBtn.moreBtn{
  font-size:18px;
  line-height:0.8;
}
.circleBtn:disabled{
  opacity:0.4;
  cursor:default;
}

/* Journal */
.logBox{
  white-space:pre-wrap;
  background:rgba(0,0,0,0.35);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:12px;
  padding:10px;
  height:200px;
  overflow:auto;
  font-size:12px;
  line-height:1.4;
  color:var(--text-main);
}
.noGroupsNote{
  font-size:12px;
  color:var(--text-soft);
}

/* MODALES */
.modalOverlay{
  position:fixed;
  left:0;top:0;right:0;bottom:0;
  background:var(--modal-bg);
  backdrop-filter:blur(4px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
  z-index:2000;
}
.modalCard{
  background:var(--glass-bg-mid);
  border:1px solid var(--glass-border);
  border-radius:16px;
  max-width:320px;
  width:100%;
  color:var(--text-main);
  backdrop-filter:blur(20px);
  padding:12px 12px 16px;
  display:flex;
  flex-direction:column;
  gap:12px;
}
.modalHeader{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:8px;
}
.modalTitle{
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
  line-height:1.3;
}
.smallCloseBtn{
  appearance:none;
  background:var(--bubble-bg);
  border:1px solid var(--bubble-border);
  border-radius:999px;
  width:24px;
  height:24px;
  color:var(--text-main);
  font-size:12px;
  line-height:1;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
}
.smallCloseBtn:hover{
  background:var(--bubble-bg-hover);
}

.modalBody{
  display:flex;
  flex-direction:column;
  gap:16px;
}
.modalSection{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.modalLabel{
  font-size:12px;
  color:var(--text-dim);
}
.modalInput{
  appearance:none;
  background:rgba(0,0,0,0.4);
  color:var(--text-main);
  border:1px solid var(--bubble-border);
  border-radius:10px;
  padding:8px 10px;
  font-size:13px;
  line-height:1.3;
  outline:none;
}
.modalInput:focus{
  border-color:var(--text-main);
}
.modalInfoRow{
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  font-size:12px;
  color:var(--text-main);
  border-bottom:1px solid rgba(255,255,255,0.1);
  padding:4px 0;
}
.modalInfoKey{
  color:var(--text-soft);
  margin-right:8px;
}
.modalInfoVal{
  font-weight:500;
}
.modalEmpty{
  font-size:12px;
  color:var(--text-soft);
  text-align:center;
  padding:8px 0;
}

/* Edit membres groupe */
.checkRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:12px;
  border:1px solid rgba(255,255,255,0.1);
  border-radius:10px;
  padding:6px 8px;
  gap:8px;
  margin-bottom:6px;
  background:rgba(0,0,0,0.3);
}
.checkName{
  flex:1;
  color:var(--text-main);
  font-size:12px;
  font-weight:500;
}
.checkState{
  color:var(--text-soft);
  font-size:12px;
}
.checkRow input[type="checkbox"]{
  margin-right:6px;
}

/* responsive tweaks */
@media(max-width:900px){
  .mastersSection{
    min-width:300px;
  }
  .slavesGrid{
    justify-content:center;
  }
  .slaveCard{
    min-width:130px;
    width:140px;
  }
  .masterActionsRow{
    justify-content:flex-start;
  }
}
@media(max-width:600px){
  .topHeaderInner{
    flex-direction:column;
    align-items:flex-start;
  }
  .rightBlock{
    flex-wrap:wrap;
    justify-content:flex-start;
  }
  .pageContent{
    flex-direction:column;
    align-items:stretch;
  }
  .groupsSection,
  .mastersSection,
  .journalSection{
    max-width:100%;
    width:100%;
  }
  .mastersSection{
    min-width:0;
  }
  .journalSection .logBox{
    height:160px;
  }
}
`;
