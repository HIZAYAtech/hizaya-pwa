import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------
   CONFIG SUPABASE
------------------------------------------------- */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = createClient(SUPABASE_URL, SUPA_ANON);

/* -------------------------------------------------
   CONSTANTES / HELPERS
------------------------------------------------- */
const DEFAULT_IO_PIN = 26;                     // pin de power soft
const LIVE_TTL_MS = 8_000;                     // 8s pour considérer un master "en ligne"
const PROGRESS_DONE_TIMEOUT = 800;             // ms avant de cacher la barre noire "progress"

const fmtTS = (s) => (s ? new Date(s).toLocaleString() : "—");
const isMasterLive = (d) => d.last_seen && (Date.now() - new Date(d.last_seen)) < LIVE_TTL_MS;

/* -------------------------------------------------
   STYLES INLINE (vite / vitre / verre)
   Même palette claire + effet blur pour panel
------------------------------------------------- */
const styles = `
:root {
  --bg-page: #f4f5f8;
  --panel-glass-bg: rgba(255,255,255,0.6);
  --panel-stroke: rgba(0,0,0,0.08);
  --text-main: #1a1a1a;
  --text-dim: #6b6b6b;
  --text-live: #16a34a;
  --text-off: #9ca3af;
  --bubble-bg: rgba(0,0,0,0.06);
  --bubble-hover-bg: rgba(0,0,0,0.12);
  --bubble-active-bg: rgba(0,0,0,0.2);
  --border-radius-xl: 20px;
  --border-radius-lg: 16px;
  --border-radius-md: 12px;
  --border-radius-full: 999px;

  --cmd-progress-height: 3px;
  --cmd-progress-color: rgba(0,0,0,0.75);
}

/* layout de page */
html,body,#root {
  height:100%;
  margin:0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  background-color: var(--bg-page);
  color: var(--text-main);
}

/* fond décoratif pleine page */
.app-bg {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  /* tu peux changer cette URL pour changer le wallpaper */
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60");
  filter: blur(40px) brightness(1.08);
  transform: scale(1.1);
  z-index: 0;
}

/* overlay scroll zone */
.app-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height:100%;
}

/* barre top globale */
.topbar {
  width:100%;
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--panel-stroke);

  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  padding: 12px 16px;
  gap:12px;
  box-sizing:border-box;
}

.topbar-left {
  display:flex;
  flex-direction:column;
  min-width: 0;
}
.app-title {
  font-size:15px;
  font-weight:600;
  color:var(--text-main);
  line-height:1.2;
  letter-spacing: -.03em;
}
.app-sub {
  font-size:12px;
  color:var(--text-dim);
  line-height:1.2;
  text-overflow:ellipsis;
  overflow:hidden;
  white-space:nowrap;
}

.topbar-right {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
}

/* petit bouton "verre" type bulle */
.ghost-btn {
  appearance:none;
  border:0;
  background: var(--bubble-bg);
  border-radius: var(--border-radius-full);
  padding:6px 10px;
  font-size:12px;
  font-weight:500;
  color: var(--text-main);
  line-height:1.2;
  cursor:pointer;
}
.ghost-btn:hover {
  background: var(--bubble-hover-bg);
}
.ghost-btn:active {
  background: var(--bubble-active-bg);
}

/* container scrollable contenu principal */
.main-scroll {
  flex:1;
  min-height:0;
  overflow-y:auto;
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:16px;
  box-sizing:border-box;
}

/* panneau group / master "vitre" */
.glass-panel {
  background: var(--panel-glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: var(--border-radius-xl);
  border:1px solid var(--panel-stroke);
  box-shadow:
    0 30px 60px rgba(0,0,0,0.08),
    0 4px 20px rgba(0,0,0,0.06);
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:12px;
  max-width:1280px;
  width:100%;
  margin:0 auto;
  box-sizing:border-box;
}

/* header de carte groupe/master */
.panel-head {
  display:flex;
  flex-wrap:wrap;
  align-items:flex-start;
  justify-content:space-between;
  row-gap:8px;
}
.panel-head-left {
  display:flex;
  flex-direction:column;
  min-width:0;
}
.panel-title-row {
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  line-height:1.2;
}
.panel-title {
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
  letter-spacing:-.03em;
}
.badge-live {
  background:rgba(22,163,74,0.1);
  color:#16a34a;
  border-radius:var(--border-radius-full);
  font-size:11px;
  line-height:1.2;
  font-weight:500;
  padding:4px 8px;
}
.badge-off {
  background:rgba(0,0,0,0.05);
  color:#9ca3af;
  border-radius:var(--border-radius-full);
  font-size:11px;
  line-height:1.2;
  font-weight:500;
  padding:4px 8px;
}
.panel-sub {
  font-size:12px;
  color:var(--text-dim);
  line-height:1.3;
  word-break:break-word;
}

.panel-head-right {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
}

/* conteneur slaves (dans master) ou membres (dans groupe) */
.slave-wrap {
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  align-items:flex-start;
  gap:12px;
}

/* carte de slave / membre (vitre dans vitre) */
.slave-card {
  background: rgba(255,255,255,0.55);
  border:1px solid var(--panel-stroke);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: var(--border-radius-lg);
  box-shadow:
    0 20px 40px rgba(0,0,0,0.07),
    0 4px 16px rgba(0,0,0,0.05);
  width: min(140px, 32%);
  min-width:120px;
  max-width:160px;

  display:flex;
  flex-direction:column;
  justify-content:flex-start;
  align-items:center;
  padding:12px;
  box-sizing:border-box;
  text-align:center;
  position:relative;
  color:var(--text-main);
  flex: 0 1 auto;
}

/* zone info clickable 'i' */
.slave-info-btn {
  position:absolute;
  top:8px;
  right:8px;
  font-size:10px;
  line-height:1;
  background: var(--bubble-bg);
  border-radius: var(--border-radius-full);
  padding:4px 6px;
  cursor:pointer;
  color:var(--text-main);
}
.slave-info-btn:hover{
  background:var(--bubble-hover-bg);
}

/* nom du slave */
.slave-name {
  font-size:14px;
  font-weight:600;
  line-height:1.2;
  color:var(--text-main);
  letter-spacing:-.03em;
  margin-top:4px;
  text-wrap:balance;
  word-break:break-word;
}
.slave-state {
  font-size:11px;
  line-height:1.2;
  color:var(--text-dim);
  margin-top:4px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:2px;
}

/* barre de progression d'action */
.progress-bar-wrap {
  width:100%;
  height:var(--cmd-progress-height);
  border-radius:var(--border-radius-full);
  background: rgba(0,0,0,0.07);
  margin-top:6px;
  overflow:hidden;
}
.progress-bar-fill {
  height:100%;
  background: var(--cmd-progress-color);
  transition:width 0.2s linear;
}

/* zone boutons ronds */
.slave-actions {
  display:flex;
  justify-content:center;
  align-items:flex-end;
  gap:10px;
  margin-top:12px;
}

/* bouton rond minimal */
.circle-btn {
  width:36px;
  height:36px;
  flex:0 0 auto;
  border-radius:50%;
  border:0;
  cursor:pointer;
  line-height:0;
  background: var(--bubble-bg);
  color:var(--text-main);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
  font-weight:500;
}
.circle-btn:hover {
  background: var(--bubble-hover-bg);
}
.circle-btn:active {
  background: var(--bubble-active-bg);
}

/* commandes globales du master */
.master-actions-row {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
  justify-content:flex-start;
  font-size:12px;
}

.master-actions-row .ghost-btn {
  font-size:12px;
  padding:6px 10px;
  line-height:1.2;
}
.master-info-small {
  margin-left:auto;
  font-size:11px;
  color:var(--text-dim);
  line-height:1.2;
}

/* bloc "Commandes récentes" */
.cmd-block {
  border-top:1px solid var(--panel-stroke);
  padding-top:8px;
}
.cmd-title {
  font-size:12px;
  font-weight:500;
  color:var(--text-dim);
  margin-bottom:4px;
}
.cmd-list {
  font-size:11px;
  line-height:1.3;
  color:var(--text-main);
  max-height:120px;
  overflow-y:auto;
  margin:0;
  padding-left:16px;
}

/* bloc "Groupes" */
.group-line {
  font-size:12px;
  line-height:1.4;
  color:var(--text-dim);
}

/* petit dialogue overlay style HTML <dialog> */
dialog[open] {
  border:0;
  background: rgba(255,255,255,0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: var(--border-radius-lg);
  padding:16px;
  color:var(--text-main);
  box-shadow:
    0 30px 60px rgba(0,0,0,0.08),
    0 4px 20px rgba(0,0,0,0.05);
  max-width:320px;
  width:90%;
}
dialog .dlg-title {
  font-size:14px;
  font-weight:600;
  margin:0 0 8px 0;
  color:var(--text-main);
  letter-spacing:-.03em;
}
dialog .dlg-line {
  font-size:12px;
  color:var(--text-dim);
  line-height:1.4;
  word-break:break-word;
  margin-bottom:8px;
}
dialog .dlg-row {
  margin-top:12px;
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
`;

/* -------------------------------------------------
   Composants UI
------------------------------------------------- */

/* Petit util pour rendre un cercle état (pc_on) */
function PcDot({ on }) {
  const dotStyle = {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: on ? "#16a34a" : "#9ca3af",
    boxShadow: on ? "0 0 4px #16a34a" : "none"
  };
  return <span style={dotStyle} />;
}

/* Carte d'un SLAVE (ou membre de groupe) */
function SlaveCard({
  name,
  isOn,
  phasePct,              // 0 -> 100 progression commande, ou null si rien en cours
  showProgress,
  onInfo,
  onIO,
  onReset,
  onMore,
}) {
  return (
    <div className="slave-card">
      <button className="slave-info-btn" onClick={onInfo}>i</button>

      <div className="slave-name">{name || "Sans nom"}</div>

      <div className="slave-state">
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <PcDot on={isOn} />
          <span style={{color: isOn ? "var(--text-live)" : "var(--text-dim)"}}>
            {isOn ? "PC allumé" : "PC éteint"}
          </span>
        </div>

        {showProgress ? (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{
                width: (phasePct ?? 0) + "%"
              }}
            />
          </div>
        ) : (
          <div className="progress-bar-wrap" style={{opacity:0.2}}>
            <div className="progress-bar-fill" style={{width:"0%"}}/>
          </div>
        )}
      </div>

      <div className="slave-actions">
        <button className="circle-btn" onClick={onIO} title="IO / Power pulse">⏻</button>
        <button className="circle-btn" onClick={onReset} title="Reset">↻</button>
        <button className="circle-btn" onClick={onMore} title="Plus">⋯</button>
      </div>
    </div>
  );
}

/* Carte MASTER */
function MasterCard({
  master,
  slaves,
  cmds,
  onRename,
  onDelete,
  onPulse,
  onPowerOn,
  onPowerOff,
  onResetMaster,
  onSlaveIO,
  onSlaveReset,
  onSlaveMore,
  progressBySlave, // { mac: {active:boolean, pct:number} }
}) {
  const live = isMasterLive(master);

  return (
    <section className="glass-panel">
      <div className="panel-head">
        <div className="panel-head-left">
          <div className="panel-title-row">
            <div className="panel-title">{master.name || master.id || "MASTER"}</div>
            <div className={live ? "badge-live" : "badge-off"}>
              {live ? "EN LIGNE" : "HORS LIGNE"}
            </div>
          </div>
          <div className="panel-sub">
            Dernier contact : {fmtTS(master.last_seen) || "jamais"}
          </div>
        </div>

        <div className="panel-head-right">
          <button className="ghost-btn" onClick={onRename}>Renommer</button>
          <button className="ghost-btn" onClick={onDelete}>Supprimer</button>
        </div>
      </div>

      <div className="slave-wrap">
        {slaves.map((sl) => {
          const prog = progressBySlave[sl.slave_mac] || {active:false,pct:0};
          return (
            <SlaveCard
              key={sl.slave_mac}
              name={sl.friendly_name || sl.slave_mac}
              isOn={!!sl.pc_on}
              showProgress={prog.active}
              phasePct={prog.pct}
              onInfo={()=>{
                const newName = prompt("Renommer ce SLAVE ?", sl.friendly_name || sl.slave_mac);
                if(newName && newName.trim()){
                  onSlaveMore("RENAME_ONLY", master.id, sl.slave_mac, {friendly_name:newName.trim()});
                }
              }}
              onIO={() => onSlaveIO(master.id, sl.slave_mac)}
              onReset={() => onSlaveReset(master.id, sl.slave_mac)}
              onMore={() => onSlaveMore("OPEN_MENU", master.id, sl.slave_mac)}
            />
          );
        })}
      </div>

      <div className="master-actions-row">
        <button className="ghost-btn" onClick={onPulse}>Pulse 500 ms</button>
        <button className="ghost-btn" onClick={onPowerOn}>Power ON</button>
        <button className="ghost-btn" onClick={onPowerOff}>Power OFF</button>
        <button className="ghost-btn" onClick={onResetMaster}>Reset</button>

        <div className="master-info-small">
          ID : {master.id} • MAC : {master.master_mac || "—"}
        </div>
      </div>

      <div className="cmd-block">
        <div className="cmd-title">Commandes (20 dernières)</div>
        <ol className="cmd-list">
          {(cmds||[]).map((c)=>(
            <li key={c.id}>
              <code>{c.status}</code>{" "}
              {c.action}{c.target_mac ? (" → "+c.target_mac):" (local)"}{" "}
              · <span style={{color:"var(--text-dim)"}}>{fmtTS(c.created_at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* Carte GROUPE */
function GroupCard({
  group,
  members,
  onGroupIO,
  onGroupReset,
  onGroupMore,
  onAddMember,
}) {
  // calcul combien ON
  const onCount = members.reduce((acc,m)=> acc + (m.pc_on?1:0), 0);
  return (
    <section className="glass-panel">
      <div className="panel-head">
        <div className="panel-head-left">
          <div className="panel-title-row">
            <div className="panel-title">{group.name || "GROUPE"}</div>
            {/* ex: "2/3 ON" */}
            <div
              className="badge-live"
              style={{background:"rgba(0,0,0,0.06)", color:"var(--text-main)"}}
            >
              {onCount}/{members.length} ON
            </div>
          </div>
          <div className="panel-sub">
            Groupe multi-slaves (masters croisés autorisés)
          </div>
        </div>

        <div className="panel-head-right">
          <button className="ghost-btn" onClick={onAddMember}>Ajouter un SLAVE</button>
        </div>
      </div>

      <div className="slave-wrap">
        {members.map((m)=>(
          <SlaveCard
            key={m.master_id+"|"+m.slave_mac}
            name={m.friendly_name || m.slave_mac}
            isOn={!!m.pc_on}
            showProgress={false}
            phasePct={0}
            onInfo={()=>{
              alert(
                "Master: "+m.master_id+
                "\nMAC: "+m.slave_mac+
                "\nNom: "+(m.friendly_name||"(aucun)")+
                "\nPC ON: "+(m.pc_on?"oui":"non")
              );
            }}
            onIO={()=>onGroupIO([m])}
            onReset={()=>onGroupReset([m])}
            onMore={()=>onGroupMore([m])}
          />
        ))}
      </div>

      <div className="master-actions-row">
        <button className="ghost-btn" onClick={()=>onGroupIO(members)}>Pulse tous</button>
        <button className="ghost-btn" onClick={()=>onGroupReset(members)}>Reset tous</button>
        <button className="ghost-btn" onClick={()=>onGroupMore(members)}>⋯ Groupe</button>

        <div className="master-info-small">
          {group.id}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------
   MAIN APP
------------------------------------------------- */
export default function App(){

  /* ---------- AUTH / SESSION READY ---------- */
  const [user,setUser] = useState(null);
  const [authReady,setAuthReady] = useState(false);

  /* ---------- DATA STATE ---------- */
  const [devices,setDevices] = useState([]); // masters
  const [nodesByMaster,setNodesByMaster] = useState({}); // { master_id: [ {slave_mac, friendly_name, pc_on, ...} ] }
  const [cmdsByMaster,setCmdsByMaster] = useState({}); // { master_id: [commands...] }

  /* groupes */
  const [groups,setGroups] = useState([]); // [{id,name,...}]
  const [groupMembers,setGroupMembers] = useState({}); // { group_id: [ {master_id, slave_mac, friendly_name, pc_on}, ... ] }

  /* progress actions par slave */
  const [progressBySlave,setProgressBySlave] = useState({}); 
  // ex { "a8:42...":{active:true,pct:60} }

  /* logs */
  const [lines,setLines] = useState([]);
  const logRef=useRef(null);
  const log = (t)=> setLines(ls=>[...ls, `${new Date().toLocaleTimeString()}  ${t}`]);
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight },[lines]);

  /* dialogs */
  const [pair,setPair] = useState({open:false,code:null,expires_at:null});
  const [moreDialog,setMoreDialog] = useState({open:false,targets:[]}); // pour ⋯ sur groupe/slave

  /* ---------- AUTH bootstrap ---------- */
  useEffect(()=>{
    const sub = sb.auth.onAuthStateChange((ev,session)=>{
      setUser(session?.user||null);
      setAuthReady(true);
    });
    (async()=>{
      const {data:{session}} = await sb.auth.getSession();
      setUser(session?.user||null);
      setAuthReady(true);
    })();
    return ()=>sub.data.subscription.unsubscribe();
  },[]);

  /* ---------- after authReady true ---------- */
  useEffect(()=>{
    if(!authReady) return;
    if(!user){
      // pas connecté → on nettoie
      cleanupRealtime();
      setDevices([]);
      setNodesByMaster({});
      setCmdsByMaster({});
      setGroups([]);
      setGroupMembers({});
      return;
    }
    // connecté → charger tout
    attachRealtime();
    loadEverything();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authReady,user]);

  /* ---------- REALTIME channels ---------- */
  const chDevices = useRef(null);
  const chNodes   = useRef(null);
  const chCmds    = useRef(null);
  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current)   sb.removeChannel(chNodes.current);
    if(chCmds.current)    sb.removeChannel(chCmds.current);
    chDevices.current=chNodes.current=chCmds.current=null;
  }
  function attachRealtime(){
    cleanupRealtime();

    chDevices.current = sb.channel("rt:devices")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'devices'}, p=>{
        log(`+ master ${p.new.id}`);
        setDevices(ds=>[p.new,...ds]);
        refreshCmds(p.new.id);
        refreshNodesFor(p.new.id);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'devices'}, p=>{
        setDevices(ds=>ds.map(d=>d.id===p.new.id? {...d,...p.new }:d));
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'devices'}, p=>{
        const goneId=p.old.id;
        log(`- master ${goneId}`);
        setDevices(ds=>ds.filter(d=>d.id!==goneId));
      })
      .subscribe();

    chNodes.current = sb.channel("rt:nodes")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'nodes'}, p=>{
        log(`+ node ${p.new.slave_mac} → ${p.new.master_id}`);
        refreshNodesFor(p.new.master_id);
        // un node ajouté peut affecter un groupe existant
        reloadGroups(); 
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'nodes'}, p=>{
        // maj pc_on / friendly_name etc
        refreshNodesFor(p.new.master_id);
        reloadGroups();
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'nodes'}, p=>{
        log(`- node ${p.old.slave_mac} ← ${p.old.master_id}`);
        refreshNodesFor(p.old.master_id);
        reloadGroups();
      })
      .subscribe();

    chCmds.current = sb.channel("rt:commands")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'commands'}, p=>{
        upsertCmd(p.new.master_id, p.new);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'commands'}, p=>{
        upsertCmd(p.new.master_id, p.new);
      })
      .subscribe();
  }

  /* ---------- LOAD EVERYTHING ---------- */
  async function loadEverything(){
    await Promise.all([
      loadDevicesAndNodes(),
      loadAllCmds(),
      reloadGroups()
    ]);
  }

  async function loadDevicesAndNodes(){
    // masters
    const {data:devs,error:ed} = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at",{ascending:false});
    if(ed){ log("Err devices: "+ed.message); return; }
    setDevices(devs||[]);

    // nodes groupés par master
    const {data:nodes,error:en} = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on,last_seen");
    if(en){ log("Err nodes: "+en.message); return; }

    const map={};
    (nodes||[]).forEach(n=>{
      (map[n.master_id]??=[]).push(n);
    });
    setNodesByMaster(map);
  }

  async function loadAllCmds(){
    const {data, error} = await sb
      .from("commands")
      .select("id,action,target_mac,status,created_at,master_id")
      .order('created_at',{ascending:false})
      .limit(100);
    if(error){
      log("Err cmds: "+error.message);
      return;
    }
    // on groupe par master_id
    const map={};
    (data||[]).forEach(c=>{
      (map[c.master_id]??=[]).push(c);
    });
    setCmdsByMaster(map);
  }

  async function refreshNodesFor(masterId){
    const {data,error} = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on,last_seen")
      .eq("master_id",masterId);
    if(error) { log("Err nodes refresh: "+error.message); return; }
    setNodesByMaster(old=>{
      return {...old, [masterId]: data||[]};
    });
  }

  async function refreshCmds(masterId){
    const {data,error} = await sb
      .from("commands")
      .select("id,action,target_mac,status,created_at,master_id")
      .eq("master_id", masterId)
      .order('created_at',{ascending:false})
      .limit(20);
    if(error){ log("Err cmds refresh: "+error.message);return; }
    setCmdsByMaster(old=>({...old,[masterId]:data||[]}));
  }

  /* ---------- GROUPES ---------- */
  async function reloadGroups(){
    // 1) charger tous les groupes que possède l'user
    const {data:grps, error:eg} = await sb
      .from("groups")
      .select("id,name,created_at,updated_at");
    if(eg){ log("Err groups: "+eg.message); return; }
    setGroups(grps||[]);

    // 2) pour chaque groupe, charger members + nodes join
    // version naive: on boucle
    const gmMap = {};
    for(const g of (grps||[])){
      const {data:members, error:em} = await sb
        .from("group_members")
        .select("group_id, master_id, slave_mac, alias, added_at, nodes!inner(friendly_name, pc_on)")
        // NOTE: pour que ".nodes!inner(...)" marche il faut que group_members ait FK
        // et que Supabase comprenne la relation (tu l'as créée avec fk_group_member_node)
        .eq("group_id", g.id);

      if(em){
        log("Err group_members for "+g.id+": "+em.message);
        gmMap[g.id] = [];
      } else {
        // flatten pour que chaque membre ait friendly_name, pc_on
        gmMap[g.id] = (members||[]).map(m=>({
          master_id: m.master_id,
          slave_mac: m.slave_mac,
          friendly_name: m.nodes?.friendly_name || m.alias || m.slave_mac,
          pc_on: m.nodes?.pc_on ?? false
        }));
      }
    }
    setGroupMembers(gmMap);
  }

  // créer un groupe
  async function handleCreateGroup(){
    if(!user){ alert("Non connecté"); return; }
    const name=prompt("Nom du groupe ?","Mon Groupe");
    if(!name) return;
    const {error} = await sb
      .from("groups")
      .insert({ name, owner_uid: user.id });
    if(error){
      alert("Erreur création groupe: "+error.message);
    } else {
      log("Groupe créé: "+name);
      reloadGroups();
    }
  }

  // ajouter un membre dans un groupe (v1 brute: prompt master+mac)
  async function handleAddMember(gid){
    const mid = prompt("master_id du SLAVE à ajouter ?");
    if(!mid) return;
    const mac = prompt("MAC du SLAVE (ex: a8:42:e3:91:75:78) ?");
    if(!mac) return;

    const alias = prompt("Alias local (optionnel) ?", "");
    const {error} = await sb
      .from("group_members")
      .insert({
        group_id: gid,
        master_id: mid,
        slave_mac: mac,
        alias: alias||null
      });
    if(error){
      alert("Erreur add member: "+error.message);
    } else {
      log(`Ajouté ${mac} (${mid}) dans groupe ${gid}`);
      reloadGroups();
    }
  }

  /* ---------- COMMAND SEND ---------- */
  async function sendCmd(masterId, targetMac, action, payload={}){
    // lance la barre de progression sur ce slave
    if(targetMac){
      setProgressBySlave(old=>{
        const key=targetMac;
        return {
          ...old,
          [key]:{active:true,pct:20}
        };
      });
    } else {
      // commande master globale → pas de progress par esclave
    }

    const {error} = await sb.from("commands").insert({
      master_id: masterId,
      target_mac: targetMac || null,
      action,
      payload
    });

    if(error){
      log("cmd err: "+error.message);
      if(targetMac){
        // fail direct -> coupe progress
        setProgressBySlave(old=>{
          const key=targetMac;
          return {
            ...old,
            [key]:{active:false,pct:0}
          };
        });
      }
    } else {
      log(`[cmd] ${action} → ${masterId}${targetMac?" ▶ "+targetMac:""}`);

      // simulate phases:
      if(targetMac){
        // 'queued' -> 40%
        setProgressBySlave(old=>{
          const key=targetMac;
          const prev = old[key]||{active:false,pct:0};
          return {...old,[key]:{active:true,pct:40}};
        });

        // 'send' -> 70%
        setTimeout(()=>{
          setProgressBySlave(old=>{
            const key=targetMac;
            const prev = old[key]||{active:false,pct:0};
            if(!prev.active) return old;
            return {...old,[key]:{active:true,pct:70}};
          });
        },200);

        // 'acked' -> 100% puis hide
        setTimeout(()=>{
          setProgressBySlave(old=>{
            const key=targetMac;
            const prev = old[key]||{active:false,pct:0};
            if(!prev.active) return old;
            return {...old,[key]:{active:true,pct:100}};
          });

          setTimeout(()=>{
            setProgressBySlave(old=>{
              const key=targetMac;
              const prev = old[key]||{active:false,pct:0};
              // on coupe le progress bar
              return {...old,[key]:{active:false,pct:0}};
            });
          }, PROGRESS_DONE_TIMEOUT);

        },400);
      }
    }
  }

  /* actions master globales */
  function pulseMaster(mid){ sendCmd(mid,null,"PULSE",{ms:500}); }
  function powerOnMaster(mid){ sendCmd(mid,null,"POWER_ON",{}); }
  function powerOffMaster(mid){ sendCmd(mid,null,"POWER_OFF",{}); }
  function resetMaster(mid){ sendCmd(mid,null,"RESET",{}); }

  /* actions slave individuelles */
  function ioSlave(mid,mac){
    // Soft power toggle / pulse ON
    sendCmd(mid,mac,"SLV_IO",{pin:DEFAULT_IO_PIN, mode:"OUT", value:1});
  }
  function resetSlave(mid,mac){
    sendCmd(mid,mac,"SLV_RESET",{});
  }
  // "..." menu
  function openMoreSlaveOrRename(mode,mid,mac,extra){
    if(mode==="OPEN_MENU"){
      // affiche menu pour HARD STOP / HARD RESET:
      setMoreDialog({open:true,targets:[{master_id:mid,slave_mac:mac}]});
    }
    if(mode==="RENAME_ONLY"){
      // rename direct du node
      const newName = extra?.friendly_name;
      if(!newName) return;
      sb.from("nodes")
        .update({friendly_name:newName})
        .eq("master_id",mid)
        .eq("slave_mac",mac)
        .then(({error})=>{
          if(error) alert("Rename err: "+error.message);
          else {
            log(`SLAVE ${mac} → ${newName}`);
            refreshNodesFor(mid);
            reloadGroups();
          }
        });
    }
  }

  /* actions groupe (boucle sur chaque membre) */
  function sendGroupIO(list){
    for(const m of list){
      ioSlave(m.master_id,m.slave_mac);
    }
  }
  function sendGroupReset(list){
    for(const m of list){
      resetSlave(m.master_id,m.slave_mac);
    }
  }
  function openGroupMore(list){
    // ouvre le même moreDialog mais avec tous les membres
    setMoreDialog({open:true,targets:list});
  }

  /* HARD STOP / HARD RESET à partir du moreDialog */
  function doHardStop(list){
    list.forEach(m=>{
      sendCmd(m.master_id, m.slave_mac, "SLV_FORCE_OFF",{});
    });
    setMoreDialog({open:false,targets:[]});
  }
  function doHardReset(list){
    list.forEach(m=>{
      sendCmd(m.master_id, m.slave_mac, "SLV_HARD_RESET",{ms:3000});
    });
    setMoreDialog({open:false,targets:[]});
  }

  /* rename master */
  async function renameMaster(id){
    const name=prompt("Nouveau nom du master ?","");
    if(!name) return;
    const {error} = await sb.from("devices").update({name}).eq("id",id);
    if(error) alert(error.message);
    else {
      log(`Renommé ${id} → ${name}`);
      // local refresh
      setDevices(ds=>ds.map(d=>d.id===id?{...d,name}:d));
    }
  }

  /* delete master via edge */
  async function deleteMaster(id){
    if(!confirm(`Supprimer ${id} ?`)) return;
    const {data:{session}}=await sb.auth.getSession(); 
    if(!session){alert("Non connecté"); return;}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        apikey:SUPA_ANON,
        Authorization:`Bearer ${session.access_token}`,
      },
      body:JSON.stringify({ master_id:id })
    });
    log(r.ok?`MASTER supprimé : ${id}`:`❌ Suppression : ${await r.text()}`);
  }

  /* pair master (code d'appairage) */
  async function openPairDialog(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){alert("Non connecté");return;}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        apikey:SUPA_ANON,
        Authorization:`Bearer ${session.access_token}`,
      },
      body:JSON.stringify({ ttl_minutes:10 })
    });
    if(!r.ok){
      alert(await r.text());
      return;
    }
    const {code,expires_at}=await r.json();
    setPair({open:true,code,expires_at});
    log(`Pair-code ${code}`);
  }

  /* login/logout */
  async function doLogin(){
    const {data,error} = await sb.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo: location.href,
        queryParams:{ prompt:"select_account" }
      }
    });
    if(error){
      alert(error.message);
    } else if(data?.url){
      location.href=data.url;
    }
  }
  function doLogout(){
    sb.auth.signOut();
  }

  /* ------------- RENDER ------------- */
  // map progress (evite undefined)
  const progressMap = progressBySlave;

  return (
    <>
      <style>{styles}</style>

      <div className="app-bg" />

      <div className="app-shell">

        {/* TOP BAR globale */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="app-title">REMOTE POWER</div>
            <div className="app-sub">
              {user?.email || "non connecté"}
            </div>
          </div>

          <div className="topbar-right">
            {user && (
              <>
                <button className="ghost-btn" onClick={handleCreateGroup}>+ Groupe</button>
                <button className="ghost-btn" onClick={openPairDialog}>+ Master</button>
              </>
            )}
            <button className="ghost-btn" onClick={loadEverything}>Rafraîchir</button>
            {user ? (
              <button className="ghost-btn" onClick={doLogout}>Déconnexion</button>
            ) : (
              <button className="ghost-btn" onClick={doLogin}>Connexion Google</button>
            )}
          </div>
        </div>

        {/* CONTENU défilant */}
        <div className="main-scroll">

          {/* GROUPES */}
          {groups.length > 0 && (
            <div style={{display:"flex",flexDirection:"column",gap:"16px",maxWidth:"1280px",width:"100%",margin:"0 auto"}}>
              {groups.map(g=>{
                const members = groupMembers[g.id] || [];
                return (
                  <GroupCard
                    key={g.id}
                    group={g}
                    members={members}
                    onGroupIO={(list)=>sendGroupIO(list)}
                    onGroupReset={(list)=>sendGroupReset(list)}
                    onGroupMore={(list)=>openGroupMore(list)}
                    onAddMember={()=>handleAddMember(g.id)}
                  />
                );
              })}
            </div>
          )}

          {/* MASTERS */}
          <div style={{display:"flex",flexDirection:"column",gap:"16px",maxWidth:"1280px",width:"100%",margin:"0 auto"}}>
            {devices.map(m=>{
              const slaves = nodesByMaster[m.id]||[];
              const cmds = cmdsByMaster[m.id]||[];
              return (
                <MasterCard
                  key={m.id}
                  master={m}
                  slaves={slaves}
                  cmds={cmds}
                  progressBySlave={progressMap}
                  onRename={()=>renameMaster(m.id)}
                  onDelete={()=>deleteMaster(m.id)}
                  onPulse={()=>pulseMaster(m.id)}
                  onPowerOn={()=>powerOnMaster(m.id)}
                  onPowerOff={()=>powerOffMaster(m.id)}
                  onResetMaster={()=>resetMaster(m.id)}
                  onSlaveIO={(mid,mac)=>ioSlave(mid,mac)}
                  onSlaveReset={(mid,mac)=>resetSlave(mid,mac)}
                  onSlaveMore={(mode,mid,mac,extra)=>openMoreSlaveOrRename(mode,mid,mac,extra)}
                />
              );
            })}
          </div>

          {/* Journal global */}
          <section className="glass-panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title-row">
                  <div className="panel-title">Journal interne</div>
                </div>
                <div className="panel-sub">
                  Logs locaux UI (debug)
                </div>
              </div>
            </div>

            <div style={{
              background:"rgba(255,255,255,0.6)",
              border:"1px solid var(--panel-stroke)",
              borderRadius:"var(--border-radius-md)",
              padding:"8px",
              maxHeight:"160px",
              overflowY:"auto",
              fontSize:"11px",
              lineHeight:1.35,
              whiteSpace:"pre-wrap",
              color:"var(--text-main)"
            }}
            ref={logRef}
            >
              {lines.join("\n")}
            </div>
          </section>
        </div>
      </div>

      {/* Dialog Pair-code */}
      {pair.open && (
        <dialog open onClose={()=>setPair({open:false,code:null,expires_at:null})}>
          <h3 className="dlg-title">Appairer un MASTER</h3>
          <div className="dlg-line">
            Code : <b>{String(pair.code).padStart(6,"0")}</b>
            <br/>
            {(()=>{
              const end = pair.expires_at ? new Date(pair.expires_at).getTime() : 0;
              const l   = Math.max(0,Math.floor((end-Date.now())/1000));
              return "Expire dans " + Math.floor(l/60) + ":" + String(l%60).padStart(2,'0');
            })()}
          </div>
          <div className="dlg-line">
            Saisis ce code dans le portail Wi-Fi du MASTER (ESP32).
          </div>
          <div className="dlg-row">
            <button className="ghost-btn"
                    onClick={()=>setPair({open:false,code:null,expires_at:null})}>
              Fermer
            </button>
          </div>
        </dialog>
      )}

      {/* Dialog more (hard stop / hard reset groupe ou slave) */}
      {moreDialog.open && (
        <dialog open onClose={()=>setMoreDialog({open:false,targets:[]})}>
          <h3 className="dlg-title">Actions avancées</h3>
          <div className="dlg-line">
            {moreDialog.targets.length===1
              ? "Sur 1 machine"
              : `Sur ${moreDialog.targets.length} machines`}<br/>
            HARD STOP = forcer OFF<br/>
            HARD RESET = coupure longue puis remise
          </div>
          <div className="dlg-row">
            <button
              className="ghost-btn"
              style={{background:"rgba(0,0,0,0.06)"}}
              onClick={()=>{
                doHardStop(moreDialog.targets);
              }}>
              Hard STOP
            </button>
            <button
              className="ghost-btn"
              style={{background:"rgba(0,0,0,0.06)"}}
              onClick={()=>{
                doHardReset(moreDialog.targets);
              }}>
              Hard RESET
            </button>
            <button
              className="ghost-btn"
              onClick={()=>setMoreDialog({open:false,targets:[]})}>
              Fermer
            </button>
          </div>
        </dialog>
      )}

    </>
  );
}
