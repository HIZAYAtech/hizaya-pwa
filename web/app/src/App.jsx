import { useEffect, useRef, useState, useMemo } from "react";
import { sb, stripOAuthParams } from "./supabaseClient";

/* ====== Const ======--- */
const LIVE_TTL_MS = 8000;
const DEFAULT_IO_PIN = 26;

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

/* --- Modale “Réglages du master” --- */
function MasterSettingsModal({ open, onClose, device, onPulse, onRename, onDelete }) {
  if (!open || !device) return null;
  return (
    <ModalShell open={open} onClose={onClose} title={`Réglages — ${device.name || device.id}`}>
      <div className="modalSection">
        <div className="modalInfoRow"><span className="modalInfoKey">ID :</span><span className="modalInfoVal">{device.id}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">MAC :</span><span className="modalInfoVal">{device.master_mac || "—"}</span></div>
        <div className="modalInfoRow"><span className="modalInfoKey">Dernier contact :</span><span className="modalInfoVal">{device.last_seen ? fmtTS(device.last_seen) : "jamais"}</span></div>
      </div>
      <div className="modalSection">
        <SubtleButton onClick={() => onRename(device.id)}>Renommer</SubtleButton>
        <SubtleButton onClick={() => onPulse(device.id)}>Pulse 500ms</SubtleButton>
        <SubtleButton onClick={() => onDelete(device.id)} style={{background:"rgba(255,0,0,0.08)", borderColor:"rgba(255,0,0,0.25)"}}>
          Supprimer
        </SubtleButton>
      </div>
    </ModalShell>
  );
}

/* --- Modale “Actions avancées” (Hard OFF / Hard RESET) réutilisable --- */
function HardActionsModal({ open, onClose, title, onHardOff, onHardReset }) {
  if (!open) return null;
  return (
    <ModalShell open={open} onClose={onClose} title={title || "Actions avancées"}>
      <div className="modalSection" style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <SubtleButton onClick={()=>{ onHardOff?.(); onClose(); }} style={{background:"rgba(255,0,0,0.08)", borderColor:"rgba(255,0,0,0.25)"}}>Hard OFF</SubtleButton>
        <SubtleButton onClick={()=>{ onHardReset?.(); onClose(); }} style={{background:"rgba(255,165,0,0.08)", borderColor:"rgba(255,165,0,0.25)"}}>Hard RESET</SubtleButton>
      </div>
    </ModalShell>
  );
}

/* --- Modale “Réglages du compte” --- */
function AccountSettingsModal({ open, onClose, accountName, onRename }) {
  const [draft, setDraft] = useState(accountName || "");
  useEffect(()=>{ setDraft(accountName || ""); }, [accountName, open]);
  if (!open) return null;
  return (
    <ModalShell open={open} onClose={onClose} title="Réglages du compte">
      <div className="modalSection">
        <label className="modalLabel">Nom du compte</label>
        <input className="modalInput" value={draft} onChange={(e)=>setDraft(e.target.value)} placeholder="Nom de compte…" />
        <div style={{textAlign:"right", marginTop:8}}>
          <SubtleButton onClick={()=>{ onRename(draft); onClose(); }}>Enregistrer</SubtleButton>
        </div>
      </div>
    </ModalShell>
  );
}

/* --- Carte Slave --- */
function SlaveCard({masterId,mac,friendlyName,pcOn,onInfoClick,onIO,onReset,onOpenMore,actionBarPhase}){
  return(
    <div className="slaveCard">
      <div className="infoChip" onClick={onInfoClick} title="Infos / renommer">i</div>
      <div className="slaveNameMain">{friendlyName||mac}</div>
      <div className="slaveSub">{pcOn?"Ordinateur allumé":"Ordinateur éteint"}</div>
      <ActionBar phase={actionBarPhase}/>
      <div className="slaveBtnsRow">
        <CircleBtn onClick={onIO}>⏻</CircleBtn>
        <CircleBtn onClick={onReset}>↺</CircleBtn>
        <CircleBtn extraClass="moreBtn" onClick={onOpenMore}>⋯</CircleBtn>
      </div>
    </div>
  );
}

/* --- Carte Master --- */
function MasterCard({device,slaves,onOpenMasterSettings,openSlaveInfoFor,onSlaveIO,onSlaveReset,onOpenSlaveMore,slavePhases}){
  const live=isLiveDevice(device);
  return(
    <section className="masterCard">
      <div className="masterTopRow">
        <div className="masterTitleLeft">
          <div className="masterNameLine">
            <span className="masterCardTitle">{device.name||device.id}</span>
            <span className={"onlineBadge "+(live?"onlineYes":"onlineNo")}>{live?"EN LIGNE":"HORS LIGNE"}</span>
          </div>
          {/* Infos ID/MAC/Dernier contact retirées de la carte -> visibles seulement via “Réglages” */}
        </div>
        <div className="masterActionsRow">
          <SubtleButton onClick={()=>onOpenMasterSettings(device)}>Réglages</SubtleButton>
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
              onOpenMore={()=>onOpenSlaveMore(device.id, sl.mac, sl.friendly_name || sl.mac)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- Carte Groupe --- */
function GroupCard({ group, onOpenSettings, onOpenOnList, onOpenMore, onGroupCmd }){
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

      {/* Commandes principales (même visuel que slaves) */}
      <div className="slaveBtnsRow" style={{ marginTop: 8 }}>
        <CircleBtn onClick={() => onGroupCmd(id, "SLV_IO_ON")}>ON</CircleBtn>
        <CircleBtn onClick={() => onGroupCmd(id, "RESET")}>↺</CircleBtn>
        <CircleBtn onClick={() => onGroupCmd(id, "SLV_IO_OFF")}>OFF</CircleBtn>
        {/* Hard actions via “…” */}
        <CircleBtn extraClass="moreBtn" onClick={()=>onOpenMore(id, name)}>⋯</CircleBtn>
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

  // Modales Réglages / Actions avancées
  const [groupSettingsOpen, setGroupSettingsOpen] = useState({ open:false, groupId:"" });
  const [masterSettingsOpen, setMasterSettingsOpen] = useState({ open:false, device:null });
  const [slaveMoreOpen, setSlaveMoreOpen] = useState({ open:false, masterId:"", mac:"", label:"" });
  const [groupMoreOpen, setGroupMoreOpen] = useState({ open:false, groupId:"", label:"" });

  // Réglages de compte
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  // Realtime channels
  const chDevices=useRef(null); const chNodes=useRef(null); const chCmds=useRef(null); const chGroups=useRef(null); const chProfile=useRef(null);

  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current) sb.removeChannel(chNodes.current);
    if(chCmds.current) sb.removeChannel(chCmds.current);
    if(chGroups.current) sb.removeChannel(chGroups.current);
    if(chProfile.current) sb.removeChannel(chProfile.current);
    chDevices.current = chNodes.current = chCmds.current = chGroups.current = chProfile.current = null;
    realtimeAttached=false;
  }
  function attachRealtime(uid){
    if(realtimeAttached) return;
    cleanupRealtime();

    chDevices.current = sb.channel("rt:devices")
      .on("postgres_changes",{event:"*",schema:"public",table:"devices"},()=>{ addLog("[RT] devices changed"); refetchDevicesOnly(); })
      .subscribe();

    chNodes.current = sb.channel("rt:nodes")
      .on("postgres_changes",{event:"*",schema:"public",table:"nodes"},()=>{ addLog("[RT] nodes changed"); refetchNodesOnly(); refetchGroupsOnly(); })
      .subscribe();

    chCmds.current = sb.channel("rt:commands")
      .on("postgres_changes",{event:"*",schema:"public",table:"commands"},(payload)=>{
        const row=payload.new;
        if(row && row.target_mac && row.status==="acked"){
          setSlavePhases((o)=>({...o,[row.target_mac]:"acked"}));
          setTimeout(()=>setSlavePhases((o)=>({...o,[row.target_mac]:"idle"})),2000);
        }
        if(row?.status==="acked"){ addLog(`[SUCCESS] ${row?.action} → ${row?.master_id}${row?.target_mac?" ▶ "+row?.target_mac:""}`); }
        else { addLog(`[cmd ${payload.eventType}] ${row?.action} (${row?.status}) → ${row?.master_id}`); }
      })
      .subscribe();

    chGroups.current = sb.channel("rt:groups+members")
      .on("postgres_changes",{event:"*",schema:"public",table:"groups"},()=>{ addLog("[RT] groups changed"); refetchGroupsOnly(); })
      .on("postgres_changes",{event:"*",schema:"public",table:"group_members"},()=>{ addLog("[RT] group_members changed"); refetchGroupsOnly(); })
      .subscribe();

    if (uid) {
      chProfile.current = sb.channel("rt:profiles:"+uid)
        .on("postgres_changes",{event:"UPDATE", schema:"public", table:"profiles", filter:`id=eq.${uid}`}, (payload)=>{
          const n = payload.new;
          if (n?.account_name) setAccountName(n.account_name);
        })
        .subscribe();
    }

    realtimeAttached=true;
  }

  // ---- Profiles: load/save ----
  async function loadAccountName(uid, email){
    if(!uid) { setAccountName(email||""); return; }
    const { data, error } = await sb.from("profiles").select("account_name").eq("id", uid).single();
    if (!error && data?.account_name) {
      setAccountName(data.account_name);
    } else {
      const fallback = email ? String(email).split("@")[0] : "";
      setAccountName(fallback);
    }
  }

  async function saveAccountName(newName){
    if(!user) return;
    const trimmed = (newName||"").trim();
    if(!trimmed) return;
    setAccountName(trimmed); // Optimistic UI
    const { error } = await sb.from("profiles").update({ account_name: trimmed, updated_at: new Date().toISOString() }).eq("id", user.id);
    if(error){
      addLog("Err save account_name: " + error.message);
      await loadAccountName(user.id, user.email);
      window.alert("Erreur enregistrement du nom de compte.");
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
        await loadAccountName(sess.user.id, sess.user.email);
        setAuthReady(true);
        await fullReload();
        attachRealtime(sess.user.id);
      }else{
        setUser(null);
        setAccountName("");
        setAuthReady(true);
      }
    }

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session)=>{
      if(event==="SIGNED_IN"){
        stripOAuthParams();
        setUser(session?.user||null);
        await loadAccountName(session?.user?.id, session?.user?.email);
        await fullReload();
        attachRealtime(session?.user?.id);
      }else if(event==="SIGNED_OUT"){
        setUser(null);
        setAccountName("");
        setDevices([]); setNodesByMaster({}); setGroupsData([]); setSlavePhases({});
        cleanupRealtime();
      }else if(event==="TOKEN_REFRESHED"||event==="USER_UPDATED"){
        setUser(session?.user||null);
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
  async function refetchNodesOnly(){
    const { data: rows, error } = await sb.from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if(error){ addLog("Err nodes: "+error.message); return; }
    const map={};
    for(const r of rows||[]){
      if(!map[r.master_id]) map[r.master_id]=[];
      map[r.master_id].push({ mac:r.slave_mac, friendly_name:r.friendly_name, pc_on:r.pc_on });
    }
    setNodesByMaster(map);
  }
  async function refetchGroupsOnly(){
    const { data: gs, error: gErr } = await sb.from("groups").select("id,name");
    if(gErr){ addLog("Err groups: "+gErr.message); return; }
    const { data: membs, error: mErr } = await sb.from("group_members").select("group_id,slave_mac,master_id");
    if(mErr){ addLog("Err group_members: "+mErr.message); return; }
    const { data: allNodes, error: nErr } = await sb.from("nodes").select("master_id,slave_mac,friendly_name,pc_on");
    if(nErr){ addLog("Err nodes in groups: "+nErr.message); return; }

    const membersByGroup={};
    for(const gm of membs||[]){
      if(!membersByGroup[gm.group_id]) membersByGroup[gm.group_id]=[];
      const nodeInfo=(allNodes||[]).find((nd)=>nd.slave_mac===gm.slave_mac);
      membersByGroup[gm.group_id].push({
        mac:gm.slave_mac,
        master_id: nodeInfo?.master_id || gm.master_id || null,
        friendly_name: nodeInfo?.friendly_name || gm.slave_mac,
        pc_on: !!nodeInfo?.pc_on
      });
    }
    const final=(gs||[]).map((g)=>{
      const mems=membersByGroup[g.id]||[];
      const onCount=mems.filter((x)=>x.pc_on).length;
      return { id:g.id, name:g.name, statsOn:onCount, statsTotal:mems.length, members:mems };
    });
    setGroupsData(final);
  }
  async function fullReload(){ await Promise.all([refetchDevicesOnly(),refetchNodesOnly(),refetchGroupsOnly()]); }

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
    else { addLog(`Slave ${mac} renommé en ${newName}`); await refetchNodesOnly(); await refetchGroupsOnly(); }
  }
  async function sendCmd(masterId,targetMac,action,payload={}){
    if(targetMac) setSlavePhases((o)=>({...o,[targetMac]:"queue"}));
    const { error } = await sb.from("commands").insert({ master_id:masterId, target_mac:targetMac||null, action, payload });
    if(error){ addLog("cmd err: "+error.message); if(targetMac) setSlavePhases((o)=>({...o,[targetMac]:"idle"})); }
    else { addLog(`[cmd] ${action} → ${masterId}${targetMac?" ▶ "+targetMac:""}`); if(targetMac) setSlavePhases((o)=>({...o,[targetMac]:"send"})); }
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
  async function renameGroup(id){
    const newName=window.prompt("Nouveau nom du groupe ?",""); if(!newName) return;
    const { error } = await sb.from("groups").update({name:newName}).eq("id",id);
    if(error) window.alert("Erreur rename group: "+error.message);
    else { addLog(`Groupe ${id} renommé en ${newName}`); await refetchGroupsOnly(); }
  }
  async function deleteGroup(id){
    if(!window.confirm("Supprimer ce groupe ?")) return;
    const { error: e1 } = await sb.from("group_members").delete().eq("group_id",id);
    if(e1){ window.alert("Erreur suppr membres groupe: "+e1.message); return; }
    const { error: e2 } = await sb.from("groups").delete().eq("id",id);
    if(e2){ window.alert("Erreur suppr groupe: "+e2.message); return; }
    addLog(`Groupe ${id} supprimé`); await refetchGroupsOnly();
  }
  async function askAddMaster(){
    const { data: sessionRes } = await sb.auth.getSession();
    const token=sessionRes?.session?.access_token; if(!token){ window.alert("Non connecté."); return; }
    const r=await fetch(`${sb.supabaseUrl}/functions/v1/create_pair_code`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", apikey: sb.supabaseKey, Authorization:`Bearer ${token}` },
      body:JSON.stringify({ ttl_minutes:10 })
    });
    if(!r.ok){ const txt=await r.text(); window.alert("Erreur pair-code: "+txt); return; }
    const { code, expires_at } = await r.json();
    const end=new Date(expires_at).getTime(); const ttlSec=Math.floor((end-Date.now())/1000);
    window.alert(`Code: ${String(code).padStart(6,"0")} (expire dans ~${ttlSec}s)\nSaisis ce code dans le portail Wi-Fi du MASTER.`);
  }
  async function askAddGroup(){
    const gname=window.prompt("Nom du nouveau groupe ?",""); if(!gname) return;
    const { data: ins, error } = await sb.from("groups").insert({name:gname}).select("id").single();
    if(error){ window.alert("Erreur création groupe: "+error.message); return; }
    addLog(`Groupe créé (${ins?.id||"?"}): ${gname}`); await refetchGroupsOnly();
  }

  function handleLogout(){ sb.auth.signOut(); }
  function handleLogin(){
    stripOAuthParams();
    const returnTo = `${window.location.origin}/hizaya-pwa/`;
    sb.auth.signInWithOAuth({
      provider:"google",
      options:{ redirectTo:returnTo, queryParams:{ prompt:"select_account" } }
    });
  }

  // Modales ouvertes/fermées
  const openSlaveInfo=(masterId,mac)=>setSlaveInfoOpen({open:true,masterId,mac});
  const closeSlaveInfo=()=>setSlaveInfoOpen({open:false,masterId:"",mac:""});
  const openGroupOnListModal=(groupId)=>setGroupOnListOpen({open:true,groupId});
  const closeGroupOnListModal=()=>setGroupOnListOpen({open:false,groupId:""});
  const openGroupMembersModal=(groupId)=>setGroupMembersOpen({open:true,groupId});
  const closeGroupMembersModal=()=>setGroupMembersOpen({open:false,groupId:""});

  function openGroupSettingsModal(groupId){ setGroupSettingsOpen({ open:true, groupId }); }
  function closeGroupSettingsModal(){ setGroupSettingsOpen({ open:false, groupId:"" }); }
  function openMasterSettingsModal(device){ setMasterSettingsOpen({ open:true, device }); }
  function closeMasterSettingsModal(){ setMasterSettingsOpen({ open:false, device:null }); }

  function openSlaveMore(masterId, mac, label){ setSlaveMoreOpen({ open:true, masterId, mac, label }); }
  function closeSlaveMore(){ setSlaveMoreOpen({ open:false, masterId:"", mac:"", label:"" }); }

  function openGroupMore(groupId, label){ setGroupMoreOpen({ open:true, groupId, label }); }
  function closeGroupMore(){ setGroupMoreOpen({ open:false, groupId:"", label:"" }); }

  // Précocher membres groupe
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
    addLog(`Membres groupe ${gid} mis à jour.`); closeGroupMembersModal(); await refetchGroupsOnly();
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

  /* Rendu */
  if(!authReady){ return <div style={{color:"#fff",padding:"2rem"}}>Chargement…</div>; }
  if(!user){ return <LoginScreen onLogin={handleLogin}/>; }

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
            <div className="userMail smallText">{user.email}</div>
            {/* Réglages compte (renommer) + Déconnexion */}
            <SubtleButton onClick={()=>setAccountSettingsOpen(true)}>Réglages</SubtleButton>
            <SubtleButton onClick={handleLogout}>Déconnexion</SubtleButton>
          </div>
        </div>
      </header>

      {/* Nom de compte en gros (sous le bandeau) */}
      <div style={{padding:"16px 24px 0 24px"}}>
        <div style={{fontSize:24, fontWeight:700, lineHeight:1.2}}>
          {accountName || user.email}
        </div>
      </div>

      <div className="pageBg">
        <div className="pageContent">
          {/* Groupes */}
          <div className="groupsSection">
            <div className="sectionTitleRow" style={{alignItems:"center"}}>
              <div>
                <div className="sectionTitle">Groupes</div>
                <div className="sectionSub">Contrôler plusieurs machines en même temps</div>
              </div>
              <div style={{marginLeft:"auto"}}>
                <SubtleButton onClick={askAddGroup}>+ Groupe</SubtleButton>
              </div>
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
                    onOpenMore={(id,label)=>openGroupMore(id,label)}
                    onGroupCmd={(id,act)=>sendGroupCmd(id,act)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Masters */}
          <div className="mastersSection">
            <div className="sectionTitleRow" style={{alignItems:"center"}}>
              <div>
                <div className="sectionTitle">Masters</div>
                <div className="sectionSub">Chaque master pilote ses slaves</div>
              </div>
              <div style={{marginLeft:"auto"}}>
                <SubtleButton onClick={askAddMaster}>+ MASTER</SubtleButton>
              </div>
            </div>
            {!devices.length ? (
              <div className="noGroupsNote smallText">Aucun master</div>
            ):(
              devices.map((dev)=>(
                <MasterCard key={dev.id}
                  device={dev}
                  slaves={nodesByMaster[dev.id]||[]}
                  onOpenMasterSettings={openMasterSettingsModal}
                  openSlaveInfoFor={openSlaveInfo}
                  onSlaveIO={(mid,mac)=>sendCmd(mid,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1})}
                  onSlaveReset={(mid,mac)=>sendCmd(mid,mac,"SLV_RESET",{})}
                  onOpenSlaveMore={(mid,mac,label)=>openSlaveMore(mid,mac,label)}
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
      <MasterSettingsModal
        open={masterSettingsOpen.open}
        onClose={closeMasterSettingsModal}
        device={masterSettingsOpen.device}
        onPulse={(id)=>sendCmd(id,null,"PULSE",{ms:500})}
        onRename={renameMaster}
        onDelete={deleteMaster}
      />
      {/* Hard actions */}
      <HardActionsModal
        open={slaveMoreOpen.open}
        onClose={closeSlaveMore}
        title={`Actions avancées — ${slaveMoreOpen.label || slaveMoreOpen.mac}`}
        onHardOff={()=>sendCmd(slaveMoreOpen.masterId, slaveMoreOpen.mac, "SLV_FORCE_OFF", {})}
        onHardReset={()=>sendCmd(slaveMoreOpen.masterId, slaveMoreOpen.mac, "SLV_HARD_RESET", {ms:3000})}
      />
      <HardActionsModal
        open={groupMoreOpen.open}
        onClose={closeGroupMore}
        title={`Actions avancées — ${groupMoreOpen.label || "Groupe"}`}
        onHardOff={()=>sendGroupCmd(groupMoreOpen.groupId, "SLV_FORCE_OFF")}
        onHardReset={()=>sendGroupCmd(groupMoreOpen.groupId, "SLV_HARD_RESET")}
      />
      {/* Réglages de compte */}
      <AccountSettingsModal
        open={accountSettingsOpen}
        onClose={()=>setAccountSettingsOpen(false)}
        accountName={accountName}
        onRename={saveAccountName}
      />
    </>
  );
}
