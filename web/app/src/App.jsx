import { useEffect, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPA_ANON)

const DEFAULT_IO_PIN = 26
const LIVE_TTL_MS = 25_000

const styles = `
:root{--bg:#0f172a;--fg:#e2e8f0;--muted:#94a3b8;--card:#111827;--btn:#1f2937}
html,body,#root{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,Segoe UI,Roboto,Arial}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #243045}
h1{font-size:18px;margin:0}
.row{display:flex;gap:10px;align-items:center}
button{background:var(--btn);border:1px solid #2b364c;border-radius:8px;color:var(--fg);padding:8px 12px;cursor:pointer}
button:hover{filter:brightness(1.08)}
.primary{background:#2563eb;border-color:#1d4ed8}
.danger{background:#7f1d1d;border-color:#991b1b}
.muted{color:var(--muted)}
main{max-width:980px;margin:24px auto;padding:0 16px}
.card{background:var(--card);border:1px solid #243045;border-radius:12px;padding:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.dev{display:flex;flex-direction:column;gap:8px}
.head{display:flex;justify-content:space-between;gap:8px;align-items:center}
.badge{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid #243045}
.on{background:#0b3b2e;color:#86efac;border-color:#14532d}
.off{background:#3b1a1a;color:#fecaca;border-color:#7f1d1d}
.meta,.slaves{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:2px}
.actions{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:6px;background:#334155;border-radius:999px;padding:2px 8px;margin:1px}
.chip .mac{font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px}
.chip .mini{display:flex;gap:6px}
.log{white-space:pre-wrap;background:#0b1220;border:1px solid #243045;border-radius:10px;padding:10px;height:160px;overflow:auto}
code{background:#0b1220;border:1px solid #243045;border-radius:6px;padding:2px 6px}
.cmds{margin:6px 0 0;padding-left:18px;font-size:12px}
.sep{height:1px;background:#243045;margin:8px 0}
.right{margin-left:auto}
.tiny{font-size:11px;padding:3px 6px}
dialog{border:1px solid #243045;border-radius:12px;background:var(--card);color:var(--fg);padding:0;max-width:420px}
dialog .dlg{padding:16px;display:flex;flex-direction:column;gap:10px}
`

const fmtTS  = s => (s ? new Date(s).toLocaleString() : "—")
const isLive = d => d.last_seen && Date.now()-new Date(d.last_seen) < LIVE_TTL_MS

export default function App(){
  const [user,setUser]=useState(null)
  const [devices,setDevices]=useState([])
  const [nodesByMaster,setNodesByMaster]=useState({})
  const [pair,setPair]=useState({open:false,code:null,expires_at:null})
  const logRef=useRef(null)
  const [lines,setLines]=useState([])
  const log = t => { setLines(ls=>[...ls,`${new Date().toLocaleTimeString()}  ${t}`]) }

  const cmdLists=useRef(new Map())
  function upsertCmdRow(masterId, c){
    const ul = cmdLists.current.get(masterId); if(!ul) return
    const id=`cmd-${c.id}`
    const html = `<code>${c.status}</code> · ${c.action}${c.target_mac?' → '+c.target_mac:' (local)'} <span class="muted">· ${fmtTS(c.created_at)}</span>`
    let li = ul.querySelector(`#${CSS.escape(id)}`)
    if(!li){ li=document.createElement('li'); li.id=id; li.innerHTML=html; ul.prepend(li); while(ul.children.length>20) ul.removeChild(ul.lastChild) }
    else { li.innerHTML=html }
  }

  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight },[lines])

  // Auth bootstrap
  useEffect(()=>{
    const sub = sb.auth.onAuthStateChange((ev,session)=>{
      setUser(session?.user||null)
      if(session?.user){ attachRealtime(); loadAll() } else { cleanupRealtime(); setDevices([]); setNodesByMaster({}) }
    })
    ;(async()=>{ const {data:{session}} = await sb.auth.getSession(); setUser(session?.user||null); if(session?.user){ attachRealtime(); loadAll() } })()
    return ()=>sub.data.subscription.unsubscribe()
    // eslint-disable-next-line
  },[])

  const chDevices=useRef(null), chNodes=useRef(null), chCmds=useRef(null)
  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current)
    if(chNodes.current)   sb.removeChannel(chNodes.current)
    if(chCmds.current)    sb.removeChannel(chCmds.current)
    chDevices.current=chNodes.current=chCmds.current=null
  }
  function attachRealtime(){
    cleanupRealtime()
    chDevices.current = sb.channel("rt:devices")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'devices'}, p => { log(`+ device ${p.new.id}`); setDevices(ds=>[p.new,...ds]); refreshCommands(p.new.id) })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'devices'}, p => { const d=p.new; setDevices(ds=>ds.map(x=>x.id===d.id?{...x,...d}:x)) })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'devices'}, p => { log(`- device ${p.old.id}`); setDevices(ds=>ds.filter(x=>x.id!==p.old.id)) })
      .subscribe(s=>s==='SUBSCRIBED'&&log('Realtime devices ON'))

    chNodes.current = sb.channel("rt:nodes")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'nodes'}, p => { log(`+ node ${p.new.slave_mac} → ${p.new.master_id}`); refreshSlavesFor(p.new.master_id) })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'nodes'}, p => { log(`- node ${p.old.slave_mac} ← ${p.old.master_id}`); refreshSlavesFor(p.old.master_id) })
      .subscribe(s=>s==='SUBSCRIBED'&&log('Realtime nodes ON'))

    chCmds.current = sb.channel("rt:commands")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'commands'}, p => { upsertCmdRow(p.new.master_id,p.new); log(`cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`) })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'commands'}, p => { upsertCmdRow(p.new.master_id,p.new); log(`cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`) })
      .subscribe(s=>s==='SUBSCRIBED'&&log('Realtime commands ON'))
  }

  async function loadAll(){
    const {data:devs,error:ed}=await sb.from('devices').select('id,name,master_mac,last_seen,online').order('created_at',{ascending:false})
    if(ed){ log("Err devices: "+ed.message); return }
    setDevices(devs||[])
    const {data:nodes,error:en}=await sb.from('nodes').select('master_id,slave_mac')
    if(en){ log("Err nodes: "+en.message); return }
    const map={}; (nodes||[]).forEach(n => { (map[n.master_id]??=[]).push(n.slave_mac) })
    setNodesByMaster(map)
    for(const d of devs||[]) await refreshCommands(d.id)
  }

  async function refreshCommands(mid){
    const {data,error}=await sb.from('commands').select('id,action,target_mac,status,created_at').eq('master_id',mid).order('created_at',{ascending:false}).limit(20)
    if(error){ log("Err cmds: "+error.message); return }
    const ul=cmdLists.current.get(mid); if(!ul) return
    ul.innerHTML=""; (data||[]).forEach(c => upsertCmdRow(mid,c))
  }

  async function refreshSlavesFor(mid){
    const {data}=await sb.from('nodes').select('slave_mac').eq('master_id',mid)
    setNodesByMaster(m => ({...m,[mid]:(data||[]).map(x=>x.slave_mac)}))
  }

  async function sendCmd(mid,mac,action,payload={}){
    const {error}=await sb.from('commands').insert({master_id:mid,target_mac:mac||null,action,payload})
    if(error) log("cmd err: "+error.message)
    else log(`[cmd] ${action} → ${mid}${mac?" ▶ "+mac:""}`)
  }

  async function renameMaster(id){
    const name=prompt("Nouveau nom du master ?",""); if(!name) return
    const {error}=await sb.from('devices').update({name}).eq('id',id)
    if(error) alert(error.message); else log(`Renommé ${id} → ${name}`)
  }

  async function deleteDevice(id){
    if(!confirm(`Supprimer ${id} ?`)) return
    const {data:{session}}=await sb.auth.getSession(); if(!session){alert("Non connecté"); return}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", apikey:SUPA_ANON, Authorization:`Bearer ${session.access_token}` },
      body:JSON.stringify({ master_id:id })
    })
    log(r.ok?`MASTER supprimé : ${id}`:`❌ Suppression : ${await r.text()}`)
  }

  async function openPairDialog(){
    const {data:{session}}=await sb.auth.getSession(); if(!session){alert("Non connecté"); return}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", apikey:SUPA_ANON, Authorization:`Bearer ${session.access_token}` },
      body:JSON.stringify({ ttl_minutes:10 })
    })
    if(!r.ok){ alert(await r.text()); return }
    const {code,expires_at}=await r.json()
    setPair({open:true,code,expires_at})
    log(`Pair-code ${code}`)
  }

  return (
    <>
      <style>{styles}</style>

      <header>
        <h1>Remote Power • MASTER</h1>
        <div className="row">
          <span className="muted">{user?.email || "non connecté"}</span>
          {!user
            ? <button className="primary" onClick={async ()=>{
                const {data,error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.href,queryParams:{prompt:"select_account"}}})
                if(error) alert(error.message); else if(data?.url) location.href=data.url
              }}>Connexion Google</button>
            : <button onClick={()=>sb.auth.signOut()}>Déconnexion</button>}
        </div>
      </header>

      <main>
        <div className="row" style={{justifyContent:"space-between",marginBottom:12}}>
          <div className="muted">Compte : <span>{user?.email || "—"}</span></div>
          <div className="row">
            <button className="primary" onClick={openPairDialog}>Ajouter un MASTER</button>
            <button onClick={loadAll}>Rafraîchir</button>
          </div>
        </div>

        <div className="grid">
          {devices.length===0
            ? <div className="muted">Aucun MASTER.</div>
            : devices.map(d=>{
                const live=isLive(d)
                const slaves=nodesByMaster[d.id]||[]
                return (
                  <div key={d.id} className="card dev">
                    <div className="head">
                      <div className="title">{d.name||d.id}</div>
                      <span className={`badge ${live?'on':'off'}`}>{live?'En ligne':'Hors ligne'}</span>
                    </div>

                    <div className="meta">
                      ID : <span className="id">{d.id}</span><br/>
                      MAC : <span className="mac">{d.master_mac||'—'}</span><br/>
                      Dernier contact : <span className="last">{fmtTS(d.last_seen)||'jamais'}</span>
                    </div>

                    <div className="slaves">
                      {slaves.length
                        ? <>Slaves : {slaves.map(mac=>(
                            <span className="chip" key={mac}>
                              <span className="mac">{mac}</span>
                              <span className="mini">
                                <button className="tiny" onClick={()=>sendCmd(d.id,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1})}>IO ON</button>
                                <button className="tiny" onClick={()=>sendCmd(d.id,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:0})}>IO OFF</button>
                                <button className="tiny" onClick={()=>sendCmd(d.id,mac,"SLV_RESET",{})}>Reset</button>
                                <button className="tiny" onClick={()=>sendCmd(d.id,mac,"SLV_FORCE_OFF",{})}>Force OFF</button>
                                <button className="tiny" onClick={()=>sendCmd(d.id,mac,"SLV_HARD_RESET",{ms:3000})}>Hard 3s</button>
                              </span>
                            </span>
                          ))}</>
                        : "Aucun slave."
                      }
                    </div>

                    <div className="actions">
                      <button onClick={()=>renameMaster(d.id)}>Renommer</button>
                      <button onClick={()=>sendCmd(d.id,null,"PULSE",{ms:500})}>Pulse 500 ms</button>
                      <button onClick={()=>sendCmd(d.id,null,"POWER_ON",{})}>Power ON</button>
                      <button onClick={()=>sendCmd(d.id,null,"POWER_OFF",{})}>Power OFF</button>
                      <button onClick={()=>sendCmd(d.id,null,"RESET",{})}>Reset</button>
                      <button className="danger right" onClick={()=>deleteDevice(d.id)}>Supprimer</button>
                    </div>

                    <div className="sep"/>
                    <div className="muted" style={{fontSize:12}}>Commandes (20 dernières)</div>
                    <ul className="cmds" ref={el=>{ if(el) cmdLists.current.set(d.id,el) }}/>
                  </div>
                )
              })}
        </div>

        <h3>Journal</h3>
        <div className="log" ref={logRef}>{lines.join("\n")}</div>
      </main>

      {pair.open && (
        <dialog open onClose={()=>setPair({open:false,code:null,expires_at:null})}>
          <div className="dlg">
            <h3>Appairer un MASTER</h3>
            <div>Code : <code>{String(pair.code).padStart(6,"0")}</code>
              {" "} (expire <span className="muted">
                {(()=>{
                  const end = pair.expires_at ? new Date(pair.expires_at).getTime() : 0
                  const l = Math.max(0, Math.floor((end - Date.now())/1000))
                  return `${Math.floor(l/60)}:${String(l%60).padStart(2,'0')}`
                })()}
              </span>)
            </div>
            <div className="muted">Saisis ce code dans le portail Wi-Fi de l’ESP32.</div>
            <div className="row" style={{justifyContent:"flex-end"}}>
              <button onClick={()=>setPair({open:false,code:null,expires_at:null})}>Fermer</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  )
}
