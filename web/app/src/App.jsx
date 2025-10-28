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
   Bouton arrondi commun (utilisé partout)
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
   Bouton rond pour les actions des slaves
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
   Pour l'instant on fait simple:
   - "idle": rien → barre cachée
   - "queue" ou "send": barre fine noire animée
   - "acked": barre noire figée pleine + petit "✓"
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
      {isAck && (
        <div className="actionBarAck">
          ✓
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MODALE FLOTTANTE GÉNÉRIQUE
   (fond semi-transparent + carte centrée)
   Utilisée pour:
   - Infos Slave (renommage)
   - Liste membres groupe
   - Edition membres groupe
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
   MODALE INFOS SLAVE (renommer + détails MAC/master)
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
    // sync draft quand on ouvre/ change de slave
    setNameDraft(currentName || "");
  }, [currentName, slaveMac, open]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Détails du Slave"
    >
      <div className="modalSection">
        <label className="modalLabel">Nom du slave</label>
        <input
          className="modalInput"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Nom lisible..."
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
          <span className="modalInfoVal">
            {pcOn ? "allumé" : "éteint"}
          </span>
        </div>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   MODALE "Liste des membres allumés"
   Affiche quels slaves d'un groupe sont ON
========================================================= */
function GroupOnListModal({ open, onClose, members }) {
  // members: array { name, mac, pc_on }
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Machines allumées"
    >
      {(!members || !members.length) && (
        <div className="modalEmpty">Aucune machine allumée</div>
      )}
      {(members || []).map((m) => (
        <div key={m.mac} className="modalInfoRow">
          <span className="modalInfoKey">{m.name || m.mac}</span>
          <span className="modalInfoVal">
            {m.pc_on ? "Allumé" : "Éteint"}
          </span>
        </div>
      ))}
    </ModalShell>
  );
}

/* =========================================================
   MODALE "Editer les membres d'un groupe"
   - liste tous les slaves du user (tous masters)
   - coche ceux déjà dans le groupe
   - bouton "Enregistrer" => upsert group_members
========================================================= */
function GroupMembersModal({
  open,
  onClose,
  groupName,
  allSlaves, // [{mac, friendly_name, pc_on}]
  checkedMap, // { mac: true/false }
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
          <label
            key={sl.mac}
            className="checkRow"
          >
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
        <button
          className="subtleBtn"
          onClick={onSave}
        >
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   SlaveCard
   - affiche nom du slave EN GROS
   - sous-titre "Ordinateur allumé/éteint"
   - i (info) en haut à droite
   - barre d'action en bas (IO, reset, more)
   - actionBarPhase -> barre noire animée
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
      {/* bouton info (le petit i rond en haut à droite) */}
      <div
        className="infoChip"
        onClick={onInfoClick}
        title="Infos / renommer"
      >
        i
      </div>

      {/* nom du slave en gros */}
      <div className="slaveNameMain">
        {friendlyName || mac}
      </div>

      {/* état PC */}
      <div className="slaveSub">
        {pcOn ? "Ordinateur allumé" : "Ordinateur éteint"}
      </div>

      {/* barre d'état des commandes */}
      <ActionBar phase={actionBarPhase} />

      {/* rangée de boutons circulaires en bas */}
      <div className="slaveBtnsRow">
        <CircleBtn onClick={onIO} disabled={false}>
          ⏻
        </CircleBtn>
        <CircleBtn onClick={onReset} disabled={false}>
          ↺
        </CircleBtn>
        <CircleBtn
          extraClass="moreBtn"
          onClick={onMore}
          disabled={false}
        >
          ⋯
        </CircleBtn>
      </div>
    </div>
  );
}

/* =========================================================
   MasterCard
   - un master
   - contient des slaves en grille centrée
   - actions globales master (Pulse / Power / Reset)
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
  slavePhases, // { slave_mac -> "idle" | "queue"|... }
}) {
  const live = isLiveDevice(device);

  return (
    <section className="masterCard">
      <div className="masterTopRow">
        <div className="masterTitleLeft">
          <div className="masterNameLine">
            <span className="masterCardTitle">
              {device.name || device.id}
            </span>
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
              <span className="k">
                Dernier contact :
              </span>{" "}
              <span className="v">
                {device.last_seen
                  ? fmtTS(device.last_seen)
                  : "jamais"}
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
              onSendMasterCmd(device.id, null, "PULSE", {
                ms: 500,
              })
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
            onClick={() =>
              onSendMasterCmd(device.id, null, "RESET", {})
            }
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
   - plus large qu'un slave
   - affiche le nom,  X/Y allumés
   - "Voir la liste" (chip bouton)
   - Renommer / Supprimer / Membres (ouvrir modale d'édition)
   - Actions groupées (IO ON / RESET / OFF / HARD OFF / HARD RESET)
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
  // pour les phases d'action / barre noire par slave: { mac: "idle"/"queue"/"send"/"acked" }
  const [slavePhases, setSlavePhases] = useState({});
  // groups
  // groupsData = [
  //   { id, name, statsOn, statsTotal, members:[{mac, friendly_name, pc_on}], memberMap:{...} }
  // ]
  const [groupsData, setGroupsData] = useState([]);

  /* journal global */
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);
  function addLog(text) {
    setLogs((old) => [
      ...old.slice(-199),
      new Date().toLocaleTimeString() + "  " + text,
    ]);
  }

  /* Modale info+rename d'un slave */
  const [slaveInfoOpen, setSlaveInfoOpen] = useState({
    open: false,
    masterId: "",
    mac: "",
  });

  /* Modale "machines allumées" d'un groupe */
  const [groupOnListOpen, setGroupOnListOpen] = useState({
    open: false,
    groupId: "",
  });

  /* Modale "éditer membres" d'un groupe */
  const [groupMembersOpen, setGroupMembersOpen] = useState({
    open: false,
    groupId: "",
  });

  /* local caches pour rename group, rename slave, etc. */
  // On peut stocker un petit state tampon si besoin.
  // Ici on va piocher directement dans DB côté modale au submit.

  /* ------------- AUTH FLOW ---------------- */
  useEffect(() => {
    // 1. écoute temps réel
    const { data: sub } = sb.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user || null);
        setAuthReady(true);
        if (session?.user) {
          // charger les données
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
    // 2. initial
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

  /* Realtime refs */
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
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          // On se contente de faire un mini refresh local
          addLog("[RT] devices " + payload.eventType);
          refetchDevicesOnly();
        }
      )
      .subscribe();
    // nodes
    chNodes.current = sb
      .channel("rt:nodes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nodes",
        },
        (payload) => {
          addLog("[RT] nodes " + payload.eventType);
          refetchNodesOnly();
        }
      )
      .subscribe();
    // commands
    chCmds.current = sb
      .channel("rt:commands")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commands",
        },
        (payload) => {
          // quand status passe acked => on marque la barre sur le slave correspondant
          const row = payload.new;
          if (row && row.target_mac) {
            if (row.status === "acked") {
              setSlavePhases((old) => ({
                ...old,
                [row.target_mac]: "acked",
              }));
              // effacer l'état quelque secondes après
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
    // groups / group_members (on écoute les 2 tables via le wildcard sur groups et sur group_members)
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

  /* ---------------------- FETCHERS ---------------------- */
  async function refetchDevicesOnly() {
    const { data: devs, error } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });
    if (!error && devs) {
      setDevices(devs);
    }
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
  async function refetchGroupsOnly() {
    // 1. lire tous les groups
    const { data: gs, error: gErr } = await sb
      .from("groups")
      .select("id,name");
    if (gErr) {
      addLog("Err groups: " + gErr.message);
      return;
    }
    // 2. lire group_members
    const { data: membs, error: mErr } = await sb
      .from("group_members")
      .select("group_id,slave_mac");
    if (mErr) {
      addLog("Err group_members: " + mErr.message);
      return;
    }
    // 3. lire nodes pour friendly_name + pc_on
    const { data: allNodes, error: nErr } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if (nErr) {
      addLog("Err nodes in groups: " + nErr.message);
      return;
    }

    // Build structure
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
        friendly_name: nodeInfo?.friendly_name || gm.slave_mac,
        pc_on: !!nodeInfo?.pc_on,
      });
    }

    // stats on / total
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

  /* ---------------- COMMANDES --------------- */

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
    // Appel edge function release_and_delete
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
    // re-fetch
    await fullReload();
  }

  // Slave rename via modal
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
    }
  }

  // command master or slave
  // for group commands we'll call a loop behind
  async function sendCmd(masterId, targetMac, action, payload = {}) {
    // On marque le slave en phase "queue" => barre noire animée
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
      // reset l'anim si erreur
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
      // phase "send"
      if (targetMac) {
        setSlavePhases((old) => ({
          ...old,
          [targetMac]: "send",
        }));
      }
    }
  }

  // group commands (IO ON, etc.)
  async function sendGroupCmd(groupId, actionKey) {
    const g = groupsData.find((x) => x.id === groupId);
    if (!g) return;

    // On va itérer sur g.members => spawn sendCmd correspondants.
    // Règles d'action:
    //  SLV_IO_ON -> SLV_IO {pin:..., mode:"OUT", value:1}
    //  SLV_IO_OFF -> SLV_IO {pin:..., mode:"OUT", value:0}
    //  RESET -> SLV_RESET {}
    //  HARD OFF -> SLV_FORCE_OFF {}
    //  HARD RESET -> SLV_HARD_RESET {ms:3000}
    for (const m of g.members) {
      // On ne sait pas à quel master il appartient ?
      // On n'a pas stocké master_id dans members ici.
      // => refetchGroupsOnly ne nous sauve pas le master_id.
      // On va avoir besoin de masterId pour chaque slave.

      // Petite modif: on enrichit g.members lors du build dans refetchGroupsOnly
      // => OK j'y reviens plus bas.

      // Pour l'instant on skip si pas de master_id
      if (!m.master_id) continue;

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

  /* NOTE IMPORTANTE :
     Pour que sendGroupCmd sache à quel master appartient chaque slave,
     on a besoin que groupsData.members contienne master_id pour chaque slave.

     On modifie refetchGroupsOnly pour aller chercher master_id dans nodes.
     Je l'ai fait plus haut ? Pas encore => on corrige:

     Au lieu de nodeInfo?.friendly_name etc. on met aussi nodeInfo?.master_id.

     (Je vais réécrire refetchGroupsOnly juste après ce bloc.)
  */

  // réécriture de refetchGroupsOnly avec master_id inclus
  async function refetchGroupsOnlyFixed() {
    const { data: gs, error: gErr } = await sb
      .from("groups")
      .select("id,name");
    if (gErr) {
      addLog("Err groups: " + gErr.message);
      return;
    }
    const { data: membs, error: mErr } = await sb
      .from("group_members")
      .select("group_id,slave_mac");
    if (mErr) {
      addLog("Err group_members: " + mErr.message);
      return;
    }
    const { data: allNodes, error: nErr } = await sb
      .from("nodes")
      .select(
        "master_id,slave_mac,friendly_name,pc_on"
      );
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
        master_id: nodeInfo?.master_id, // <--- important
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

  // on écrase fullReload pour utiliser cette version
  async function fullReloadFixed() {
    await Promise.all([
      refetchDevicesOnly(),
      refetchNodesOnly(),
      refetchGroupsOnlyFixed(),
    ]);
  }

  // on écrase attachRealtime callback where needed => déjà utilisé plus haut pour groups,
  // mais on doit utiliser refetchGroupsOnlyFixed au lieu de refetchGroupsOnly.
  // ci-dessous on corrige manuellement dans les .on() plus haut ?
  // Pour rester simple maintenant : après toute modif de groupe on appellera fullReloadFixed().

  // => On met à jour la fonction onOpenMembersEdit, onRenameGroup etc.


  /* ---------------- GROUP MGMT --------------- */

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
      await fullReloadFixed();
    }
  }

  async function deleteGroup(id) {
    if (!window.confirm("Supprimer ce groupe ?")) return;
    // On supprime d'abord ses membres, puis le groupe
    const { error: e1 } = await sb
      .from("group_members")
      .delete()
      .eq("group_id", id);
    if (e1) {
      window.alert("Erreur suppr membres groupe: " + e1.message);
      return;
    }
    const { error: e2 } = await sb
      .from("groups")
      .delete()
      .eq("id", id);
    if (e2) {
      window.alert("Erreur suppr groupe: " + e2.message);
      return;
    }
    addLog(`Groupe ${id} supprimé`);
    await fullReloadFixed();
  }

  // ouvrir modale "liste allumés"
  function openGroupOnListModal(groupId) {
    setGroupOnListOpen({ open: true, groupId });
  }
  function closeGroupOnListModal() {
    setGroupOnListOpen({ open: false, groupId: "" });
  }

  // ouvrir modale "éditer membres"
  function openGroupMembersModal(groupId) {
    setGroupMembersOpen({ open: true, groupId });
  }
  function closeGroupMembersModal() {
    setGroupMembersOpen({ open: false, groupId: "" });
  }

  // onToggleMac dans modale membres => on gère l'état local checkedMap
  const [editMembersChecked, setEditMembersChecked] = useState({});
  useEffect(() => {
    if (!groupMembersOpen.open) return;
    // initial fill
    const g = groupsData.find(
      (gg) => gg.id === groupMembersOpen.groupId
    );
    if (g) {
      // map des membres
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
    // On va upserter group_members
    const gid = groupMembersOpen.groupId;
    if (!gid) return;

    // 1. effacer tous les membres existants
    const { error: delErr } = await sb
      .from("group_members")
      .delete()
      .eq("group_id", gid);
    if (delErr) {
      window.alert("Erreur clear membres: " + delErr.message);
      return;
    }
    // 2. réinsérer pour tous les mac cochés
    const rows = Object.entries(editMembersChecked)
      .filter(([mac, ok]) => ok)
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
    await fullReloadFixed();
  }

  /* ---------------- SLAVE INFO MODAL --------------- */
  function openSlaveInfo(masterId, mac) {
    setSlaveInfoOpen({ open: true, masterId, mac });
  }
  function closeSlaveInfo() {
    setSlaveInfoOpen({ open: false, masterId: "", mac: "" });
  }

  // Récupère les infos du slave courant pour la modale
  const currentSlaveInfo = useMemo(() => {
    if (!slaveInfoOpen.open) return null;
    const { masterId, mac } = slaveInfoOpen;
    const list = nodesByMaster[masterId] || [];
    const found = list.find((s) => s.mac === mac);
    return found || null;
  }, [slaveInfoOpen, nodesByMaster]);

  async function handleSlaveRename(newName) {
    if (!slaveInfoOpen.open) return;
    await doRenameSlave(
      slaveInfoOpen.masterId,
      slaveInfoOpen.mac,
      newName
    );
    closeSlaveInfo();
  }

  /* ---------------- UI ACTIONS ---------------- */

  async function askAddMaster() {
    // on appelle create_pair_code
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
      `Code: ${String(code).padStart(6, "0")} (expire dans ~${ttlSec}s)\n` +
        "Saisir ce code dans le portail Wi-Fi du MASTER."
    );
  }

  async function askAddGroup() {
    const gname = window.prompt(
      "Nom du nouveau groupe ?",
      ""
    );
    if (!gname) return;
    const { data: ins, error } = await sb
      .from("groups")
      .insert({ name: gname })
      .select("id")
      .single();
    if (error) {
      window.alert(
        "Erreur création groupe: " + error.message
      );
      return;
    }
    addLog(
      `Groupe créé (${ins?.id || "?"}): ${gname}`
    );
    await fullReloadFixed();
  }

  function handleLogout() {
    sb.auth.signOut();
  }

  function handleLogin() {
    // on relance un flux google
    sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: location.href,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  /* ============ RENDU SECTION GROUPES ============= */
  function renderGroupsSection() {
    if (!groupsData?.length) {
      return (
        <div className="groupsSection">
          <div className="sectionTitleRow">
            <div className="sectionTitle">
              Groupes
            </div>
            <div className="sectionSub">
              Contrôler plusieurs machines en même temps
            </div>
          </div>
          <div className="noGroupsNote smallText">
            Aucun groupe pour l’instant
          </div>
        </div>
      );
    }
    return (
      <div className="groupsSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">
            Groupes
          </div>
          <div className="sectionSub">
            Contrôler plusieurs machines en même temps
          </div>
        </div>

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
      </div>
    );
  }

  /* ============ RENDU SECTION MASTERS ============= */
  function renderMastersSection() {
    if (!devices.length) {
      return (
        <div className="mastersSection">
          <div className="sectionTitleRow">
            <div className="sectionTitle">
              Masters
            </div>
            <div className="sectionSub">
              Chaque master pilote ses slaves
            </div>
          </div>
          <div className="noGroupsNote smallText">
            Aucun master
          </div>
        </div>
      );
    }

    return (
      <div className="mastersSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">Masters</div>
          <div className="sectionSub">
            Chaque master pilote ses slaves
          </div>
        </div>

        {devices.map((dev) => (
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
              // menu "..." dur -> HARD OFF + HARD RESET
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
        ))}
      </div>
    );
  }

  /* ============ RENDU SECTION JOURNAL ============= */
  function renderJournal() {
    return (
      <div className="journalSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">
            Journal
          </div>
        </div>
        <div
          className="logBox"
          ref={logRef}
        >
          {logs.join("\n")}
        </div>
      </div>
    );
  }

  /* ============ COMPOSITION GLOBALE ============= */
  // si pas authReady → écran vide neutre (évite le flash)
  if (!authReady)
    return (
      <>
        <style>{STYLES}</style>
        <div
          style={{
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
          }}
        >
          Chargement…
        </div>
      </>
    );

  const isLogged = !!user;

  // Données pour modale "liste allumés"
  const currentGroupForOnList = useMemo(() => {
    if (!groupOnListOpen.open) return null;
    return groupsData.find(
      (g) => g.id === groupOnListOpen.groupId
    );
  }, [groupOnListOpen, groupsData]);

  // Données pour modale "éditer membres"
  const currentGroupForMembers = useMemo(() => {
    if (!groupMembersOpen.open) return null;
    return groupsData.find(
      (g) => g.id === groupMembersOpen.groupId
    );
  }, [groupMembersOpen, groupsData]);

  // tous les slaves du user pour l'éditeur de membres
  // => merge nodesByMaster en un seul tableau
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

  return (
    <>
      <style>{STYLES}</style>

      {/* HEADER COLLÉ EN HAUT */}
      <header className="topHeader">
        <div className="topHeaderInner">
          <div className="leftBlock">
            <div className="appTitleRow">
              <div className="appName">
                REMOTE POWER
              </div>
              <div className="appStatus">
                Actif
              </div>
            </div>
            <div className="appSubtitle smallText">
              tableau de contrôle
            </div>
          </div>

          <div className="rightBlock">
            <div className="userMail smallText">
              {isLogged
                ? user.email
                : "non connecté"}
            </div>
            {isLogged ? (
              <>
                <SubtleButton
                  onClick={handleLogout}
                >
                  Déconnexion
                </SubtleButton>

                <SubtleButton
                  onClick={askAddMaster}
                >
                  + MASTER
                </SubtleButton>

                <SubtleButton
                  onClick={askAddGroup}
                >
                  + Groupe
                </SubtleButton>

                <SubtleButton
                  onClick={fullReloadFixed}
                >
                  Rafraîchir
                </SubtleButton>
              </>
            ) : (
              <SubtleButton
                onClick={handleLogin}
              >
                Connexion Google
              </SubtleButton>
            )}
          </div>
        </div>
      </header>

      {/* PAGE CONTENT */}
      <div className="pageBg">
        <div className="pageContent">
          {renderGroupsSection()}
          {renderMastersSection()}
          {renderJournal()}
        </div>
      </div>

      {/* MODALE SLAVE INFO/RENAME */}
      <SlaveInfoModal
        open={slaveInfoOpen.open}
        onClose={closeSlaveInfo}
        slaveMac={slaveInfoOpen.mac}
        masterId={slaveInfoOpen.masterId}
        currentName={
          currentSlaveInfo?.friendly_name ||
          slaveInfoOpen.mac
        }
        pcOn={!!currentSlaveInfo?.pc_on}
        onRename={handleSlaveRename}
      />

      {/* MODALE LISTE ALLUMÉS */}
      <GroupOnListModal
        open={groupOnListOpen.open}
        onClose={closeGroupOnListModal}
        members={
          currentGroupForOnList?.members || []
        }
      />

      {/* MODALE EDIT MEMBRES */}
      <GroupMembersModal
        open={groupMembersOpen.open}
        onClose={closeGroupMembersModal}
        groupName={
          currentGroupForMembers?.name || ""
        }
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
   (toutes les classes utilisées ci-dessus)
   On gère:
   - header translucide
   - background image en plein écran derrière
   - cartes verre dépoli
   - boutons subtils
   - modales
========================================================= */
const STYLES = `
:root{
  --bg-page:#0d0f10;
  --glass-bg:rgba(255,255,255,0.08);
  --glass-border:rgba(255,255,255,0.18);
  --glass-inner-bg:rgba(255,255,255,0.22);
  --text-main:#fff;
  --text-dim:rgba(255,255,255,0.7);
  --text-soft:rgba(255,255,255,0.5);
  --bubble-bg:rgba(0,0,0,0.05);
  --bubble-bg-hover:rgba(0,0,0,0.09);
  --bubble-border:rgba(0,0,0,0);
  --online-green:#4ade80;
  --online-red:#f87171;
  --modal-bg:rgba(0,0,0,0.45);
  --card-bg-blur:rgba(255,255,255,0.12);
  --small-card-bg:rgba(255,255,255,0.18);
  --border-soft:rgba(255,255,255,0.25);
  --shadow-card:0 30px 60px rgba(0,0,0,0.6);
  --transition-fast:0.15s ease;
  font-size:14px;
  line-height:1.4;
  color-scheme:dark;
  -webkit-font-smoothing:antialiased;
}
*{
  box-sizing:border-box;
}
html,body,#root{
  margin:0;
  padding:0;
  background:var(--bg-page);
  color:var(--text-main);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif;
}

/* HEADER collé en haut */
.topHeader{
  position:sticky;
  top:0;
  left:0;
  right:0;
  z-index:2000;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  background:rgba(20,20,20,0.55);
  border-bottom:1px solid rgba(255,255,255,0.12);
  box-shadow:0 20px 50px rgba(0,0,0,0.8);
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
.leftBlock{}
.appTitleRow{
  display:flex;
  align-items:baseline;
  gap:8px;
}
.appName{
  font-weight:600;
  font-size:16px;
  color:var(--text-main);
}
.appStatus{
  font-size:12px;
  color:var(--online-green);
  font-weight:500;
}
.appSubtitle{
  color:var(--text-soft);
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
}

/* PAGE BACKGROUND (image plein écran derrière) */
.pageBg{
  min-height:100vh;
  background:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1920&q=60");
  background-size:cover;
  background-position:center;
  padding:24px 16px 80px;
  /* fade overlay sombre pour le contraste */
  position:relative;
}
.pageBg::after{
  content:"";
  position:absolute;
  inset:0;
  background:rgba(0,0,0,0.35);
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

/* Sections grandes: Groupes / Masters / Journal */
.groupsSection,
.mastersSection,
.journalSection{
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.2);
  border-radius:12px;
  box-shadow:var(--shadow-card);
  backdrop-filter:blur(20px) saturate(140%);
  -webkit-backdrop-filter:blur(20px) saturate(140%);
  padding:16px;
  color:var(--text-main);
}
.sectionTitleRow{
  display:flex;
  flex-direction:column;
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
.smallText{
  font-size:12px;
  color:var(--text-dim);
}
.noGroupsNote{
  padding:8px 0;
  color:var(--text-dim);
}

/* GROUP CARD */
.groupListWrap{
  display:flex;
  flex-wrap:wrap;
  gap:16px;
}
.groupCard{
  background:rgba(255,255,255,0.15);
  border:1px solid rgba(255,255,255,0.3);
  box-shadow:0 20px 50px rgba(0,0,0,0.7);
  border-radius:12px;
  padding:12px 12px 14px;
  min-width:260px;
  max-width:360px;
  color:var(--text-main);
  display:flex;
  flex-direction:column;
  gap:12px;
  backdrop-filter:blur(20px) saturate(140%);
  -webkit-backdrop-filter:blur(20px) saturate(140%);
}
.groupHeadRow{
  display:flex;
  justify-content:space-between;
  flex-wrap:wrap;
  row-gap:8px;
}
.groupMainInfo{
  max-width:60%;
}
.groupNameLine{
  color:var(--text-main);
  font-size:14px;
  font-weight:600;
}
.groupSubLine{
  font-size:12px;
  color:var(--text-soft);
  display:flex;
  align-items:center;
  flex-wrap:wrap;
}
.groupMiniActions{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  align-items:flex-start;
  justify-content:flex-end;
  min-width:120px;
}
.groupCmdRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  font-size:12px;
  color:var(--text-main);
}

/* MASTER CARD */
.masterCard{
  background:rgba(255,255,255,0.15);
  border:1px solid rgba(255,255,255,0.3);
  border-radius:12px;
  box-shadow:var(--shadow-card);
  backdrop-filter:blur(20px) saturate(140%);
  -webkit-backdrop-filter:blur(20px) saturate(140%);
  padding:16px;
  color:var(--text-main);
  display:flex;
  flex-direction:column;
  gap:16px;
}
.masterTopRow{
  display:flex;
  flex-direction:column;
  gap:12px;
}
@media(min-width:768px){
  .masterTopRow{
    flex-direction:row;
    justify-content:space-between;
    align-items:flex-start;
  }
}
.masterTitleLeft{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.masterNameLine{
  display:flex;
  flex-wrap:wrap;
  align-items:baseline;
  gap:8px;
}
.masterCardTitle{
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
}
.onlineBadge{
  font-size:12px;
  font-weight:500;
  padding:2px 6px;
  line-height:1.2;
  border-radius:6px;
  background:rgba(0,0,0,0.35);
}
.onlineYes{
  color:var(--online-green);
}
.onlineNo{
  color:var(--online-red);
}
.masterMeta{
  color:var(--text-soft);
  line-height:1.4;
  font-size:12px;
}
.kv .k{
  opacity:0.6;
}
.kv .v{
  opacity:0.9;
}
.masterActionsRow{
  display:flex;
  flex-wrap:wrap;
  align-items:flex-start;
  gap:8px;
  font-size:12px;
  justify-content:flex-start;
}
@media(min-width:768px){
  .masterActionsRow{
    justify-content:flex-end;
    max-width:60%;
  }
}

/* SLAVES WRAP */
.slavesWrap{
  display:flex;
  width:100%;
  justify-content:center;
}
.slavesGrid{
  display:flex;
  flex-wrap:wrap;
  gap:16px;
  justify-content:center;
  width:100%;
}

/* SLAVE CARD */
.slaveCard{
  position:relative;
  width:140px;
  min-width:140px;
  max-width:180px;
  background:rgba(255,255,255,0.18);
  border:1px solid rgba(255,255,255,0.28);
  border-radius:10px;
  box-shadow:0 25px 50px rgba(0,0,0,0.8);
  color:var(--text-main);
  display:flex;
  flex-direction:column;
  padding:16px 12px 12px;
  backdrop-filter:blur(20px) saturate(140%);
  -webkit-backdrop-filter:blur(20px) saturate(140%);
}
.slaveNameMain{
  text-align:center;
  font-weight:600;
  font-size:14px;
  color:var(--text-main);
  margin-top:8px;
}
.slaveSub{
  text-align:center;
  font-size:12px;
  color:var(--text-soft);
  margin-top:4px;
  margin-bottom:8px;
}
/* bouton "i" en haut à droite */
.infoChip{
  position:absolute;
  top:8px;
  right:8px;
  background:rgba(0,0,0,0.4);
  border-radius:999px;
  width:24px;
  height:24px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:12px;
  font-weight:500;
  color:#fff;
  cursor:pointer;
  user-select:none;
}
.infoChip:hover{
  background:rgba(0,0,0,0.6);
}
/* barre d'action (progression commande) */
.actionBarWrapper{
  position:relative;
  width:100%;
  height:4px;
  background:rgba(0,0,0,0.15);
  border-radius:2px;
  overflow:hidden;
  margin-bottom:12px;
}
.actionBarFill{
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  background:#000;
  border-radius:2px;
  width:0%;
}
/* queue = clignotement court */
.queueAnim{
  animation:queuePulse 0.4s infinite alternate;
  width:30%;
}
@keyframes queuePulse{
  0%{opacity:0.3;width:20%;}
  100%{opacity:0.9;width:30%;}
}
/* send = barre qui se remplit */
.sendAnim{
  animation:sendMove 1.2s infinite;
}
@keyframes sendMove{
  0%{width:10%;opacity:0.4;}
  50%{width:60%;opacity:0.8;}
  100%{width:90%;opacity:0.4;}
}
/* acked = plein + check */
.ackedFill{
  width:100%!important;
  opacity:1!important;
}
.actionBarAck{
  position:absolute;
  right:4px;
  top:50%;
  transform:translateY(-50%);
  font-size:10px;
  color:#fff;
  font-weight:600;
}

/* rangée de boutons ronds */
.slaveBtnsRow{
  display:flex;
  justify-content:center;
  gap:10px;
}

/* circle btns revisités */
.circleBtn{
  appearance:none;
  border:0;
  outline:0;
  cursor:pointer;
  background:rgba(0,0,0,0.05);
  color:var(--text-main);
  width:42px;
  height:42px;
  min-width:42px;
  min-height:42px;
  border-radius:999px;
  font-size:14px;
  font-weight:500;
  display:flex;
  align-items:center;
  justify-content:center;
  transition:background var(--transition-fast), color var(--transition-fast);
  box-shadow:0 10px 25px rgba(0,0,0,0.6);
}
.circleBtn.moreBtn{
  font-size:18px;
  font-weight:600;
}
.circleBtn:hover{
  background:rgba(0,0,0,0.09);
}
.circleBtn:disabled{
  opacity:.4;
  cursor:default;
}

/* SUBTLE BUTTON (capsules grises header/group/master) */
.subtleBtn{
  appearance:none;
  border:1px solid rgba(255,255,255,0.2);
  background:rgba(255,255,255,0.08);
  color:var(--text-main);
  border-radius:8px;
  padding:6px 10px;
  font-size:12px;
  line-height:1.2;
  cursor:pointer;
  box-shadow:0 10px 25px rgba(0,0,0,0.6);
  display:inline-flex;
  align-items:center;
  justify-content:center;
  transition:all var(--transition-fast);
  white-space:nowrap;
}
.subtleBtn:hover{
  background:rgba(255,255,255,0.12);
}
.subtleBtn:disabled{
  opacity:.4;
  cursor:default;
}

/* Chip style pour "Voir la liste" */
.chipBtn{
  appearance:none;
  border:0;
  border-radius:999px;
  background:rgba(0,0,0,0.06);
  font-size:11px;
  line-height:1;
  padding:4px 8px;
  color:var(--text-main);
  cursor:pointer;
  transition:background var(--transition-fast);
}
.chipBtn:disabled{
  opacity:.4;
  cursor:default;
}
.chipBtn:hover:not(:disabled){
  background:rgba(0,0,0,0.1);
}

/* JOURNAL */
.journalSection .logBox{
  background:rgba(0,0,0,0.3);
  color:#fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.2);
  box-shadow:0 20px 50px rgba(0,0,0,0.7);
  min-height:100px;
  max-height:180px;
  overflow:auto;
  padding:12px;
  font-size:12px;
  line-height:1.45;
  white-space:pre-wrap;
}

/* MODALES GLOBAL */
.modalOverlay{
  position:fixed;
  inset:0;
  background:var(--modal-bg);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:4000;
}
.modalCard{
  min-width:260px;
  max-width:360px;
  background:rgba(30,30,30,0.8);
  color:#fff;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.2);
  box-shadow:0 30px 60px rgba(0,0,0,0.8);
  backdrop-filter:blur(30px) saturate(160%);
  -webkit-backdrop-filter:blur(30px) saturate(160%);
  padding:16px;
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
  font-weight:600;
  font-size:14px;
  color:#fff;
}
.smallCloseBtn{
  appearance:none;
  border:0;
  background:rgba(0,0,0,0.4);
  color:#fff;
  border-radius:6px;
  font-size:12px;
  line-height:1;
  padding:4px 6px;
  cursor:pointer;
}
.smallCloseBtn:hover{
  background:rgba(0,0,0,0.6);
}
.modalBody{
  font-size:13px;
  color:#fff;
}
.modalSection{
  background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.2);
  border-radius:8px;
  padding:12px;
  margin-bottom:8px;
}
.modalLabel{
  font-size:11px;
  font-weight:500;
  color:#fff;
  margin-bottom:4px;
  display:block;
}
.modalInput{
  width:100%;
  background:rgba(0,0,0,0.4);
  border:1px solid rgba(255,255,255,0.2);
  border-radius:6px;
  outline:none;
  font-size:13px;
  color:#fff;
  padding:6px 8px;
}
.modalInput:focus{
  border-color:rgba(255,255,255,0.4);
}
.modalInfoRow{
  display:flex;
  justify-content:space-between;
  font-size:12px;
  line-height:1.4;
  color:#fff;
  margin-bottom:4px;
}
.modalInfoKey{
  font-weight:500;
  opacity:0.8;
  margin-right:8px;
}
.modalInfoVal{
  opacity:0.9;
}
.modalEmpty{
  color:#fff;
  font-size:12px;
  opacity:0.7;
  text-align:center;
  padding:12px 0;
}

/* check list dans modale "membres" */
.checkRow{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:13px;
  line-height:1.3;
  color:#fff;
  margin-bottom:6px;
}
.checkRow input[type="checkbox"]{
  width:16px;
  height:16px;
}
.checkName{
  flex:1;
}
.checkState{
  font-size:11px;
  opacity:0.7;
  min-width:48px;
  text-align:right;
}
`;
