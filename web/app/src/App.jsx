import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   CONFIG SUPABASE / ENV
   ========================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const sb = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* =========================================================
   CONSTANTES UI / LOGIQUE
   ========================================================= */
const LIVE_TTL_MS = 8000; // master online TTL
const DEFAULT_IO_PIN = 26;

/* mapping d'état commande -> visu barre noire */
function statusToPhase(status){
  // tu peux affiner ça selon tes valeurs en DB
  // on gère genre: NEW / PENDING / SENT / ACKED / ERR
  if(!status)               return "queued";
  if(status === "NEW")      return "queued";
  if(status === "PENDING")  return "queued";
  if(status === "SENT")     return "sending";
  if(status === "ACKED")    return "acked";
  if(status === "ERR")      return "error";
  return "queued";
}

/* petites fonctions */
const fmtTS  = s => (s ? new Date(s).toLocaleString() : "—");
const isLive = d => d.last_seen && (Date.now() - new Date(d.last_seen)) < LIVE_TTL_MS;

/* petit rond d'état PC allumé/éteint */
function PcDot({ on }){
  const bg = on ? "#10b981" : "#9ca3af";
  return (
    <span style={{
      display:"inline-block",
      width:8,
      height:8,
      borderRadius:"999px",
      background:bg
    }}/>
  );
}

/* =========================================================
   Composant de modale verre plein écran
   - utilisé pour Pair-code, More actions, Édition Groupe, Ajout membre
   ========================================================= */
function ModalGlass({ open, title, children, onClose }){
  if(!open) return null;
  return (
    <div style={{
      position:"fixed",
      inset:0,
      zIndex:9999,
      background:"rgba(0,0,0,0.35)",
      backdropFilter:"blur(4px)",
      WebkitBackdropFilter:"blur(4px)",
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      padding:"16px"
    }}>
      <div style={{
        background:"rgba(255,255,255,0.75)",
        backdropFilter:"blur(16px)",
        WebkitBackdropFilter:"blur(16px)",
        border:"1px solid rgba(0,0,0,0.08)",
        borderRadius:"16px",
        boxShadow:"0 30px 60px rgba(0,0,0,0.18)",
        maxWidth:"360px",
        width:"100%",
        color:"#1a1a1a",
        display:"flex",
        flexDirection:"column",
        gap:"12px",
        padding:"16px"
      }}>
        <div style={{
          display:"flex",
          justifyContent:"space-between",
          alignItems:"flex-start"
        }}>
          <div style={{
            fontSize:14,
            fontWeight:600,
            letterSpacing:"-.03em",
            lineHeight:1.2
          }}>
            {title}
          </div>
          <button
            style={{
              appearance:"none",
              border:0,
              background:"rgba(0,0,0,0.06)",
              borderRadius:"999px",
              padding:"4px 8px",
              fontSize:"12px",
              lineHeight:1.2,
              cursor:"pointer"
            }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <div style={{
          fontSize:12,
          lineHeight:1.4,
          color:"#353535",
          maxHeight:"60vh",
          overflowY:"auto"
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Carte SLAVE
   - ratio vertical
   - nom en gros
   - état PC + barre de statut commandes
   - boutons en bas (IO / RESET / …)
   - bouton (i) pour info + rename
   - bouton … pour Hard OFF / Hard RESET
   ========================================================= */
function SlaveCard({
  masterId,
  slave_mac,
  friendly_name,
  pc_on,
  phase,
  onIO,
  onReset,
  onMore,
  onInfoToggle,
  infoOpen,
  onRenameSubmit
}){
  // progress bar (phase)
  let barWidth = "0%";
  let barOpacity = 0;
  if(phase && phase!=="idle"){
    barOpacity = 1;
    if(phase==="acked") barWidth="100%";
    else if(phase==="sending") barWidth="60%";
    else if(phase==="queued") barWidth="30%";
    else if(phase==="error") barWidth="100%";
    else barWidth="50%";
  }

  return (
    <div className="slaveCardFrame">
      {/* barre noire en haut (état commande) */}
      <div className="cmdPhaseBarOuter" style={{opacity:barOpacity}}>
        <div className="cmdPhaseBarInner" style={{width:barWidth}}/>
      </div>

      {/* header avec bouton info */}
      <div className="slaveHeaderRow">
        <button className="iconBtnInfo" onClick={onInfoToggle}>i</button>
      </div>

      {/* nom du slave en GROS */}
      <div className="slaveNameBlock">
        <div className="slaveNameText">
          {friendly_name || slave_mac}
        </div>
        <div className="slaveStatusLine">
          <PcDot on={!!pc_on} />
          <span style={{marginLeft:6,fontSize:12,color:"rgba(0,0,0,0.6)"}}>
            {pc_on ? "Ordinateur allumé" : "Ordinateur éteint"}
          </span>
        </div>
      </div>

      {/* zone info cachable */}
      {infoOpen && (
        <div className="slaveInfoBox">
          <div style={{fontSize:12,lineHeight:1.4,color:"rgba(0,0,0,0.7)"}}>
            <div><b>MAC :</b> {slave_mac}</div>
            <div><b>Master :</b> {masterId}</div>
          </div>
          <div style={{marginTop:8}}>
            <button
              className="ghostSmallBtn"
              onClick={()=>{
                const newName = prompt("Nouveau nom du SLAVE ?", friendly_name||"");
                if(newName!=null && newName!==""){
                  onRenameSubmit(newName);
                }
              }}
            >
              Renommer
            </button>
          </div>
        </div>
      )}

      {/* rangée de boutons d'action */}
      <div className="slaveBtnRow">
        <button
          className="roundActionBtn"
          onClick={onIO}
          title="IO / POWER PULSE"
        >
          ⏻
        </button>
        <button
          className="roundActionBtn"
          onClick={onReset}
          title="RESET"
        >
          ↻
        </button>
        <button
          className="roundActionBtn"
          onClick={onMore}
          title="Plus…"
        >
          …
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Carte GROUPE
   - liste des membres
   - bouton +SLAVE → ouvre modale sélection
   - bouton … → ouvre modale édition (renommer/supprimer)
   ========================================================= */
function GroupCard({
  group,
  onAddMember,
  onOpenGroupMenu
}){
  return (
    <section className="panelGlass">
      <div className="panelHead">
        <div className="panelHeadLeft">
          <div className="panelTitle">{group.name || "Groupe"}</div>
        </div>
        <div className="panelHeadRight">
          <button className="ghostSmallBtn" onClick={onAddMember}>+ SLAVE</button>
          <button className="ghostSmallBtn" onClick={onOpenGroupMenu}>…</button>
        </div>
      </div>

      <div className="groupMemberWrap">
        {(!group.members || !group.members.length) && (
          <div className="groupMemberEmpty">Aucun membre</div>
        )}

        {group.members && group.members.map(m=>(
          <div key={`${m.master_id}|${m.slave_mac}`} className="groupMemberChip">
            <PcDot on={!!m.pc_on} />
            <div className="groupMemberLabel">
              {m.alias || m.friendly_name || m.slave_mac}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================================
   Carte MASTER
   - badge En ligne / Hors ligne
   - infos du master
   - actions globales (Pulse / Power ON / etc.)
   - grille de slaves centrée
   ========================================================= */
function MasterCard({
  dev,
  slaves,
  perSlavePhase,
  onRenameMaster,
  onDeleteMaster,
  onSendMasterCmd,
  onSlaveIO,
  onSlaveReset,
  onSlaveMore,
  onSlaveInfoToggle,
  openInfoMap,
  onSlaveRename
}){
  const live = isLive(dev);

  return (
    <section className="panelGlass masterWide">
      <div className="panelHead">
        <div className="panelHeadLeft">
          <div className="panelTitle">{dev.name || dev.id}</div>
          <div className={live? "badgeOnline":"badgeOffline"}>
            {live ? "EN LIGNE":"HORS LIGNE"}
          </div>
        </div>

        <div className="panelHeadRight">
          <button className="ghostSmallBtn" onClick={onRenameMaster}>Renommer</button>
          <button className="ghostSmallBtn danger" onClick={onDeleteMaster}>Supprimer</button>
        </div>
      </div>

      {/* infos du master (condensées) */}
      <div className="masterMetaLine">
        <span>ID&nbsp;: <code>{dev.id}</code></span>
        <span>MAC&nbsp;: <code>{dev.master_mac||"—"}</code></span>
        <span>Dernier contact&nbsp;: {fmtTS(dev.last_seen)||"jamais"}</span>
      </div>

      {/* grille slaves centrée */}
      <div className="slaveGridWrap">
        {(!slaves || !slaves.length) && (
          <div className="emptySlaveTile">
            <div style={{fontSize:24, lineHeight:1}}>＋</div>
            <div style={{fontSize:12,color:"rgba(0,0,0,0.5)"}}>
              Pas encore de SLAVE appairé
            </div>
          </div>
        )}

        {slaves && slaves.map(sl=>(
          <SlaveCard
            key={sl.slave_mac}
            masterId={dev.id}
            slave_mac={sl.slave_mac}
            friendly_name={sl.friendly_name}
            pc_on={!!sl.pc_on}
            phase={perSlavePhase[`${dev.id}|${sl.slave_mac}`] || "idle"}

            onIO={()=>onSlaveIO(dev.id, sl.slave_mac)}
            onReset={()=>onSlaveReset(dev.id, sl.slave_mac)}
            onMore={()=>onSlaveMore(dev.id, sl.slave_mac)}

            infoOpen={!!openInfoMap[`${dev.id}|${sl.slave_mac}`]}
            onInfoToggle={()=>onSlaveInfoToggle(dev.id, sl.slave_mac)}
            onRenameSubmit={(newName)=>onSlaveRename(dev.id, sl.slave_mac, newName)}
          />
        ))}
      </div>

      {/* actions globales du master */}
      <div className="masterActionsLine">
        <button
          className="ghostSmallBtn"
          onClick={()=>onSendMasterCmd(dev.id,"PULSE",{ms:500})}
        >Pulse 500ms</button>

        <button
          className="ghostSmallBtn"
          onClick={()=>onSendMasterCmd(dev.id,"POWER_ON",{})}
        >Power ON</button>

        <button
          className="ghostSmallBtn"
          onClick={()=>onSendMasterCmd(dev.id,"POWER_OFF",{})}
        >Power OFF</button>

        <button
          className="ghostSmallBtn"
          onClick={()=>onSendMasterCmd(dev.id,"RESET",{})}
        >Reset</button>
      </div>
    </section>
  );
}

/* =========================================================
   MAIN APP
   ========================================================= */
export default function App(){

  /* ---------- état auth ---------- */
  const [authReady,setAuthReady] = useState(false);
  const [user,setUser] = useState(null);

  /* ---------- données device/slave ---------- */
  const [devices,setDevices] = useState([]);
  // nodesByMaster = { [master_id]: [{slave_mac,friendly_name,pc_on}, ...] }
  const [nodesByMaster,setNodesByMaster] = useState({});

  /* ---------- groupes ---------- */
  // groups = [ {id, name, members:[{master_id, slave_mac, alias, friendly_name, pc_on}...] } ]
  const [groups,setGroups] = useState([]);

  /* ---------- phases commande par slave ---------- */
  // perSlavePhase["masterId|slave_mac"] = "idle"/"queued"/"sending"/"acked"/"error"
  const [perSlavePhase,setPerSlavePhase] = useState({});

  /* pour afficher/masquer la zone infos du slave (bouton "i") */
  const [openSlaveInfo,setOpenSlaveInfo] = useState({}); // key mid|mac -> bool

  /* ---------- logs UI ---------- */
  const [lines,setLines]=useState([]);
  const logRef=useRef(null);
  function log(t){
    setLines(ls => [...ls, `${new Date().toLocaleTimeString()}  ${t}`]);
  }
  useEffect(()=>{
    if(logRef.current){
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  },[lines]);

  /* ---------- modales ---------- */
  // pair-code
  const [pairModal,setPairModal] = useState({
    open:false,
    code:null,
    expires_at:null
  });

  // moreDialog pour les actions avancées d'UN slave (hard off / hard reset)
  const [moreDialog,setMoreDialog] = useState({
    open:false,
    masterId:null,
    slaveMac:null
  });

  // édition d’un groupe (renommer / supprimer)
  const [groupEditModal,setGroupEditModal] = useState({
    open:false,
    groupId:null
  });

  // ajout de membre dans un groupe
  const [groupAddModal,setGroupAddModal] = useState({
    open:false,
    groupId:null
  });

  /* ---------- refs pour realtime channels ---------- */
  const chDevices=useRef(null);
  const chNodes=useRef(null);
  const chCmds=useRef(null);
  const chGroups=useRef(null);
  const chMembers=useRef(null);

  /* =====================================================
     HELPERS DE MISE A JOUR LOCALES
     ===================================================== */
  function setSlavePhase(mid,mac,phase){
    const k=`${mid}|${mac}`;
    setPerSlavePhase(prev=>({...prev,[k]:phase}));
    // si phase terminale -> clear après un petit délai
    if(phase==="acked" || phase==="error"){
      setTimeout(()=>{
        setPerSlavePhase(p=>{
          if(p[k]===phase){ // encore le même => on remet idle
            const clone={...p};
            clone[k]="idle";
            return clone;
          }
          return p;
        });
      },1500);
    }
  }

  function toggleSlaveInfo(mid,mac){
    const k=`${mid}|${mac}`;
    setOpenSlaveInfo(m=>({...m,[k]:!m[k]}));
  }

  /* =====================================================
     CHARGEMENT INITIAL
     ===================================================== */
  async function loadDevicesAndNodes(){
    if(!sb) return;
    // devices
    const {data:devs,error:ed} = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen")
      .order("created_at",{ascending:false});
    if(ed){
      log("Err devices: "+ed.message);
    }

    // nodes
    const {data:nodes,error:en} = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on");
    if(en){
      log("Err nodes: "+en.message);
    }

    // construit mapping
    const map={};
    (nodes||[]).forEach(n=>{
      if(!map[n.master_id]) map[n.master_id]=[];
      map[n.master_id].push({
        slave_mac: n.slave_mac,
        friendly_name: n.friendly_name||"",
        pc_on: !!n.pc_on
      });
    });

    setDevices(devs||[]);
    setNodesByMaster(map);
  }

  async function reloadGroups(){
    if(!sb) return;
    // on prend tous les groups
    const {data:gs,error:eg} = await sb
      .from("groups")
      .select("id,name")
      .order("created_at",{ascending:true});
    if(eg){
      log("Err groups: "+eg.message);
      return;
    }
    // on prend tous les membres
    const {data:mems,error:em} = await sb
      .from("group_members")
      .select("group_id,master_id,slave_mac,alias");
    if(em){
      log("Err group_members: "+em.message);
      return;
    }

    // pour retrouver pc_on / friendly_name
    // on s'appuie sur nodesByMaster local:
    // nodesByMaster[mid] = [ {slave_mac, friendly_name, pc_on}, ... ]
    const lookup = {};
    Object.keys(nodesByMaster).forEach(mid=>{
      nodesByMaster[mid].forEach(sl=>{
        lookup[`${mid}|${sl.slave_mac}`] = sl;
      });
    });

    // agrège
    const out = (gs||[]).map(g=>{
      const members = (mems||[])
        .filter(m => m.group_id === g.id)
        .map(m=>{
          const key=`${m.master_id}|${m.slave_mac}`;
          const inf=lookup[key] || {};
          return {
            master_id: m.master_id,
            slave_mac: m.slave_mac,
            alias: m.alias||"",
            friendly_name: inf.friendly_name||"",
            pc_on: !!inf.pc_on
          };
        });
      return {
        id:g.id,
        name:g.name||"",
        members
      };
    });

    setGroups(out);
  }

  async function reloadAll(){
    await loadDevicesAndNodes();
    await reloadGroups();
  }

  /* =====================================================
     AUTH SETUP
     ===================================================== */
  useEffect(()=>{
    if(!sb){
      setAuthReady(true);
      setUser(null);
      return;
    }

    let unsubAuth = sb.auth.onAuthStateChange((ev,session)=>{
      setUser(session?.user||null);
    });

    (async ()=>{
      const {data:{session}} = await sb.auth.getSession();
      setUser(session?.user||null);
      setAuthReady(true);
    })();

    return ()=>{
      unsubAuth?.data?.subscription?.unsubscribe?.();
    };
  },[]);

  /* quand authReady + user => on attache realtime + loadAll */
  useEffect(()=>{
    if(!authReady) return;

    if(user){
      attachRealtime();
      reloadAll();
    }else{
      cleanupRealtime();
      setDevices([]);
      setNodesByMaster({});
      setGroups([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authReady,user]);

  /* =====================================================
     REALTIME
     ===================================================== */
  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current)   sb.removeChannel(chNodes.current);
    if(chCmds.current)    sb.removeChannel(chCmds.current);
    if(chGroups.current)  sb.removeChannel(chGroups.current);
    if(chMembers.current) sb.removeChannel(chMembers.current);
    chDevices.current=chNodes.current=chCmds.current=chGroups.current=chMembers.current=null;
  }

  function attachRealtime(){
    if(!sb) return;
    cleanupRealtime();

    // devices
    chDevices.current = sb.channel("rt:devices")
      .on("postgres_changes",
        {event:"INSERT",schema:"public",table:"devices"},
        p => {
          log(`+ device ${p.new.id}`);
          setDevices(ds=>[p.new,...ds]);
        }
      )
      .on("postgres_changes",
        {event:"UPDATE",schema:"public",table:"devices"},
        p => {
          const d=p.new;
          setDevices(ds=>ds.map(x=>x.id===d.id?{...x,...d}:x));
        }
      )
      .on("postgres_changes",
        {event:"DELETE",schema:"public",table:"devices"},
        p => {
          const id=p.old.id;
          log(`- device ${id}`);
          setDevices(ds=>ds.filter(x=>x.id!==id));
        }
      )
      .subscribe();

    // nodes
    chNodes.current = sb.channel("rt:nodes")
      .on("postgres_changes",
        {event:"INSERT",schema:"public",table:"nodes"},
        p => {
          const n=p.new;
          log(`+ node ${n.slave_mac} → ${n.master_id}`);
          setNodesByMaster(prev=>{
            const arr = prev[n.master_id] ? [...prev[n.master_id]] : [];
            // évite doublon
            if(!arr.find(s=>s.slave_mac===n.slave_mac)){
              arr.push({
                slave_mac:n.slave_mac,
                friendly_name:n.friendly_name||"",
                pc_on:!!n.pc_on
              });
            }
            return {...prev,[n.master_id]:arr};
          });
          // rafraîchir groups pc_on / noms
          setTimeout(()=>reloadGroups(),0);
        }
      )
      .on("postgres_changes",
        {event:"UPDATE",schema:"public",table:"nodes"},
        p => {
          const n=p.new;
          setNodesByMaster(prev=>{
            const arr = prev[n.master_id]? [...prev[n.master_id]]:[];
            const idx = arr.findIndex(s=>s.slave_mac===n.slave_mac);
            if(idx>=0){
              arr[idx] = {
                slave_mac:n.slave_mac,
                friendly_name:n.friendly_name||"",
                pc_on:!!n.pc_on
              };
            }
            return {...prev,[n.master_id]:arr};
          });
          setTimeout(()=>reloadGroups(),0);
        }
      )
      .on("postgres_changes",
        {event:"DELETE",schema:"public",table:"nodes"},
        p => {
          const n=p.old;
          log(`- node ${n.slave_mac} ← ${n.master_id}`);
          setNodesByMaster(prev=>{
            const arr = prev[n.master_id]? [...prev[n.master_id]]:[];
            const filt=arr.filter(s=>s.slave_mac!==n.slave_mac);
            return {...prev,[n.master_id]:filt};
          });
          setTimeout(()=>reloadGroups(),0);
        }
      )
      .subscribe();

    // commands => phases
    chCmds.current = sb.channel("rt:commands")
      .on("postgres_changes",
        {event:"INSERT",schema:"public",table:"commands"},
        p => {
          const c=p.new;
          if(c.target_mac){
            const ph=statusToPhase(c.status);
            setSlavePhase(c.master_id,c.target_mac,ph);
          }
          // log visuel
          log(`cmd + ${c.action} (${c.status}) → ${c.master_id}${c.target_mac?" ▶ "+c.target_mac:""}`);
        }
      )
      .on("postgres_changes",
        {event:"UPDATE",schema:"public",table:"commands"},
        p => {
          const c=p.new;
          if(c.target_mac){
            const ph=statusToPhase(c.status);
            setSlavePhase(c.master_id,c.target_mac,ph);
          }
          log(`cmd ~ ${c.action} (${c.status}) → ${c.master_id}${c.target_mac?" ▶ "+c.target_mac:""}`);
        }
      )
      .subscribe();

    // groups
    chGroups.current = sb.channel("rt:groups")
      .on("postgres_changes",
        {event:"INSERT",schema:"public",table:"groups"},
        p => {
          log(`+ group ${p.new.id}`);
          reloadGroups();
        }
      )
      .on("postgres_changes",
        {event:"UPDATE",schema:"public",table:"groups"},
        p => {
          log(`~ group ${p.new.id}`);
          reloadGroups();
        }
      )
      .on("postgres_changes",
        {event:"DELETE",schema:"public",table:"groups"},
        p => {
          log(`- group ${p.old.id}`);
          reloadGroups();
        }
      )
      .subscribe();

    // group_members
    chMembers.current = sb.channel("rt:group_members")
      .on("postgres_changes",
        {event:"INSERT",schema:"public",table:"group_members"},
        ()=>reloadGroups()
      )
      .on("postgres_changes",
        {event:"DELETE",schema:"public",table:"group_members"},
        ()=>reloadGroups()
      )
      .subscribe();
  }

  /* =====================================================
     ACTIONS UTILISATEUR
     ===================================================== */

  // Connexion / Déconnexion
  async function doLogin(){
    if(!sb) return;
    const {data,error} = await sb.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo: location.href,
        queryParams:{prompt:"select_account"},
        skipBrowserRedirect: false
      }
    });
    if(error){
      alert(error.message);
    } else if(data?.url){
      // redirection gérée par supabase (skipBrowserRedirect=false)
    }
  }
  function doLogout(){
    if(!sb) return;
    sb.auth.signOut();
  }

  // Renommer master
  async function renameMaster(id){
    const name=prompt("Nouveau nom du master ?","");
    if(!name) return;
    const {error}=await sb.from("devices").update({name}).eq("id",id);
    if(error){
      alert(error.message);
    }else{
      log(`Master renommé ${id} → ${name}`);
    }
  }

  // Supprimer master (edge function release_and_delete)
  async function deleteMaster(id){
    if(!confirm(`Supprimer ${id} ?`)) return;
    const {data:{session}} = await sb.auth.getSession();
    if(!session){ alert("Non connecté"); return; }

    const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${session.access_token}`
      },
      body:JSON.stringify({ master_id:id })
    });
    if(!r.ok){
      log("❌ Suppression : "+ await r.text());
    }else{
      log("MASTER supprimé : "+id);
    }
  }

  // envoyer commande vers master (local) ou vers slave
  async function sendCmd(masterId, targetMac, action, payload={}){
    if(targetMac){
      setSlavePhase(masterId,targetMac,"sending");
    }
    const {error} = await sb.from("commands").insert({
      master_id: masterId,
      target_mac: targetMac || null,
      action,
      payload
    });
    if(error){
      log("cmd err: "+error.message);
      if(targetMac) setSlavePhase(masterId,targetMac,"error");
    }else{
      log(`[cmd] ${action} → ${masterId}${targetMac?" ▶ "+targetMac:""}`);
      if(targetMac) setSlavePhase(masterId,targetMac,"queued");
    }
  }

  // wrapper pour IO (pulse power), RESET etc. pour un slave
  function handleSlaveIO(mid,mac){
    sendCmd(mid,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1});
  }
  function handleSlaveReset(mid,mac){
    sendCmd(mid,mac,"SLV_RESET",{});
  }
  function handleSlaveMore(mid,mac){
    setMoreDialog({open:true,masterId:mid,slaveMac:mac});
  }

  // Hard OFF / Hard RESET via la modale moreDialog
  function hardOffCurrentSlave(){
    const {masterId,slaveMac} = moreDialog;
    if(!masterId||!slaveMac) return;
    sendCmd(masterId,slaveMac,"SLV_FORCE_OFF",{});
    setMoreDialog({open:false,masterId:null,slaveMac:null});
  }
  function hardResetCurrentSlave(){
    const {masterId,slaveMac} = moreDialog;
    if(!masterId||!slaveMac) return;
    sendCmd(masterId,slaveMac,"SLV_HARD_RESET",{ms:3000});
    setMoreDialog({open:false,masterId:null,slaveMac:null});
  }

  // toggle info d'un slave
  function toggleInfo(mid,mac){
    toggleSlaveInfo(mid,mac);
  }

  // rename slave depuis info
  async function renameSlave(mid,mac,newName){
    const {error} = await sb
      .from("nodes")
      .update({friendly_name:newName})
      .eq("master_id",mid)
      .eq("slave_mac",mac);
    if(error){
      alert("Erreur rename slave: "+error.message);
    }else{
      log(`Slave ${mac} renommé → ${newName}`);
    }
  }

  // Pair-code (ajout MASTER)
  async function openPairDialog(){
    const {data:{session}} = await sb.auth.getSession();
    if(!session){ alert("Non connecté"); return; }
    try{
      const r=await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${session.access_token}`
        },
        body:JSON.stringify({ ttl_minutes:10 })
      });
      if(!r.ok){
        alert(await r.text());
        return;
      }
      const {code,expires_at} = await r.json();
      setPairModal({open:true,code,expires_at});
      log(`Pair-code ${code}`);
    }catch(e){
      log("Erreur pair-code: "+e);
    }
  }

  // Groupes: création, rename, delete, addMember
  async function createGroup(){
    const nm = prompt("Nom du groupe ?","Nouveau groupe");
    if(!nm) return;
    const {error} = await sb.from("groups").insert({name:nm});
    if(error){
      alert("Erreur création groupe: "+error.message);
    }else{
      log("Groupe créé: "+nm);
    }
  }

  async function renameGroup(gid){
    const nm = prompt("Nouveau nom du groupe ?","");
    if(!nm) return;
    const {error} = await sb.from("groups").update({name:nm}).eq("id",gid);
    if(error){
      alert("Erreur rename groupe: "+error.message);
    }else{
      log("Groupe renommé: "+nm);
      reloadGroups();
    }
  }

  async function deleteGroup(gid){
    if(!confirm("Supprimer ce groupe ?")) return;
    // on efface d'abord les membres
    await sb.from("group_members").delete().eq("group_id",gid);
    const {error} = await sb.from("groups").delete().eq("id",gid);
    if(error){
      alert("Erreur suppression groupe: "+error.message);
    }else{
      log("Groupe supprimé: "+gid);
      reloadGroups();
    }
  }

  async function addMemberToGroup(gid, member){
    const {error} = await sb.from("group_members").insert({
      group_id: gid,
      master_id: member.master_id,
      slave_mac: member.slave_mac,
      alias: member.alias || member.friendly_name || member.slave_mac
    });
    if(error){
      alert("Erreur add member: "+error.message);
    }else{
      log(`Ajouté ${member.slave_mac} dans groupe ${gid}`);
      reloadGroups();
    }
  }

  /* liste "flat" de tous les slaves pour la modale d'ajout */
  const allSlavesFlat = useMemo(()=>{
    const arr=[];
    for(const mid of Object.keys(nodesByMaster)){
      (nodesByMaster[mid]||[]).forEach(sl=>{
        arr.push({
          master_id: mid,
          slave_mac: sl.slave_mac,
          friendly_name: sl.friendly_name||"",
          pc_on: !!sl.pc_on
        });
      });
    }
    return arr;
  },[nodesByMaster]);

  /* =====================================================
     RENDU UI
     ===================================================== */

  // style global
  const globalStyles = `
  /* RESET DE BASE */
  *{box-sizing:border-box;}
  html,body,#root{margin:0;padding:0;height:100%;}
  body{
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
                 Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #eceff4;
    color:#1a1a1a;
  }

  /* fond image plein écran */
  .pageBg {
    position:fixed;
    inset:0;
    background:
      radial-gradient(circle at 20% 20%,rgba(255,255,255,0.6) 0%,rgba(255,255,255,0) 60%),
      radial-gradient(circle at 80% 30%,rgba(255,255,255,0.4) 0%,rgba(255,255,255,0) 70%),
      url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60");
    background-size:cover;
    background-position:center;
    filter:blur(30px) brightness(1.1);
    z-index:0;
  }

  /* barre top sticky */
  .topbar{
    position:sticky;
    top:0;
    width:100%;
    z-index:10;
    background:rgba(255,255,255,0.55);
    -webkit-backdrop-filter:blur(16px);
    backdrop-filter:blur(16px);
    border-bottom:1px solid rgba(0,0,0,0.07);
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:12px 16px;
  }
  .brandTitle{
    font-size:14px;
    font-weight:600;
    letter-spacing:-.03em;
    color:#000;
  }
  .authBox{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    align-items:center;
    font-size:12px;
    color:rgba(0,0,0,0.6);
  }
  .ghostSmallBtn{
    appearance:none;
    cursor:pointer;
    background:rgba(0,0,0,0.05);
    border:0;
    border-radius:999px;
    padding:6px 10px;
    font-size:12px;
    line-height:1.2;
    color:#1a1a1a;
  }
  .ghostSmallBtn.danger{
    color:#991b1b;
    background:rgba(153,27,27,0.08);
  }

  /* wrapper du contenu scrollable */
  .mainWrap{
    position:relative;
    z-index:1;
    padding:16px;
    min-height:calc(100% - 48px);
    display:flex;
    flex-direction:column;
    gap:24px;
  }

  /* panneau "glass" réutilisable (master / group) */
  .panelGlass{
    background:rgba(255,255,255,0.55);
    -webkit-backdrop-filter:blur(16px);
    backdrop-filter:blur(16px);
    border:1px solid rgba(0,0,0,0.07);
    border-radius:20px;
    box-shadow:0 30px 60px rgba(0,0,0,0.18);
    padding:16px;
    display:flex;
    flex-direction:column;
    gap:16px;
    color:#1a1a1a;
    max-width:1280px;
    width:100%;
    margin:0 auto;
  }

  /* version un peu plus large pour master */
  .masterWide{
    width:100%;
  }

  .panelHead{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    flex-wrap:wrap;
    gap:12px;
  }
  .panelHeadLeft{
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    gap:8px;
  }
  .panelTitle{
    font-size:14px;
    font-weight:600;
    letter-spacing:-.03em;
    color:#000;
    line-height:1.2;
  }
  .badgeOnline{
    background:rgba(16,185,129,0.15);
    color:#065f46;
    border-radius:999px;
    padding:3px 8px;
    font-size:11px;
    line-height:1.2;
    font-weight:500;
  }
  .badgeOffline{
    background:rgba(239,68,68,0.15);
    color:#7f1d1d;
    border-radius:999px;
    padding:3px 8px;
    font-size:11px;
    line-height:1.2;
    font-weight:500;
  }
  .panelHeadRight{
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
  }

  /* meta master (ligne ID/MAC/last seen) */
  .masterMetaLine{
    font-size:11px;
    line-height:1.4;
    color:rgba(0,0,0,0.6);
    display:flex;
    flex-wrap:wrap;
    gap:12px;
  }
  code{
    background:rgba(0,0,0,0.05);
    border-radius:4px;
    padding:0 4px;
    font-size:11px;
  }

  /* grille des slaves, centrée, wrap */
  .slaveGridWrap{
    display:flex;
    flex-wrap:wrap;
    justify-content:center;
    gap:16px;
  }

  .emptySlaveTile{
    background:rgba(255,255,255,0.4);
    border:1px dashed rgba(0,0,0,0.2);
    border-radius:16px;
    width:140px;
    min-height:180px;
    max-width:180px;
    min-width:120px;
    padding:16px;
    text-align:center;
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    color:#1a1a1a;
  }

  /* carte slave verticale */
  .slaveCardFrame{
    position:relative;
    background:rgba(255,255,255,0.8);
    -webkit-backdrop-filter:blur(16px);
    backdrop-filter:blur(16px);
    border:1px solid rgba(0,0,0,0.05);
    border-radius:16px;
    box-shadow:0 20px 40px rgba(0,0,0,0.15);
    width:140px;
    min-height:200px;
    max-width:180px;
    min-width:120px;
    padding:12px;
    color:#1a1a1a;
    display:flex;
    flex-direction:column;
    justify-content:flex-start;
    align-items:center;
    gap:12px;
  }

  /* barre noire top pour l'état de commande */
  .cmdPhaseBarOuter{
    position:absolute;
    top:0; left:0; right:0;
    height:3px;
    background:transparent;
    overflow:hidden;
    border-top-left-radius:16px;
    border-top-right-radius:16px;
    transition:opacity .15s linear;
  }
  .cmdPhaseBarInner{
    background:#000;
    height:100%;
    transition:width .15s linear;
  }

  .slaveHeaderRow{
    width:100%;
    display:flex;
    justify-content:flex-end;
  }
  .iconBtnInfo{
    appearance:none;
    background:rgba(0,0,0,0.05);
    border:0;
    border-radius:999px;
    font-size:11px;
    line-height:1;
    width:20px;
    height:20px;
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    color:#1a1a1a;
  }

  .slaveNameBlock{
    text-align:center;
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:6px;
    width:100%;
  }
  .slaveNameText{
    font-size:14px;
    font-weight:600;
    letter-spacing:-.03em;
    color:#000;
    line-height:1.2;
    word-break:break-word;
    text-align:center;
  }
  .slaveStatusLine{
    display:flex;
    align-items:center;
    justify-content:center;
  }

  .slaveInfoBox{
    width:100%;
    font-size:11px;
    line-height:1.4;
    color:#1a1a1a;
    background:rgba(255,255,255,0.6);
    border:1px solid rgba(0,0,0,0.08);
    border-radius:12px;
    padding:8px;
    text-align:left;
  }

  .slaveBtnRow{
    margin-top:auto;
    display:flex;
    justify-content:center;
    gap:8px;
    flex-wrap:wrap;
    width:100%;
  }
  .roundActionBtn{
    appearance:none;
    border:0;
    cursor:pointer;
    background:rgba(0,0,0,0.07);
    color:#000;
    width:32px;
    height:32px;
    border-radius:999px;
    font-size:13px;
    line-height:1;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:background .15s;
  }
  .roundActionBtn:hover{
    background:rgba(0,0,0,0.12);
  }
  .roundActionBtn:active{
    background:rgba(0,0,0,0.2);
  }

  /* actions globales master */
  .masterActionsLine{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
  }

  /* groupes */
  .groupMemberWrap{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
  }
  .groupMemberChip{
    display:flex;
    align-items:center;
    gap:6px;
    background:rgba(0,0,0,0.05);
    border-radius:999px;
    padding:4px 8px;
    font-size:12px;
    line-height:1.2;
  }
  .groupMemberLabel{
    color:#000;
  }
  .groupMemberEmpty{
    font-size:12px;
    color:rgba(0,0,0,0.4);
  }

  /* bloc Journal */
  .logBlock{
    background:rgba(255,255,255,0.55);
    -webkit-backdrop-filter:blur(16px);
    backdrop-filter:blur(16px);
    border:1px solid rgba(0,0,0,0.07);
    border-radius:20px;
    box-shadow:0 30px 60px rgba(0,0,0,0.18);
    max-width:1280px;
    margin:0 auto;
    width:100%;
    padding:16px;
    color:#1a1a1a;
    display:flex;
    flex-direction:column;
    gap:8px;
  }
  .logTitle{
    font-size:13px;
    font-weight:600;
    letter-spacing:-.03em;
    color:#000;
  }
  .logArea{
    background:rgba(255,255,255,0.6);
    border:1px solid rgba(0,0,0,0.07);
    border-radius:12px;
    font-size:11px;
    line-height:1.4;
    color:#000;
    height:140px;
    padding:8px;
    overflow:auto;
    white-space:pre-wrap;
    word-break:break-word;
  }

  @media(min-width:768px){
    .panelTitle{ font-size:15px; }
    .slaveNameText{ font-size:16px; }
    .brandTitle{ font-size:14px; }
  }
  `;

  /* rendu header connexion */
  function renderAuthBox(){
    if(!authReady){
      return (
        <div className="authBox">
          <span>…</span>
        </div>
      );
    }
    if(!user){
      return (
        <div className="authBox">
          <span>non connecté</span>
          <button className="ghostSmallBtn" onClick={doLogin}>
            Connexion Google
          </button>
        </div>
      );
    }
    return (
      <div className="authBox">
        <span>{user.email}</span>
        <button className="ghostSmallBtn" onClick={doLogout}>
          Déconnexion
        </button>
      </div>
    );
  }

  /* rendu groupes */
  function renderGroups(){
    if(!groups.length){
      return (
        <section className="panelGlass">
          <div className="panelHead">
            <div className="panelHeadLeft">
              <div className="panelTitle">Groupes</div>
            </div>
            <div className="panelHeadRight">
              <button className="ghostSmallBtn" onClick={createGroup}>+ Groupe</button>
            </div>
          </div>

          <div style={{fontSize:12,color:"rgba(0,0,0,0.5)"}}>
            Aucun groupe.
          </div>
        </section>
      );
    }
    return (
      <>
        {groups.map(g=>(
          <GroupCard
            key={g.id}
            group={g}
            onAddMember={()=>{
              setGroupAddModal({open:true,groupId:g.id});
            }}
            onOpenGroupMenu={()=>{
              setGroupEditModal({open:true,groupId:g.id});
            }}
          />
        ))}

        {/* carte d'action pour créer un groupe en plus */}
        <section className="panelGlass">
          <div className="panelHead">
            <div className="panelHeadLeft">
              <div className="panelTitle">Nouveau groupe</div>
            </div>
            <div className="panelHeadRight">
              <button className="ghostSmallBtn" onClick={createGroup}>+ Groupe</button>
            </div>
          </div>
        </section>
      </>
    );
  }

  /* rendu masters */
  function renderMasters(){
    if(!devices.length){
      return (
        <section className="panelGlass masterWide">
          <div className="panelHead">
            <div className="panelHeadLeft">
              <div className="panelTitle">Aucun MASTER</div>
            </div>
            <div className="panelHeadRight">
              <button className="ghostSmallBtn" onClick={openPairDialog}>
                Ajouter un MASTER
              </button>
            </div>
          </div>
          <div style={{fontSize:12,color:"rgba(0,0,0,0.5)"}}>
            Appuie sur "Ajouter un MASTER" puis saisis le code dans le portail Wi-Fi de l’ESP32.
          </div>
        </section>
      );
    }

    return devices.map(dev=>{
      const slaves = nodesByMaster[dev.id]||[];
      return (
        <MasterCard
          key={dev.id}
          dev={dev}
          slaves={slaves}
          perSlavePhase={perSlavePhase}

          onRenameMaster={()=>renameMaster(dev.id)}
          onDeleteMaster={()=>deleteMaster(dev.id)}
          onSendMasterCmd={(mid,action,payload)=>sendCmd(mid,null,action,payload)}

          onSlaveIO={handleSlaveIO}
          onSlaveReset={handleSlaveReset}
          onSlaveMore={handleSlaveMore}
          onSlaveInfoToggle={toggleInfo}
          openInfoMap={openSlaveInfo}
          onSlaveRename={renameSlave}
        />
      );
    });
  }

  /* contenu de la modale pair-code */
  function renderPairModalContent(){
    if(!pairModal.code){
      return <>Génération du code…</>;
    }
    const endMs = pairModal.expires_at ? new Date(pairModal.expires_at).getTime() : 0;
    const leftSec = Math.max(0, Math.floor((endMs - Date.now())/1000));
    const mm = Math.floor(leftSec/60);
    const ss = String(leftSec%60).padStart(2,"0");

    return (
      <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
        <div style={{fontSize:13,color:"#000"}}>
          Saisis ce code dans le portail Wi-Fi du MASTER (ESP32).
        </div>
        <div style={{
          fontSize:24,
          fontWeight:600,
          letterSpacing:"0.08em",
          color:"#000",
          textAlign:"center"
        }}>
          {String(pairModal.code).padStart(6,"0")}
        </div>
        <div style={{fontSize:12,color:"rgba(0,0,0,0.6)",textAlign:"center"}}>
          Expire dans {mm}:{ss}
        </div>
      </div>
    );
  }

  /* contenu de la modale moreDialog (Hard OFF / Hard RESET) */
  function renderMoreDialogContent(){
    return (
      <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#000"}}>
          Actions critiques
        </div>
        <div style={{fontSize:12,color:"rgba(0,0,0,0.7)"}}>
          Ces commandes sont violentes. Utilise-les uniquement si la machine ne répond plus.
        </div>
        <button
          className="ghostSmallBtn danger"
          onClick={hardOffCurrentSlave}
          style={{width:"100%",justifyContent:"center"}}
        >
          HARD POWER OFF
        </button>
        <button
          className="ghostSmallBtn danger"
          onClick={hardResetCurrentSlave}
          style={{width:"100%",justifyContent:"center"}}
        >
          HARD RESET
        </button>
      </div>
    );
  }

  /* contenu de la modale édition groupe */
  function renderGroupEditModalContent(){
    const g = groups.find(x=>x.id===groupEditModal.groupId);
    if(!g){
      return <>Groupe introuvable…</>;
    }
    return (
      <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#000"}}>
          {g.name || "Groupe"}
        </div>

        <button
          className="ghostSmallBtn"
          style={{width:"100%",justifyContent:"center"}}
          onClick={()=>renameGroup(g.id)}
        >
          Renommer le groupe
        </button>

        <button
          className="ghostSmallBtn danger"
          style={{width:"100%",justifyContent:"center"}}
          onClick={()=>{
            deleteGroup(g.id);
            setGroupEditModal({open:false,groupId:null});
          }}
        >
          Supprimer le groupe
        </button>
      </div>
    );
  }

  /* contenu de la modale ajout membre au groupe */
  function renderGroupAddModalContent(){
    const g = groups.find(x=>x.id===groupAddModal.groupId);
    if(!g){
      return <>Groupe introuvable…</>;
    }
    return (
      <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#000"}}>
          Ajouter un SLAVE à « {g.name||"Groupe"} »
        </div>

        {allSlavesFlat.length===0 && (
          <div style={{fontSize:12,color:"rgba(0,0,0,0.6)"}}>
            Aucun slave disponible.
          </div>
        )}

        {allSlavesFlat.length>0 && (
          <div style={{
            maxHeight:"40vh",
            overflowY:"auto",
            display:"flex",
            flexDirection:"column",
            gap:"8px"
          }}>
            {allSlavesFlat.map(sl=>(
              <button
                key={`${sl.master_id}|${sl.slave_mac}`}
                className="ghostSmallBtn"
                style={{
                  display:"flex",
                  justifyContent:"space-between",
                  alignItems:"center",
                  width:"100%"
                }}
                onClick={()=>{
                  addMemberToGroup(g.id, sl);
                }}
              >
                <span style={{
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"flex-start",
                  textAlign:"left"
                }}>
                  <span style={{fontSize:12,color:"#000",fontWeight:500,lineHeight:1.2}}>
                    {sl.friendly_name || sl.slave_mac}
                  </span>
                  <span style={{fontSize:10,color:"rgba(0,0,0,0.6)",lineHeight:1.2}}>
                    {sl.master_id} · {sl.slave_mac}
                  </span>
                </span>
                <PcDot on={!!sl.pc_on}/>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* guard si env pas configuré */
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    return (
      <>
        <div style={{
          fontFamily:"system-ui, sans-serif",
          padding:"20px",
          color:"#000"
        }}>
          <h2>Configuration manquante</h2>
          <p>Définis les variables d’environnement Vite :</p>
          <code style={{display:"block",marginBottom:"4px"}}>VITE_SUPABASE_URL=https://....supabase.co</code>
          <code style={{display:"block",marginBottom:"12px"}}>VITE_SUPABASE_ANON_KEY=eyJhbGciOi...</code>
          <p>Dans GitHub Actions → Settings &gt; Secrets and variables &gt; Actions.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>

      {/* fond flou plein écran */}
      <div className="pageBg" />

      {/* barre du haut */}
      <header className="topbar">
        <div className="brandTitle">REMOTE POWER</div>
        <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
          {renderAuthBox()}
          <button className="ghostSmallBtn" onClick={reloadAll}>Rafraîchir</button>
          <button className="ghostSmallBtn" onClick={openPairDialog}>Ajouter MASTER</button>
        </div>
      </header>

      {/* contenu */}
      <main className="mainWrap">

        {/* masters */}
        {renderMasters()}

        {/* groupes */}
        {renderGroups()}

        {/* Journal global */}
        <section className="logBlock">
          <div className="logTitle">Journal</div>
          <div ref={logRef} className="logArea">
            {lines.join("\n")}
          </div>
        </section>
      </main>

      {/* Modale Pair-code */}
      <ModalGlass
        open={pairModal.open}
        title="Appairer un MASTER"
        onClose={()=>setPairModal({open:false,code:null,expires_at:null})}
      >
        {renderPairModalContent()}
      </ModalGlass>

      {/* Modale More (Hard OFF / Hard RESET) */}
      <ModalGlass
        open={moreDialog.open}
        title="Contrôle critique"
        onClose={()=>setMoreDialog({open:false,masterId:null,slaveMac:null})}
      >
        {renderMoreDialogContent()}
      </ModalGlass>

      {/* Modale édition groupe (renommer / supprimer) */}
      <ModalGlass
        open={groupEditModal.open}
        title="Gérer le groupe"
        onClose={()=>setGroupEditModal({open:false,groupId:null})}
      >
        {renderGroupEditModalContent()}
      </ModalGlass>

      {/* Modale ajout membre dans un groupe */}
      <ModalGlass
        open={groupAddModal.open}
        title="Ajouter un membre"
        onClose={()=>setGroupAddModal({open:false,groupId:null})}
      >
        {renderGroupAddModalContent()}
      </ModalGlass>

    </>
  );
}
