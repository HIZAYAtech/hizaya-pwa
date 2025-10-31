import { useEffect, useRef, useState, useMemo } from "react";
import { sb, stripOAuthParams } from "./supabaseClient";

/* ====== Const ======--- */
const LIVE_TTL_MS = 8000;
const DEFAULT_IO_PIN = 26;
const REFETCH_DEBOUNCE_MS = 1200;

/* ====== Helpers ====== */
function fmtTS(s){ if(!s) return "—"; const d = new Date(s); return d.toLocaleString(); }
function isLiveDevice(dev){ if(!dev?.last_seen) return false; return Date.now()-new Date(dev.last_seen).getTime() < LIVE_TTL_MS; }

/* ====== UI bits ====== */
function SubtleButton({children,onClick,disabled,style}){ return <button className="subtleBtn" disabled={disabled} onClick={onClick} style={style}>{children}</button>; }
function CircleBtn({children,onClick,disabled,extraClass}){ return <button className={`circleBtn ${extraClass||""}`} disabled={disabled} onClick={onClick}><span className="circleBtnInner">{children}</span></button>; }
function ActionBar({phase}){ if(!phase||phase==="idle") return null; const isAck=phase==="acked"; return(
  <div className="actionBarBlock">
    {isAck && <div className="actionStatusText">succès</div>}
    <div className="actionBarWrapper">
      <div className={"actionBarFill "+(phase==="queue"?"queueAnim":phase==="send"?"sendAnim":isAck?"ackedFill":"")} />
    </div>
  </div>
); }

/* --- Modale générique --- */
function ModalShell({open,onClose,children,title}){ if(!open) return null; return(
  <div className="modalOverlay" onClick={onClose}>
    <div className="modalCard" onClick={(e)=>e.stopPropagation()}>
      <div className="modalHeader">
        <div className="modalTitle">{title}</div>
        <button className="smallCloseBtn" onClick={onClose}>✕</button>
      </div>
      <div className="modalBody">{children}</div>
    </div>
  </div>
); }

/* --- Modale infos slave --- */
function SlaveInfoModal({open,onClose,slaveMac,masterId,currentName,onRename,pcOn}){
  const [nameDraft,setNameDraft]=useState(currentName||"");
  useEffect(()=>{ setNameDraft(currentName||""); },[currentName,slaveMac,open]);
  return(
    <ModalShell open={open} onClose={onClose} title="Détails du Slave">
      <div className="modalSection">
        <label className="modalLabel">Nom du slave</label>
        <input className="modalInput" value={nameDraft} onChange={(e)=>setNameDraft(e.target.value)} placeholder="Nom lisible…" />
        <button className="subtleBtn" style={{marginTop:8}} onClick={()=>onRename(nameDraft)}>Enregistrer</button>
      </div>
      <div className="modalSection">
        <div className="modalInfoRow"><span className="modalInfoKey">MAC :</span><span className="modalInfoVal">{slaveMac||"—"}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">Master :</span><span className="modalInfoVal">{masterId||"—"}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">PC :</span><span className="modalInfoVal">{pcOn?"allumé":"éteint"}</span></div>
      </div>
    </ModalShell>
  );
}

/* --- Modale liste machines allumées --- */
function GroupOnListModal({open,onClose,members}){
  return(
    <ModalShell open={open} onClose={onClose} title="Machines allumées">
      {(!members||!members.length)&&<div className="modalEmpty">Aucune machine allumée</div>}
      {(members||[]).map((m)=>(
        <div key={m.mac} className="modalInfoRow">
          <span className="modalInfoKey">{m.friendly_name||m.mac}</span>
          <span className="modalInfoVal">{m.pc_on?"Allumé":"Éteint"}</span>
        </div>
      ))}
    </ModalShell>
  );
}

/* --- Modale “Réglages du groupe” --- */
function GroupSettingsModal({ open, onClose, group, onRenameGroup, onOpenMembersEdit, onDeleteGroup }) {
  if (!open || !group) return null;
  return (
    <ModalShell open={open} onClose={onClose} title={`Réglages — ${group.name}`}>
      <div className="modalSection">
        <SubtleButton onClick={()=>{ onRenameGroup(group.id); onClose(); }}>Renommer</SubtleButton>
        <SubtleButton onClick={()=>{ onOpenMembersEdit(group.id); onClose(); }}>Membres</SubtleButton>
        <SubtleButton onClick={()=>{ onDeleteGroup(group.id); onClose(); }} style={{background:"rgba(255,0,0,0.08)", borderColor:"rgba(255,0,0,0.25)"}}>
          Supprimer
        </SubtleButton>
      </div>
    </ModalShell>
  );
}

/* --- Modale édition membres --- */
function GroupMembersModal({open,onClose,groupName,allSlaves,checkedMap,onToggleMac,onSave}){
  return(
    <ModalShell open={open} onClose={onClose} title={`Membres de "${groupName}"`}>
      <div className="modalSection">
        {(allSlaves||[]).map((sl)=>(
          <label key={sl.mac} className="checkRow">
            <input type="checkbox" checked={!!checkedMap[sl.mac]} onChange={()=>onToggleMac(sl.mac)} />
            <span className="checkName">{sl.friendly_name||sl.mac}</span>
            <span className="checkState">{sl.pc_on?"allumé":"éteint"}</span>
          </label>
        ))}
      </div>
      <div style={{textAlign:"right",marginTop:8}}>
        <button className="subtleBtn" onClick={onSave}>Enregistrer</button>
      </div>
    </ModalShell>
  );
}

/* --- Modale Réglages Master (nouvelle) --- */
function MasterSettingsModal({ open, onClose, device, onRename, onDelete }){
  if(!open || !device) return null;
  return (
    <ModalShell open={open} onClose={onClose} title={`Réglages — ${device.name || device.id}`}>
      <div className="modalSection">
        <div className="modalInfoRow"><span className="modalInfoKey">ID :</span><span className="modalInfoVal">{device.id}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">MAC :</span><span className="modalInfoVal">{device.master_mac || "—"}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">Dernier contact :</span><span className="modalInfoVal">{device.last_seen ? fmtTS(device.last_seen) : "jamais"}</span></div>
      </div>
      <div className="modalSection">
        <SubtleButton onClick={()=>{ onRename(device.id); onClose(); }}>Renommer</SubtleButton>
        <SubtleButton onClick={()=>{ onDelete(device.id); onClose(); }} style={{background:"rgba(255,0,0,0.08)", borderColor:"rgba(255,0,0,0.25)"}}>
          Supprimer
        </SubtleButton>
      </div>
    </ModalShell>
  );
}

/* --- Modale Réglages du Compte (nouvelle) --- */
function AccountSettingsModal({ open, onClose, initialName, onSave }){
  const [draft,setDraft] = useState(initialName||"");
  useEffect(()=>{ setDraft(initialName||""); },[initialName,open]);
  if(!open) return null;
  return (
    <ModalShell open={open} onClose={onClose} title="Réglages du compte">
      <div className="modalSection">
        <label className="modalLabel">Nom du compte</label>
        <input className="modalInput" value={draft} onChange={(e)=>setDraft(e.target.value)} placeholder="Nom du compte…" />
        <button className="subtleBtn" style={{marginTop:8}} onClick={()=>{ if(draft.trim()) onSave(draft.trim()); onClose(); }}>
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

/* --- Carte Slave --- */
function SlaveCard({masterId,mac,friendlyName,pcOn,onInfoClick,onIO,onReset,onMore,actionBarPhase}){
  return(
    <div className="slaveCard">
      <div className="infoChip" onClick={onInfoClick} title="Infos / renommer">i</div>
      <div className="slaveNameMain">{friendlyName||mac}</div>
      <div className="slaveSub">{pcOn?"Ordinateur allumé":"Ordinateur éteint"}</div>
      <ActionBar phase={actionBarPhase}/>
      <div className="slaveBtnsRow">
        <CircleBtn onClick={onIO}>⏻</CircleBtn>
        <CircleBtn onClick={onReset}>↺</CircleBtn>
        <CircleBtn extraClass="moreBtn" onClick={onMore}>⋯</CircleBtn>
      </div>
    </div>
  );
}

/* --- Carte Master --- */
function MasterCard({
  device,slaves,
  onOpenSettings,        // NEW
  onMore,                // NEW
  onMasterRename,onMasterDelete,onSendMasterCmd,
  openSlaveInfoFor,onSlaveIO,onSlaveReset,onSlaveMore,slavePhases
}){
  const live=isLiveDevice(device);
  return(
    <section className="masterCard">
      <div className="masterTopRow">
        <div className="masterTitleLeft">
          <div className="masterNameLine">
            <span className="masterCardTitle">{device.name||device.id}</span>
            <span className={"onlineBadge "+(live?"onlineYes":"onlineNo")}>{live?"EN LIGNE":"HORS LIGNE"}</span>
          </div>

          {/* ⛔️ Infos ID/MAC/dernier contact NE SONT PLUS affichées ici (elles sont dans la modale Réglages) */}
        </div>

        <div className="masterActionsRow">
          {/* Bouton Réglages identique à Groupes */}
          <SubtleButton onClick={()=>onOpenSettings(device.id)}>Réglages</SubtleButton>

          {/* Bouton … (Hard OFF / Hard RESET pour tous les slaves de ce master) */}
          <CircleBtn extraClass="moreBtn" onClick={()=>onMore(device.id)}>⋯</CircleBtn>

          {/* On conserve les autres actions existantes */}
          <SubtleButton onClick={()=>onSendMasterCmd(device.id,null,"PULSE",{ms:500})}>Pulse 500ms</SubtleButton>
          <SubtleButton onClick={()=>onSendMasterCmd(device.id,null,"POWER_ON",{})}>Power ON</SubtleButton>
          <SubtleButton onClick={()=>onSendMasterCmd(device.id,null,"POWER_OFF",{})}>Power OFF</SubtleButton>
          <SubtleButton onClick={()=>onSendMasterCmd(device.id,null,"RESET",{})}>Reset</SubtleButton>
        </div>
      </div>

      <div className="slavesWrap">
        <div className="slavesGrid">
          {(slaves||[]).map((sl)=>(
            <SlaveCard key={sl.mac}
              masterId={device.id}
              mac={sl.mac}
              friendlyName={sl.friendly_name}
              pcOn={!!sl.pc_on}
              actionBarPhase={slavePhases[sl.mac]||"idle"}
              onInfoClick={()=>openSlaveInfoFor(device.id,sl.mac)}
              onIO={()=>onSlaveIO(device.id,sl.mac)}
              onReset={()=>onSlaveReset(device.id,sl.mac)}
              onMore={()=>onSlaveMore(device.id,sl.mac)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- Carte Groupe --- */
function GroupCard({ group, onOpenSettings, onOpenOnList, onGroupCmd }){
  const { id, name, statsOn, statsTotal } = group;
  return (
    <div className="groupCard">
      <div className="groupHeadRow">
        <div className="groupMainInfo">
          <div className="groupNameLine">{name}</div>
          <div className="groupSubLine">
            {statsOn}/{statsTotal} allumé(s)
            <button className="chipBtn" style={{ marginLeft: 6 }} onClick={() => onOpenOnList(id)} disabled={!statsTotal}>
              Voir la liste
            </button>
          </div>
        </div>
        <div className="groupMiniActions">
          <SubtleButton onClick={() => onOpenSettings(id)}>Réglages</SubtleButton>
        </div>
      </div>
      <div className="slaveBtnsRow" style={{ marginTop: 8 }}>
        <CircleBtn onClick={() => onGroupCmd(id, "SLV_IO_ON")}>ON</CircleBtn>
        <CircleBtn onClick={() => onGroupCmd(id, "RESET")}>↺</CircleBtn>
        <CircleBtn onClick={() => onGroupCmd(id, "SLV_IO_OFF")}>OFF</CircleBtn>
        <CircleBtn extraClass="moreBtn" onClick={()=>{
          const act = window.prompt("Actions avancées:\n1 = HARD OFF\n2 = HARD RESET","1");
          if (act === "1") onGroupCmd(id, "SLV_FORCE_OFF");
          else if (act === "2") onGroupCmd(id, "SLV_HARD_RESET");
        }}>⋯</CircleBtn>
      </div>
    </div>
  );
}

/* ====== Login plein écran ====== */
function LoginScreen({ onLogin }){
  return(
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
   APP
========================================================= */
let realtimeAttached = false;

export default function App(){
  const [authReady,setAuthReady]=useState(false);
  const [user,setUser]=useState(null);
  const [accountName,setAccountName]=useState("");

  const [devices,setDevices]=useState([]);
  const [nodesByMaster,setNodesByMaster]=useState({});
  const [groupsData,setGroupsData]=useState([]);
  const [slavePhases,setSlavePhases]=useState({});

  const [logs,setLogs]=useState([]);
  const logRef=useRef(null);
  const addLog=(t)=>setLogs((old)=>[...old.slice(-199), new Date().toLocaleTimeString()+"  "+t]);

  const [slaveInfoOpen,setSlaveInfoOpen]=useState({open:false,masterId:"",mac:""});
  const [groupOnListOpen,setGroupOnListOpen]=useState({open:false,groupId:""});
  const [groupMembersOpen,setGroupMembersOpen]=useState({open:false,groupId:""});
  const [editMembersChecked,setEditMembersChecked]=useState({});

  const [groupSettingsOpen, setGroupSettingsOpen] = useState({ open:false, groupId:"" });

  // NEW: états pour modales de réglages master & compte
  const [masterSettingsOpen, setMasterSettingsOpen] = useState({ open:false, masterId:"" });
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  const chDevices=useRef(null); const chNodes=useRef(null); const chCmds=useRef(null); const chGroups=useRef(null);

  // ---------- Debounce timers ----------
  const timers = useRef({ dev:null, ng:null });
  const scheduleDevicesRefetch = () => {
    if (timers.current.dev) clearTimeout(timers.current.dev);
    timers.current.dev = setTimeout(()=>{ refetchDevicesOnly(); timers.current.dev=null; }, REFETCH_DEBOUNCE_MS);
  };
  const scheduleNodesGroupsRefetch = () => {
    if (timers.current.ng) clearTimeout(timers.current.ng);
    timers.current.ng = setTimeout(()=>{ refetchNodesAndGroups(); timers.current.ng=null; }, REFETCH_DEBOUNCE_MS);
  };

  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current) sb.removeChannel(chNodes.current);
    if(chCmds.current) sb.removeChannel(chCmds.current);
    if(chGroups.current) sb.removeChannel(chGroups.current);
    chDevices.current = chNodes.current = chCmds.current = chGroups.current = null;
    realtimeAttached=false;
  }

  function attachRealtime(){
    if(realtimeAttached) return;
    cleanupRealtime();

    chDevices.current = sb.channel("rt:devices")
      .on("postgres_changes",{event:"*",schema:"public",table:"devices"},(payload)=>{
        if (payload?.eventType !== "UPDATE" || payload?.new?.name !== payload?.old?.name) {
          addLog("[RT] devices changed");
        }
        scheduleDevicesRefetch();
      })
      .subscribe();

    chNodes.current = sb.channel("rt:nodes")
      .on("postgres_changes",{event:"*",schema:"public",table:"nodes"},()=>{
        scheduleNodesGroupsRefetch();
      })
      .subscribe();

    chCmds.current = sb.channel("rt:commands")
      .on("postgres_changes",{event:"*",schema:"public",table:"commands"},(payload)=>{
        const row=payload.new;
        if(row && row.target_mac && row.status==="acked"){
          setSlavePhases((o)=>({...o,[row.target_mac]:"acked"}));
          setTimeout(()=>setSlavePhases((o)=>({...o,[row.target_mac]:"idle"})),2000);
          addLog(`[SUCCESS] ${row?.action} → ${row?.master_id}${row?.target_mac?" ▶ "+row?.target_mac:""}`);
        }
      })
      .subscribe();

    chGroups.current = sb.channel("rt:groups+members")
      .on("postgres_changes",{event:"*",schema:"public",table:"groups"},()=>{ scheduleNodesGroupsRefetch(); })
      .on("postgres_changes",{event:"*",schema:"public",table:"group_members"},()=>{ scheduleNodesGroupsRefetch(); })
      .subscribe();

    realtimeAttached=true;
  }

  // ---------- PROFIL (account_name) ----------
  async function loadProfile(){
    try{
      const { data: s } = await sb.auth.getSession();
      const u = s?.session?.user; if(!u) return;

      const { data } = await sb.from("profiles").select("account_name").eq("id", u.id).maybeSingle();

      const metaName = u?.user_metadata?.account_name;
      const emailPrefix = u?.email ? u.email.split("@")[0] : "";

      const name = (data?.account_name && data.account_name.trim()) ||
                   (metaName && String(metaName).trim()) ||
                   emailPrefix;

      setAccountName(name || "");
      addLog(`[profile] nom chargé: ${name} (${data?.account_name ? "profiles" : metaName ? "auth.meta" : "email"})`);
    }catch(e){
      addLog(`[profile] load err: ${e?.message||e}`);
    }
  }

  async function saveAccountName(newName){
    try{
      const safe = String(newName||"").trim();
      if(!safe) return;
      const { data: s } = await sb.auth.getSession();
      const u = s?.session?.user; if(!u) return;

      await sb.auth.updateUser({ data: { account_name: safe } });
      await sb.from("profiles").update({ account_name: safe, email: u.email || null }).eq("id", u.id);

      setAccountName(safe);
      addLog(`Compte renommé : ${safe}`);
    }catch(e){
      addLog(`[profile] save err: ${e?.message||e}`);
    }
  }

  useEffect(()=>{
    let mounted=true;

    async function init(){
      const { data } = await sb.auth.getSession();
      stripOAuthParams();
      const sess = data.session;

      if(!mounted) return;
      if(sess?.user){
        setUser(sess.user);
        setAuthReady(true);
        await loadProfile();
        await fullReload();
        attachRealtime();
      }else{
        setUser(null);
        setAuthReady(true);
      }
    }

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session)=>{
      if(event==="SIGNED_IN"){
        stripOAuthParams();
        setUser(session?.user||null);
        await loadProfile();
        await fullReload();
        attachRealtime();
      }else if(event==="SIGNED_OUT"){
        setUser(null);
        setDevices([]); setNodesByMaster({}); setGroupsData([]); setSlavePhases({});
        cleanupRealtime();
      }else if(event==="TOKEN_REFRESHED"||event==="USER_UPDATED"){
        setUser(session?.user||null);
        await loadProfile();
      }
      setAuthReady(true);
    });

    init();
    return ()=>{
      mounted=false;
      sub?.subscription?.unsubscribe();
      cleanupRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function refetchDevicesOnly(){
    const { data: devs, error } = await sb.from("devices")
      .select("id,name,master_mac,last_seen,online,created_at")
      .order("created_at",{ascending:false});
    if(!error && devs) setDevices(devs);
  }

  // 🔧 refetch combiné pour éviter 2 lectures de nodes
  async function refetchNodesAndGroups(){
    const { data: rows, error: nErr } = await sb.from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if(nErr){ addLog("Err nodes: "+nErr.message); return; }

    const map={};
    for(const r of rows||[]){
      if(!map[r.master_id]) map[r.master_id]=[];
      map[r.master_id].push({ mac:r.slave_mac, friendly_name:r.friendly_name, pc_on:r.pc_on });
    }
    setNodesByMaster(map);

    const { data: gs, error: gErr } = await sb.from("groups").select("id,name");
    if(gErr){ addLog("Err groups: "+gErr.message); return; }
    const { data: membs, error: mErr } = await sb.from("group_members").select("group_id,slave_mac,master_id");
    if(mErr){ addLog("Err group_members: "+mErr.message); return; }

    const friendlyByMac = {};
    const onByMac = {};
    for (const r of rows||[]){
      friendlyByMac[r.slave_mac] = r.friendly_name || r.slave_mac;
      onByMac[r.slave_mac] = !!r.pc_on;
    }

    const membersByGroup={};
    for(const gm of membs||[]){
      if(!membersByGroup[gm.group_id]) membersByGroup[gm.group_id]=[];
      membersByGroup[gm.group_id].push({
        mac:gm.slave_mac,
        master_id: gm.master_id || null,
        friendly_name: friendlyByMac[gm.slave_mac] || gm.slave_mac,
        pc_on: !!onByMac[gm.slave_mac]
      });
    }
    const final=(gs||[]).map((g)=>{
      const mems=membersByGroup[g.id]||[];
      const onCount=mems.filter((x)=>x.pc_on).length;
      return { id:g.id, name:g.name, statsOn:onCount, statsTotal:mems.length, members:mems };
    });
    setGroupsData(final);
  }

  async function fullReload(){
    await Promise.all([refetchDevicesOnly(), refetchNodesAndGroups()]);
  }

  async function renameMaster(id){
    const newName=window.prompt("Nouveau nom du master ?",""); if(!newName) return;
    const { error } = await sb.from("devices").update({name:newName}).eq("id",id);
    if(error) window.alert(error.message); else { addLog(`Master ${id} renommé en ${newName}`); await refetchDevicesOnly(); }
  }
  async function deleteMaster(id){
    if(!window.confirm(`Supprimer le master ${id} ?`)) return;
    const { data: sessionRes } = await sb.auth.getSession();
    const token=sessionRes?.session?.access_token; if(!token){ window.alert("Non connecté."); return; }
    const r=await fetch(`${sb.supabaseUrl}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", apikey: sb.supabaseKey, Authorization:`Bearer ${token}` },
      body:JSON.stringify({ master_id:id })
    });
    if(!r.ok){ const txt=await r.text(); addLog("❌ Suppression : "+txt); }
    else { addLog(`MASTER supprimé : ${id}`); }
    await fullReload();
  }
  async function doRenameSlave(masterId,mac,newName){
    const { error } = await sb.from("nodes").update({friendly_name:newName}).eq("master_id",masterId).eq("slave_mac",mac);
    if(error) window.alert("Erreur rename slave: "+error.message);
    else { addLog(`Slave ${mac} renommé en ${newName}`); await refetchNodesAndGroups(); }
  }
  async function sendCmd(masterId,targetMac,action,payload={}){
    if(targetMac) setSlavePhases((o)=>({...o,[targetMac]:"queue"}));
    const { error } = await sb.from("commands").insert({ master_id:masterId, target_mac:targetMac||null, action, payload });
    if(error){
      addLog("cmd err: "+error.message);
      if(targetMac) setSlavePhases((o)=>({...o,[targetMac]:"idle"}));
    } else {
      if(!targetMac) addLog(`[cmd] ${action} → ${masterId}`);
      if(targetMac) setSlavePhases((o)=>({...o,[targetMac]:"send"}));
    }
  }
  async function sendGroupCmd(groupId,actionKey){
    const g=groupsData.find((x)=>x.id===groupId); if(!g) return;
    for(const m of g.members){
      if(!m.master_id) continue;
      switch(actionKey){
        case "SLV_IO_ON":  await sendCmd(m.master_id,m.mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1}); break;
        case "SLV_IO_OFF": await sendCmd(m.master_id,m.mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:0}); break;
        case "RESET": await sendCmd(m.master_id,m.mac,"SLV_RESET",{}); break;
        case "SLV_FORCE_OFF": await sendCmd(m.master_id,m.mac,"SLV_FORCE_OFF",{}); break;
        case "SLV_HARD_RESET": await sendCmd(m.master_id,m.mac,"SLV_HARD_RESET",{ms:3000}); break;
        default: break;
      }
    }
  }

  // --- NEW: actions UI
  function openMasterSettings(mid){ setMasterSettingsOpen({ open:true, masterId: mid }); }
  function closeMasterSettings(){ setMasterSettingsOpen({ open:false, masterId: "" }); }
  function masterMore(mid){
    const act = window.prompt("Actions avancées (pour tous les slaves de ce master):\n1 = HARD OFF\n2 = HARD RESET","1");
    const slaves = nodesByMaster[mid] || [];
    if(act==="1"){
      for(const s of slaves) sendCmd(mid, s.mac, "SLV_FORCE_OFF", {});
    } else if(act==="2"){
      for(const s of slaves) sendCmd(mid, s.mac, "SLV_HARD_RESET", { ms:3000 });
    }
  }

  function openAccountSettings(){ setAccountSettingsOpen(true); }
  function closeAccountSettings(){ setAccountSettingsOpen(false); }

  // Modales existantes
  const openSlaveInfo=(masterId,mac)=>setSlaveInfoOpen({open:true,masterId,mac});
  const closeSlaveInfo=()=>setSlaveInfoOpen({open:false,masterId:"",mac:""});
  const openGroupOnListModal=(groupId)=>setGroupOnListOpen({open:true,groupId});
  const closeGroupOnListModal=()=>setGroupOnListOpen({open:false,groupId:""});
  const openGroupMembersModal=(groupId)=>setGroupMembersOpen({open:true,groupId});
  const closeGroupMembersModal=()=>setGroupMembersOpen({open:false,groupId:""});

  function openGroupSettingsModal(groupId){ setGroupSettingsOpen({ open:true, groupId }); }
  function closeGroupSettingsModal(){ setGroupSettingsOpen({ open:false, groupId:"" }); }

  useEffect(()=>{
    if(!groupMembersOpen.open) return;
    const g=groupsData.find((gg)=>gg.id===groupMembersOpen.groupId); if(!g) return;
    const initial={}; for(const m of g.members||[]) initial[m.mac]=true;
    setEditMembersChecked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[groupMembersOpen.open]);

  const toggleCheckMac=(mac)=>setEditMembersChecked((o)=>({...o,[mac]:!o[mac]}));
  async function saveGroupMembers(){
    const gid=groupMembersOpen.groupId; if(!gid) return;
    const macToMaster={};
    for(const mid of Object.keys(nodesByMaster)) for(const s of nodesByMaster[mid]) macToMaster[s.mac]=mid;

    const { error: delErr } = await sb.from("group_members").delete().eq("group_id",gid);
    if(delErr){ window.alert("Erreur clear membres: "+delErr.message); return; }
    const rows=Object.entries(editMembersChecked)
      .filter(([,ok])=>ok)
      .map(([mac])=>({ group_id:gid, slave_mac:mac, master_id:macToMaster[mac]||null }))
      .filter((r)=>r.master_id);
    if(rows.length){
      const { error: insErr } = await sb.from("group_members").insert(rows);
      if(insErr){ window.alert("Erreur insert membres: "+insErr.message); return; }
    }
    addLog(`Membres groupe ${gid} mis à jour.`); closeGroupMembersModal(); await refetchNodesAndGroups();
  }

  const currentSlaveInfo = useMemo(()=>{
    if(!slaveInfoOpen.open) return null;
    const { masterId,mac }=slaveInfoOpen; const list=nodesByMaster[masterId]||[];
    return list.find((s)=>s.mac===mac)||null;
  },[slaveInfoOpen,nodesByMaster]);

  const currentGroupForOnList = useMemo(()=>{
    if(!groupOnListOpen.open) return null;
    return groupsData.find((g)=>g.id===groupOnListOpen.groupId)||null;
  },[groupOnListOpen,groupsData]);

  const allSlavesFlat = useMemo(()=>{
    const arr=[]; for(const mid of Object.keys(nodesByMaster)) for(const sl of nodesByMaster[mid]) arr.push({mac:sl.mac,master_id:mid,friendly_name:sl.friendly_name,pc_on:sl.pc_on});
    return arr;
  },[nodesByMaster]);

  const settingsGroupObj = useMemo(()=>{
    if(!groupSettingsOpen.open) return null;
    return groupsData.find(g=>g.id===groupSettingsOpen.groupId)||null;
  },[groupSettingsOpen, groupsData]);

  const settingsMasterObj = useMemo(()=>{
    if(!masterSettingsOpen.open) return null;
    return devices.find(d=>d.id===masterSettingsOpen.masterId) || null;
  },[masterSettingsOpen, devices]);

  /* Rendu */
  if(!authReady){ return <div style={{color:"#fff",padding:"2rem"}}>Chargement…</div>; }
  if(!user){ return <LoginScreen onLogin={handleLogin}/>; }

  const displayAccount = accountName || (user?.email ? user.email.split("@")[0] : "");

  return(
    <>
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
            <div className="userMail smallText">{displayAccount}</div>
            {/* Remplace “Renommer compte” par “Réglages” */}
            <SubtleButton onClick={openAccountSettings}>Réglages</SubtleButton>
            <SubtleButton onClick={handleLogout}>Déconnexion</SubtleButton>
            {/* On laisse + Groupe ici, tu ne m'as pas demandé de le déplacer */}
            <SubtleButton onClick={askAddGroup}>+ Groupe</SubtleButton>
            <SubtleButton onClick={fullReload}>Rafraîchir</SubtleButton>
          </div>
        </div>
      </header>

      <div className="pageBg">
        <div className="pageContent">
          {/* Nom de compte en gros */}
          <div className="accountTitleBig" style={{fontSize:"2rem", fontWeight:600, margin:"0 0 1rem 0"}}>
            {displayAccount}
          </div>

          {/* Groupes */}
          <div className="groupsSection">
            <div className="sectionTitleRow">
              <div className="sectionTitle">Groupes</div>
              <div className="sectionSub">Contrôler plusieurs machines en même temps</div>
            </div>
            {!groupsData.length ? (
              <div className="noGroupsNote smallText">Aucun groupe pour l’instant</div>
            ):(
              <div className="groupListWrap">
                {groupsData.map((g)=>(
                  <GroupCard
                    key={g.id}
                    group={g}
                    onOpenSettings={(id)=>openGroupSettingsModal(id)}
                    onOpenOnList={(id)=>openGroupOnListModal(id)}
                    onGroupCmd={(id,act)=>sendGroupCmd(id,act)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Masters */}
          <div className="mastersSection">
            <div className="sectionTitleRow" style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
              <div>
                <div className="sectionTitle">Masters</div>
                <div className="sectionSub">Chaque master pilote ses slaves</div>
              </div>
              {/* + MASTER déplacé dans la section Masters */}
              <SubtleButton onClick={askAddMaster}>+ MASTER</SubtleButton>
            </div>

            {!devices.length ? (
              <div className="noGroupsNote smallText">Aucun master</div>
            ):(
              devices.map((dev)=>(
                <MasterCard key={dev.id}
                  device={dev}
                  slaves={nodesByMaster[dev.id]||[]}
                  onOpenSettings={openMasterSettings}     // NEW
                  onMore={masterMore}                      // NEW
                  onMasterRename={renameMaster}
                  onMasterDelete={deleteMaster}
                  onSendMasterCmd={sendCmd}
                  openSlaveInfoFor={openSlaveInfo}
                  onSlaveIO={(mid,mac)=>sendCmd(mid,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1})}
                  onSlaveReset={(mid,mac)=>sendCmd(mid,mac,"SLV_RESET",{})}
                  onSlaveMore={(mid,mac)=>{
                    const act=window.prompt("Action ?\n1 = HARD OFF\n2 = HARD RESET","1");
                    if(act==="1") sendCmd(mid,mac,"SLV_FORCE_OFF",{});
                    else if(act==="2") sendCmd(mid,mac,"SLV_HARD_RESET",{ms:3000});
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

      {/* Modales */}
      <SlaveInfoModal
        open={slaveInfoOpen.open}
        onClose={closeSlaveInfo}
        slaveMac={slaveInfoOpen.mac}
        masterId={slaveInfoOpen.masterId}
        currentName={currentSlaveInfo?.friendly_name || slaveInfoOpen.mac}
        pcOn={!!currentSlaveInfo?.pc_on}
        onRename={(newName)=>{ doRenameSlave(slaveInfoOpen.masterId,slaveInfoOpen.mac,newName); closeSlaveInfo(); }}
      />
      <GroupOnListModal
        open={groupOnListOpen.open}
        onClose={closeGroupOnListModal}
        members={currentGroupForOnList?.members || []}
      />
      <GroupMembersModal
        open={groupMembersOpen.open}
        onClose={closeGroupMembersModal}
        groupName={(groupsData.find((g)=>g.id===groupMembersOpen.groupId)?.name)||""}
        allSlaves={allSlavesFlat}
        checkedMap={editMembersChecked}
        onToggleMac={toggleCheckMac}
        onSave={saveGroupMembers}
      />
      <GroupSettingsModal
        open={groupSettingsOpen.open}
        onClose={closeGroupSettingsModal}
        group={settingsGroupObj}
        onRenameGroup={renameGroup}
        onOpenMembersEdit={(gid)=>openGroupMembersModal(gid)}
        onDeleteGroup={deleteGroup}
      />

      {/* NEW: Réglages Master */}
      <MasterSettingsModal
        open={masterSettingsOpen.open}
        onClose={closeMasterSettings}
        device={settingsMasterObj}
        onRename={renameMaster}
        onDelete={deleteMaster}
      />

      {/* NEW: Réglages du Compte */}
      <AccountSettingsModal
        open={accountSettingsOpen}
        onClose={closeAccountSettings}
        initialName={displayAccount}
        onSave={saveAccountName}
      />
    </>
  );
}
