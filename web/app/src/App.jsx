import { useEffect, useRef, useState, useMemo } from "react"
import { createClient } from "@supabase/supabase-js"

/* =========================
   CONFIG SUPABASE
   ========================= */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON     = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPA_ANON)

/* =========================
   CONSTANTES UI / TEMPS
   ========================= */
const LIVE_TTL_MS = 8000          // master en ligne si ping < 8s
const DEFAULT_IO_PIN = 26         // pin de sortie sur le slave pour IO
const CMD_BAR_HIDE_MS = 800       // combien de temps la barre reste après ack

/* =========================
   STYLES
   ========================= */
const styles = `
:root{
  --bg-page: #f4f6fa;
  --text-main: #0f172a;
  --text-dim: rgba(15,23,42,0.55);
  --glass-bg: rgba(255,255,255,0.55);
  --glass-border: rgba(0,0,0,0.08);
  --master-bg: rgba(255,255,255,0.4);
  --slave-bg: rgba(255,255,255,0.5);
  --danger: #dc2626;
  --ok: #16a34a;
  --warn: #f59e0b;
  --line: rgba(0,0,0,0.08);
  --btn-bg-hover: rgba(0,0,0,0.06);
  --btn-bg-active: rgba(0,0,0,0.12);
}

/* page + fond */
.app-shell {
  min-height:100vh;
  background-color:var(--bg-page);
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=60");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  color:var(--text-main);
  font:14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial;
  display:flex;
  flex-direction:column;
}

/* barre top */
.app-header {
  flex-shrink:0;
  width:100%;
  background:var(--glass-bg);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-bottom:1px solid var(--glass-border);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:12px 16px;
}
.app-header-left {
  display:flex;
  align-items:center;
  gap:12px;
  font-weight:500;
  letter-spacing:-0.03em;
  font-size:15px;
}
.status-dot-online,
.status-dot-offline {
  width:8px;
  height:8px;
  border-radius:50%;
}
.status-dot-online {
  background:var(--ok);
}
.status-dot-offline {
  background:var(--danger);
}
.app-header-right {
  display:flex;
  align-items:center;
  gap:10px;
  font-size:13px;
  color:var(--text-dim);
  flex-wrap:wrap;
  text-align:right;
}
.badge-small {
  background:rgba(0,0,0,0.06);
  border-radius:999px;
  padding:4px 8px;
  line-height:1.2;
  font-size:12px;
  color:var(--text-main);
  border:1px solid rgba(0,0,0,0.08);
  cursor:default;
}

/* layout principal */
.main-area {
  flex:1;
  display:flex;
  justify-content:center;
  padding:16px;
}
.content-wrap {
  width:100%;
  max-width:1280px;
  display:flex;
  flex-direction:column;
  gap:16px;
}

/* bloc master */
.master-card {
  background:var(--master-bg);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border:1px solid var(--glass-border);
  border-radius:20px;
  box-shadow:0 30px 80px rgba(0,0,0,0.15);
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:16px;
  min-width:0;
}
.master-head-row {
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
}
.master-head-left {
  display:flex;
  flex-direction:column;
  gap:4px;
  min-width:0;
}
.master-title-line {
  display:flex;
  align-items:center;
  gap:10px;
  font-size:14px;
  font-weight:500;
  color:var(--text-main);
}
.master-status-chip {
  font-size:11px;
  line-height:1.2;
  border-radius:999px;
  border:1px solid var(--line);
  padding:3px 8px;
  background:rgba(0,0,0,0.04);
  color:var(--text-main);
}
.master-meta {
  font-size:12px;
  line-height:1.3;
  color:var(--text-dim);
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
}
.master-head-right{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.small-link-btn{
  appearance:none;
  background:transparent;
  border:0;
  font-size:12px;
  padding:6px 10px;
  border-radius:999px;
  line-height:1.2;
  color:var(--text-main);
  border:1px solid transparent;
  cursor:pointer;
}
.small-link-btn:hover{
  background:var(--btn-bg-hover);
}
.small-link-btn:active{
  background:var(--btn-bg-active);
}
.small-link-btn.danger{
  color:var(--danger);
}

/* grille slaves */
.slave-grid-outer{
  display:flex;
  width:100%;
  overflow-x:auto;
  scrollbar-width:none;
  -ms-overflow-style:none;
  justify-content:center;
}
.slave-grid-outer::-webkit-scrollbar{display:none}

.slave-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:16px;
  max-width:1000px;
  width:100%;
  justify-content:center;
}

/* carte slave */
.slave-card{
  position:relative;
  background:var(--slave-bg);
  backdrop-filter: blur(30px) saturate(1.4);
  -webkit-backdrop-filter: blur(30px) saturate(1.4);
  border:1px solid var(--glass-border);
  border-radius:18px;
  box-shadow:0 20px 40px rgba(0,0,0,0.12);
  padding:16px;
  min-height:220px;
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
  align-items:center;
  text-align:center;
  min-width:0;
}

/* bouton info en haut à droite */
.slave-info-btn{
  position:absolute;
  top:8px;
  right:8px;
  font-size:12px;
  width:28px;
  height:28px;
  border-radius:999px;
  border:1px solid rgba(0,0,0,0.08);
  background:rgba(255,255,255,0.4);
  color:var(--text-main);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
}
.slave-info-btn:hover{
  background:rgba(255,255,255,0.6);
}
.slave-info-panel{
  position:absolute;
  top:40px;
  right:8px;
  background:white;
  color:var(--text-main);
  border-radius:12px;
  border:1px solid rgba(0,0,0,0.1);
  box-shadow:0 20px 40px rgba(0,0,0,0.2);
  font-size:12px;
  line-height:1.4;
  padding:10px 12px;
  min-width:150px;
  max-width:200px;
  z-index:50;
}
.slave-info-row{
  margin-bottom:6px;
  word-break:break-all;
}
.slave-info-row:last-child{
  margin-bottom:0;
}
.slave-info-row label{
  display:block;
  font-size:11px;
  font-weight:500;
  color:var(--text-dim);
  margin-bottom:2px;
}
.slave-info-row .value{
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:12px;
  color:var(--text-main);
}
.slave-info-row .editNameInput{
  width:100%;
  font-size:12px;
  padding:4px 6px;
  border-radius:6px;
  border:1px solid rgba(0,0,0,0.15);
  background:white;
  color:var(--text-main);
}

/* nom gros */
.slave-name{
  font-size:16px;
  font-weight:600;
  letter-spacing:-0.03em;
  color:var(--text-main);
  word-break:break-word;
  max-width:100%;
}

/* état PC */
.pc-state{
  font-size:12px;
  line-height:1.2;
  margin-top:4px;
  color:var(--text-dim);
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
}
.pc-dot{
  width:8px;
  height:8px;
  border-radius:50%;
  background:var(--warn);
}
.pc-dot.on{ background:var(--ok); }
.pc-dot.off{ background:var(--danger); }

/* barre progression commande en bas (apparait en overlay tout en bas) */
.cmd-bar-wrap{
  position:absolute;
  left:0;
  right:0;
  bottom:0;
  height:4px;
  background:transparent;
  border-radius:0 0 18px 18px;
  overflow:hidden;
}
.cmd-bar-inner{
  background:#000;
  height:100%;
  width:0%;
  transition:width 0.15s linear;
}

/* rangée boutons ronds */
.slave-btn-row{
  margin-top:14px;
  width:100%;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  gap:12px;
  flex-wrap:wrap;
}

/* bouton rond */
.circle-btn{
  appearance:none;
  border:0;
  background:rgba(0,0,0,0.04);
  width:44px;
  height:44px;
  border-radius:999px;
  color:var(--text-main);
  font-size:12px;
  font-weight:500;
  line-height:1;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  border:1px solid rgba(0,0,0,0.07);
}
.circle-btn:hover{
  background:var(--btn-bg-hover);
}
.circle-btn:active{
  background:var(--btn-bg-active);
}

/* menu more (...) */
.more-panel{
  position:absolute;
  bottom:60px;
  background:white;
  color:var(--text-main);
  border-radius:12px;
  border:1px solid rgba(0,0,0,0.1);
  box-shadow:0 20px 40px rgba(0,0,0,0.2);
  font-size:12px;
  line-height:1.4;
  padding:10px 12px;
  min-width:140px;
  text-align:left;
  z-index:40;
}
.more-btn-line{
  display:block;
  width:100%;
  text-align:left;
  background:transparent;
  border:0;
  padding:6px 0;
  font-size:12px;
  line-height:1.4;
  cursor:pointer;
  color:var(--text-main);
}
.more-btn-line.danger{
  color:var(--danger);
}
.more-btn-line:hover{
  background:rgba(0,0,0,0.05);
  border-radius:6px;
}

/* actions globales master */
.master-actions-row{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:center;
  gap:8px;
  font-size:12px;
  color:var(--text-dim);
}
.master-act-btn{
  appearance:none;
  background:transparent;
  border:0;
  border-radius:999px;
  padding:6px 10px;
  line-height:1.2;
  font-size:12px;
  cursor:pointer;
  color:var(--text-main);
  border:1px solid transparent;
}
.master-act-btn:hover{
  background:var(--btn-bg-hover);
}
.master-act-btn:active{
  background:var(--btn-bg-active);
}
.hr-line{
  height:1px;
  background:var(--line);
  margin:4px 0 8px;
  width:100%;
  border-radius:1px;
}

/* journal */
.log-block{
  background:var(--master-bg);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border:1px solid var(--glass-border);
  border-radius:16px;
  box-shadow:0 30px 80px rgba(0,0,0,0.15);
  padding:12px 16px;
  min-height:120px;
  color:var(--text-main);
  font-size:12px;
  line-height:1.4;
  white-space:pre-wrap;
  overflow-y:auto;
  max-height:200px;
}

/* mini label gris inline */
.muted-inline{
  font-size:12px;
  line-height:1.3;
  color:var(--text-dim);
}
`;

/* =========================
   PETITES UTILS
   ========================= */
function fmtTS(s){
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}
function isLive(device){
  if(!device?.last_seen) return false;
  return (Date.now() - new Date(device.last_seen)) < LIVE_TTL_MS;
}

/* =========================
   COMPOSANT SLAVE
   ========================= */
function SlaveCard({
  mac,
  friendlyName,
  pcOn,
  phase,
  onIO,
  onReset,
  onMoreToggle,
  isMoreOpen,
  onForceOff,
  onHardReset,
  isInfoOpen,
  onToggleInfo,
  editName,
  onEditNameChange,
  onSubmitRename,
}){
  // label état PC
  let pcLabel = "État inconnu";
  let pcDotClass = "";
  if (pcOn === true){
    pcLabel = "Ordinateur allumé";
    pcDotClass = "on";
  } else if (pcOn === false){
    pcLabel = "Ordinateur éteint";
    pcDotClass = "off";
  }

  // barre de commande
  // phase: "idle" | "queue" | "send" | "acked"
  // queue → 30%
  // send → 60%
  // acked → 100%
  let barW = "0%";
  if(phase==="queue") barW="30%";
  else if(phase==="send") barW="60%";
  else if(phase==="acked") barW="100%";

  return (
    <div className="slave-card">

      {/* bouton info */}
      <button className="slave-info-btn" onClick={onToggleInfo}>i</button>

      {isInfoOpen && (
        <div className="slave-info-panel">
          <div className="slave-info-row">
            <label>Adresse MAC</label>
            <div className="value">{mac}</div>
          </div>
          <div className="slave-info-row">
            <label>Nom</label>
            <input
              className="editNameInput"
              value={editName}
              onChange={e=>onEditNameChange(e.target.value)}
              onKeyDown={e=>{
                if(e.key==="Enter") onSubmitRename();
              }}
            />
            <div style={{textAlign:"right",marginTop:"4px"}}>
              <button
                className="more-btn-line"
                style={{padding:"4px 8px",display:"inline-block",width:"auto"}}
                onClick={onSubmitRename}
              >Renommer</button>
            </div>
          </div>
        </div>
      )}

      {/* Nom gros */}
      <div className="slave-name">
        {friendlyName || mac}
      </div>

      {/* état PC */}
      <div className="pc-state">
        <span className={`pc-dot ${pcDotClass}`}></span>
        <span>{pcLabel}</span>
      </div>

      {/* rangée boutons ronds */}
      <div className="slave-btn-row">

        <button
          className="circle-btn"
          title="Impulsion d'alim (IO)"
          onClick={onIO}
        >
          IO
        </button>

        <button
          className="circle-btn"
          title="Reset soft"
          onClick={onReset}
        >
          RST
        </button>

        <button
          className="circle-btn"
          title="Options avancées"
          onClick={onMoreToggle}
        >
          ⋯
        </button>

        {isMoreOpen && (
          <div className="more-panel">
            <button className="more-btn-line danger" onClick={onForceOff}>
              HARD POWER OFF
            </button>
            <button className="more-btn-line danger" onClick={onHardReset}>
              HARD RESET
            </button>
          </div>
        )}
      </div>

      {/* barre progression commande */}
      {(phase!=="idle") && (
        <div className="cmd-bar-wrap">
          <div
            className="cmd-bar-inner"
            style={{width:barW}}
          />
        </div>
      )}
    </div>
  )
}

/* =========================
   COMPOSANT MASTER
   ========================= */
function MasterCard({
  dev,
  slaves,
  statusText,
  onRenameMaster,
  onDeleteMaster,
  onPulse,
  onPwrOn,
  onPwrOff,
  onResetMaster,
  cmdPhaseBySlave,
  onSlaveIO,
  onSlaveReset,
  onSlaveMoreToggle,
  onSlaveForceOff,
  onSlaveHardReset,
  onSlaveToggleInfo,
  openSlaveInfo,
  openSlaveMore,
  editNames,
  onEditNameChange,
  onSubmitRenameSlave,
}){
  return (
    <div className="master-card">

      <div className="master-head-row">

        <div className="master-head-left">
          <div className="master-title-line">
            <div>MASTER</div>
            <div className="master-status-chip">{statusText}</div>
          </div>

          <div className="master-meta">
            <div>Nom : <strong>{dev.name || dev.id}</strong></div>
            <div>Dernier contact : {fmtTS(dev.last_seen) || "jamais"}</div>
          </div>
        </div>

        <div className="master-head-right">
          <button className="small-link-btn" onClick={onRenameMaster}>
            Renommer
          </button>
          <button className="small-link-btn danger" onClick={onDeleteMaster}>
            Supprimer
          </button>
        </div>

      </div>

      {/* zone slaves */}
      <div className="slave-grid-outer">
        <div className="slave-grid">
        {slaves.map(sl => (
          <SlaveCard
            key={sl.mac}
            mac={sl.mac}
            friendlyName={sl.friendly_name || sl.mac}
            pcOn={sl.pc_on}
            phase={cmdPhaseBySlave[sl.mac]?.phase || "idle"}

            onIO={() => onSlaveIO(sl.mac)}
            onReset={() => onSlaveReset(sl.mac)}
            onMoreToggle={() => onSlaveMoreToggle(sl.mac)}
            isMoreOpen={!!openSlaveMore[sl.mac]}

            onForceOff={() => onSlaveForceOff(sl.mac)}
            onHardReset={() => onSlaveHardReset(sl.mac)}

            isInfoOpen={!!openSlaveInfo[sl.mac]}
            onToggleInfo={() => onSlaveToggleInfo(sl.mac)}

            editName={editNames[sl.mac] ?? sl.friendly_name ?? sl.mac}
            onEditNameChange={val => onEditNameChange(sl.mac,val)}
            onSubmitRename={() => onSubmitRenameSlave(sl.mac)}
          />
        ))}
        </div>
      </div>

      <div className="hr-line" />

      {/* actions globales master */}
      <div className="master-actions-row">
        <button className="master-act-btn" onClick={onPulse}>Pulse 500ms</button>
        <button className="master-act-btn" onClick={onPwrOn}>Power ON</button>
        <button className="master-act-btn" onClick={onPwrOff}>Power OFF</button>
        <button className="master-act-btn" onClick={onResetMaster}>Reset</button>
      </div>
    </div>
  )
}

/* =========================
   APP PRINCIPALE
   ========================= */
export default function App(){

  /* ---------- auth / session ---------- */
  const [authReady,setAuthReady]=useState(false)
  const [user,setUser]=useState(null)

  /* ---------- data côté UI ---------- */
  const [devices,setDevices]=useState([])
  // nodesByMaster = { master_id: [ { mac, friendly_name?, pc_on? }, ... ] }
  const [nodesByMaster,setNodesByMaster]=useState({})

  /* barre noire / commande par slave */
  // { [mac]: { phase: 'idle'|'queue'|'send'|'acked', lastChange:number } }
  const [cmdPhaseBySlave,setCmdPhaseBySlave]=useState({})

  /* panneaux d’info / more */
  const [openSlaveInfo,setOpenSlaveInfo]=useState({})
  const [openSlaveMore,setOpenSlaveMore]=useState({})

  /* rename slave */
  const [editNames,setEditNames]=useState({})

  /* logs défilant */
  const [lines,setLines]=useState([])
  const logRef=useRef(null)
  const log = msg=>{
    setLines(ls=>[...ls,`${new Date().toLocaleTimeString()}  ${msg}`])
  }
  useEffect(()=>{
    if(logRef.current){
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  },[lines])

  /* refs commandes master->UI pour listes "20 dernières" (on ne l'affiche plus pour l'instant mais on garde la mécanique) */
  const cmdLists=useRef(new Map())
  function upsertCmdRow(masterId,c){
    const ul = cmdLists.current.get(masterId)
    if(!ul) return
    const id = `cmd-${c.id}`
    const html = `<code>${c.status}</code> · ${c.action}${c.target_mac?' → '+c.target_mac:' (local)'} <span style="color:rgba(0,0,0,0.5)">· ${fmtTS(c.created_at)}</span>`
    let li = ul.querySelector(`#${CSS.escape(id)}`)
    if(!li){
      li=document.createElement('li')
      li.id=id
      li.innerHTML=html
      ul.prepend(li)
      while(ul.children.length>20){
        ul.removeChild(ul.lastChild)
      }
    }else{
      li.innerHTML=html
    }
  }

  /* ---------- realtime channels refs ---------- */
  const chDevices = useRef(null)
  const chNodes   = useRef(null)
  const chCmds    = useRef(null)

  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current)
    if(chNodes.current)   sb.removeChannel(chNodes.current)
    if(chCmds.current)    sb.removeChannel(chCmds.current)
    chDevices.current = null
    chNodes.current   = null
    chCmds.current    = null
  }

  function attachRealtime(){
    cleanupRealtime()

    // devices
    chDevices.current = sb.channel("rt:devices")
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'devices'
      }, p=>{
        log(`+ device ${p.new.id}`)
        setDevices(ds=>[p.new,...ds])
      })
      .on('postgres_changes',{
        event:'UPDATE',schema:'public',table:'devices'
      }, p=>{
        const d=p.new
        setDevices(ds=>ds.map(x=>x.id===d.id?{...x,...d}:x))
      })
      .on('postgres_changes',{
        event:'DELETE',schema:'public',table:'devices'
      }, p=>{
        log(`- device ${p.old.id}`)
        setDevices(ds=>ds.filter(x=>x.id!==p.old.id))
      })
      .subscribe()

    // nodes
    chNodes.current = sb.channel("rt:nodes")
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'nodes'
      }, p=>{
        log(`+ node ${p.new.slave_mac} → ${p.new.master_id}`)
        refreshSlavesFor(p.new.master_id)
      })
      .on('postgres_changes',{
        event:'UPDATE',schema:'public',table:'nodes'
      }, p=>{
        // pc_on/friendly_name peut changer
        refreshSlavesFor(p.new.master_id)
      })
      .on('postgres_changes',{
        event:'DELETE',schema:'public',table:'nodes'
      }, p=>{
        log(`- node ${p.old.slave_mac} ← ${p.old.master_id}`)
        refreshSlavesFor(p.old.master_id)
      })
      .subscribe()

    // commands
    chCmds.current = sb.channel("rt:commands")
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'commands'
      }, p=>{
        upsertCmdRow(p.new.master_id,p.new)
        log(`cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`)

        // si cette commande touche un slave, on passe la barre de ce slave en "send" direct
        if (p.new.target_mac){
          setCmdPhaseBySlave(prev=>{
            const cur = prev[p.new.target_mac] || {}
            return {
              ...prev,
              [p.new.target_mac]: { phase:"send", lastChange:Date.now() }
            }
          })
        }
      })
      .on('postgres_changes',{
        event:'UPDATE',schema:'public',table:'commands'
      }, p=>{
        upsertCmdRow(p.new.master_id,p.new)
        log(`cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`)

        // si status -> ACKED on passe la barre du slave à acked
        if (p.new.target_mac && p.new.status && p.new.status.toUpperCase().includes("ACK")){
          setCmdPhaseBySlave(prev=>{
            return {
              ...prev,
              [p.new.target_mac]: { phase:"acked", lastChange:Date.now() }
            }
          })
        }
      })
      .subscribe()
  }

  /* ---------- LOAD ALL ---------- */
  async function loadAll(){
    // devices
    const {data:devs,error:ed} = await sb
      .from('devices')
      .select('id,name,master_mac,last_seen,online')
      .order('created_at',{ascending:false})
    if(ed){
      log("Err devices: "+ed.message)
    } else {
      setDevices(devs||[])
    }

    // nodes
    // On récupère friendly_name, pc_on si dispo, sinon fallback
    const {data:nodes,error:en} = await sb
      .from('nodes')
      .select('master_id,slave_mac,friendly_name,pc_on')
    if(en){
      log("Err nodes: "+en.message)
    } else {
      const map={}
      ;(nodes||[]).forEach(n=>{
        if(!map[n.master_id]) map[n.master_id]=[]
        map[n.master_id].push({
          mac: n.slave_mac,
          friendly_name: n.friendly_name ?? null,
          pc_on: (typeof n.pc_on==="boolean") ? n.pc_on : null
        })
      })
      setNodesByMaster(map)
    }
  }

  async function refreshSlavesFor(masterId){
    const {data:nodes,error} = await sb
      .from('nodes')
      .select('master_id,slave_mac,friendly_name,pc_on')
      .eq('master_id',masterId)
    if(error){
      log("Err nodes: "+error.message)
      return
    }
    setNodesByMaster(m=>{
      const copy={...m}
      copy[masterId] = (nodes||[]).map(n=>({
        mac: n.slave_mac,
        friendly_name: n.friendly_name ?? null,
        pc_on: (typeof n.pc_on==="boolean") ? n.pc_on : null
      }))
      return copy
    })
  }

  /* ---------- COMMANDES ---------- */
  async function sendCmd(masterId, targetMac, action, payload={}){
    // UI feedback immédiat avant ACK
    if(targetMac){
      // lancement -> phase = "queue"
      setCmdPhaseBySlave(prev=>({
        ...prev,
        [targetMac]: { phase:"queue", lastChange:Date.now() }
      }))
    }

    const { error } = await sb
      .from('commands')
      .insert({
        master_id : masterId,
        target_mac: targetMac || null,
        action,
        payload
      })

    if(error){
      log("cmd err: "+error.message)
      // si échec: barre disparaît
      if(targetMac){
        setCmdPhaseBySlave(prev=>({
          ...prev,
          [targetMac]: { phase:"idle", lastChange:Date.now() }
        }))
      }
    } else {
      log(`[cmd] ${action} → ${masterId}${targetMac?" ▶ "+targetMac:""}`)
      // on passe la phase "send" direct (on suppose que la commande part vers supabase)
      if(targetMac){
        setCmdPhaseBySlave(prev=>({
          ...prev,
          [targetMac]: { phase:"send", lastChange:Date.now() }
        }))
      }
    }
  }

  // auto-hide barre noire quand phase='acked' depuis > CMD_BAR_HIDE_MS
  useEffect(()=>{
    const t = setInterval(()=>{
      setCmdPhaseBySlave(prev=>{
        const now=Date.now()
        const next={...prev}
        for(const mac in prev){
          const st = prev[mac]
          if(st.phase==="acked" && now - st.lastChange > CMD_BAR_HIDE_MS){
            next[mac] = { phase:"idle", lastChange:now }
          }
        }
        return next
      })
    },200)
    return ()=>clearInterval(t)
  },[])

  async function renameMaster(id){
    const newName = prompt("Nouveau nom du master ?","")
    if(!newName) return
    const {error} = await sb
      .from('devices')
      .update({name:newName})
      .eq('id',id)
    if(error){
      alert(error.message)
    } else {
      log(`Renommé ${id} → ${newName}`)
    }
  }

  async function deleteDevice(id){
    if(!confirm(`Supprimer ${id} ?`)) return
    const {data:{session}} = await sb.auth.getSession()
    if(!session){
      alert("Non connecté")
      return
    }
    const r=await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        apikey:SUPA_ANON,
        Authorization:`Bearer ${session.access_token}`
      },
      body:JSON.stringify({ master_id:id })
    })
    log(r.ok?`MASTER supprimé : ${id}`:`❌ Suppression : ${await r.text()}`)
  }

  // rename slave (friendly_name)
  async function submitRenameSlave(mac){
    // TODO: faire une edge function "rename_node" sécurisée
    // Pour l’instant on log juste
    log(`rename slave ${mac} -> ${editNames[mac]}`)
    // après implémentation edge function, on fera un fetch(...) ici
  }

  /* toggle panneau info / more */
  function toggleSlaveInfo(mac){
    setOpenSlaveInfo(m=>({...m,[mac]:!m[mac]}))
  }
  function toggleSlaveMore(mac){
    setOpenSlaveMore(m=>({...m,[mac]:!m[mac]}))
  }
  function handleEditNameChange(mac,val){
    setEditNames(m=>({...m,[mac]:val}))
  }

  /* wrappers commandes slaves */
  function handleSlaveIO(masterId,mac){
    sendCmd(masterId,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1})
  }
  function handleSlaveReset(masterId,mac){
    sendCmd(masterId,mac,"SLV_RESET",{})
  }
  function handleSlaveForceOff(masterId,mac){
    sendCmd(masterId,mac,"SLV_FORCE_OFF",{})
  }
  function handleSlaveHardReset(masterId,mac){
    sendCmd(masterId,mac,"SLV_HARD_RESET",{ms:3000})
  }

  /* commandes globales master */
  function handlePulse(mid){
    sendCmd(mid,null,"PULSE",{ms:500})
  }
  function handlePwrOn(mid){
    sendCmd(mid,null,"POWER_ON",{})
  }
  function handlePwrOff(mid){
    sendCmd(mid,null,"POWER_OFF",{})
  }
  function handleResetMaster(mid){
    sendCmd(mid,null,"RESET",{})
  }

  /* ---------- AUTH INIT ---------- */
  useEffect(()=>{
    const sub = sb.auth.onAuthStateChange((_ev,session)=>{
      setUser(session?.user||null)
      setAuthReady(true)
      if(session?.user){
        attachRealtime()
        loadAll()
      }else{
        cleanupRealtime()
        setDevices([])
        setNodesByMaster({})
      }
    })
    ;(async()=>{
      const {data:{session}} = await sb.auth.getSession()
      setUser(session?.user||null)
      setAuthReady(true)
      if(session?.user){
        attachRealtime()
        loadAll()
      }
    })()

    return ()=>{ sub.data.subscription.unsubscribe() }
    // eslint-disable-next-line
  },[])

  /* ---------- UI haut / login ---------- */
  function handleLogin(){
    sb.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo:location.href,
        queryParams:{prompt:"select_account"}
      }
    }).then(({data,error})=>{
      if(error) alert(error.message)
      else if(data?.url) location.href=data.url
    })
  }
  function handleLogout(){
    sb.auth.signOut()
  }

  /* ---------- RENDU ---------- */

  if(!authReady){
    // petit splash translucide
    return (
      <>
        <style>{styles}</style>
        <div className="app-shell">
          <div className="app-header">
            <div className="app-header-left">
              <span>REMOTE POWER</span>
            </div>
            <div className="app-header-right">
              <span className="badge-small">Chargement…</span>
            </div>
          </div>
          <div className="main-area">
            <div className="content-wrap">
              <div className="log-block">
                Initialisation…
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const headerStatus = user
    ? <span className="badge-small">Connecté</span>
    : <span className="badge-small">Hors ligne</span>

  return (
    <>
      <style>{styles}</style>

      <div className="app-shell">

        {/* Top bar */}
        <div className="app-header">
          <div className="app-header-left">
            <span>REMOTE POWER</span>
          </div>
          <div className="app-header-right">
            <span>{headerStatus}</span>
            <span>{user?.email || "non connecté"}</span>
            {!user && (
              <button className="small-link-btn" onClick={handleLogin}>
                Connexion Google
              </button>
            )}
            {user && (
              <button className="small-link-btn" onClick={handleLogout}>
                Déconnexion
              </button>
            )}
            {user && (
              <button className="small-link-btn" onClick={async ()=>{
                // demande un code d'appairage pour nouveau MASTER
                const {data:{session}} = await sb.auth.getSession()
                if(!session){alert("Non connecté");return}
                try{
                  const r=await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`,{
                    method:"POST",
                    headers:{
                      "Content-Type":"application/json",
                      apikey:SUPA_ANON,
                      Authorization:`Bearer ${session.access_token}`
                    },
                    body:JSON.stringify({ ttl_minutes:10 })
                  })
                  if(!r.ok){
                    alert(await r.text())
                    return
                  }
                  const {code,expires_at} = await r.json()
                  log(`Pair-code ${code} (expire ${expires_at})`)
                  alert(`Code d'appairage : ${code}`)
                }catch(e){
                  log("Erreur pair-code: "+e)
                }
              }}>
                + Ajouter un MASTER
              </button>
            )}
          </div>
        </div>

        {/* Corps */}
        <div className="main-area">
          <div className="content-wrap">

            {/* Liste des masters */}
            {devices.map(dev=>{
              const live = isLive(dev)
              const statusText = live ? "EN LIGNE" : "HORS LIGNE"
              const slaves = nodesByMaster[dev.id] || []

              return (
                <MasterCard
                  key={dev.id}
                  dev={dev}
                  slaves={slaves}
                  statusText={statusText}

                  onRenameMaster={()=>renameMaster(dev.id)}
                  onDeleteMaster={()=>deleteDevice(dev.id)}

                  onPulse={()=>handlePulse(dev.id)}
                  onPwrOn={()=>handlePwrOn(dev.id)}
                  onPwrOff={()=>handlePwrOff(dev.id)}
                  onResetMaster={()=>handleResetMaster(dev.id)}

                  cmdPhaseBySlave={cmdPhaseBySlave}

                  onSlaveIO={(mac)=>handleSlaveIO(dev.id,mac)}
                  onSlaveReset={(mac)=>handleSlaveReset(dev.id,mac)}
                  onSlaveMoreToggle={(mac)=>toggleSlaveMore(mac)}
                  onSlaveForceOff={(mac)=>handleSlaveForceOff(dev.id,mac)}
                  onSlaveHardReset={(mac)=>handleSlaveHardReset(dev.id,mac)}

                  onSlaveToggleInfo={(mac)=>toggleSlaveInfo(mac)}
                  openSlaveInfo={openSlaveInfo}
                  openSlaveMore={openSlaveMore}

                  editNames={editNames}
                  onEditNameChange={handleEditNameChange}
                  onSubmitRenameSlave={submitRenameSlave}
                />
              )
            })}

            {/* Journal global */}
            <div className="log-block" ref={logRef}>
              {lines.join("\n")}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
