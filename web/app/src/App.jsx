import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ========= CONFIG ========= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPA_ANON) {
  throw new Error(
    "Configuration manquante\n" +
    "Définis les variables d’environnement Vite :\n" +
    "VITE_SUPABASE_URL\nVITE_SUPABASE_ANON_KEY"
  );
}
const sb = createClient(SUPABASE_URL, SUPA_ANON);

const DEFAULT_IO_PIN = 26;            // pin IO par défaut côté SLAVE
const LIVE_TTL_MS = 25_000;           // un master est « en ligne » si last_seen < 25s

/* ========= THEME (flat, light/dark) ========= */
const css = `
:root{
  --bg:#f5f5f7; --panel:rgba(255,255,255,.72); --card:#fff; --stroke:#e5e5ea;
  --fg:#1d1d1f; --muted:#6e6e73; --chip:#f2f2f7;
  --btn:#f2f2f7; --btn-h:#ededf1;
  --blue:#0a84ff; --blue-soft:#5b8dff; --danger:#ff3b30;
  --ok-bg:#e8f0ff; --ok-fg:#0a84ff; --ok-bd:#c8d8ff;
  --ko-bg:#f2f2f7; --ko-fg:#6e6e73; --ko-bd:#e5e5ea;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0b0b0f; --panel:rgba(16,16,20,.7); --card:#121217; --stroke:#2b2b33;
    --fg:#f5f5f7; --muted:#a1a1aa; --chip:#1a1a21;
    --btn:#1a1a21; --btn-h:#22222a;
    --blue:#8ab4ff; --blue-soft:#6fa0ff; --danger:#ff6b5e;
    --ok-bg:#0b1f3b; --ok-fg:#8ab4ff; --ok-bd:#1c355b;
    --ko-bg:#121217; --ko-fg:#a1a1aa; --ko-bd:#2b2b33;
  }
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);
     font:14px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',Segoe UI,Roboto,Arial,Helvetica,sans-serif}
header{position:sticky;top:0;z-index:10;backdrop-filter:saturate(180%) blur(8px);
       background:var(--panel);border-bottom:1px solid var(--stroke);
       padding:14px 18px}
h1{margin:0;font-size:18px;letter-spacing:.25px}
small, .small{color:var(--muted);font-size:12px}
a{color:var(--blue)}
.btn{border:1px solid var(--stroke);background:var(--btn);color:var(--fg);
     padding:9px 12px;border-radius:16px;cursor:pointer;transition:background .15s}
.btn:hover{background:var(--btn-h)}
.btn.ghost{background:transparent}
.btn.tiny{padding:6px 10px;border-radius:12px;font-size:12px}
.btn.text-blue{color:var(--blue)}
.btn.text-danger{color:var(--danger)}
.badge{font-size:12px;border:1px solid var(--ko-bd);padding:3px 8px;border-radius:999px}
.badge.ok{background:var(--ok-bg);color:var(--ok-fg);border-color:var(--ok-bd)}
.badge.ko{background:var(--ko-bg);color:var(--ko-fg);border-color:var(--ko-bd)}
main{max-width:1100px;margin:16px auto;padding:0 14px;display:flex;flex-direction:column;gap:14px}
.card{background:var(--card);border:1px solid var(--stroke);border-radius:22px;padding:16px}
.masterHead{display:flex;justify-content:space-between;gap:10px;align-items:center}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.right{margin-left:auto}
.hr{height:1px;background:var(--stroke);margin:8px 0}
.meta{font-size:12px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.slave{display:flex;flex-direction:column;gap:10px;border:1px solid var(--stroke);border-radius:18px;padding:12px;background:var(--card)}
.chip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--stroke);
      background:var(--chip);border-radius:999px;padding:2px 8px;font-size:12px}
.mac{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;max-width:12ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.knob{width:92px;height:92px;margin:2px auto 0;border-radius:50%;border:4px solid var(--stroke);
      display:flex;align-items:center;justify-content:center;position:relative;background:
      linear-gradient(180deg,rgba(255,255,255,.08),rgba(0,0,0,.04))}
.led{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;border:2px solid var(--stroke);background:#6b7280}
.addTile{background:var(--btn);border:1px dashed var(--stroke);border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:18px;color:var(--muted)}
.powerBtn{width:58px;height:58px;border-radius:50%;border:1px solid var(--stroke);background:var(--btn);display:flex;align-items:center;justify-content:center}
.powerIcon{font-size:20px;color:var(--blue)}
.cmdTitle{color:var(--muted);font-size:12px}
.cmdList{margin:0;padding-left:18px;max-height:150px;overflow:auto}
.log{white-space:pre-wrap;background:rgba(0,0,0,.1);border:1px solid var(--stroke);border-radius:14px;padding:10px;height:140px;overflow:auto}
`;

/* ========= HELPERS ========= */
const fmtTS  = s => (s ? new Date(s).toLocaleString() : "—");
const isLive = d => d.last_seen && Date.now() - new Date(d.last_seen) < LIVE_TTL_MS;

/* ========= APP ========= */
export default function App(){
  /* auth & data */
  const [user,setUser]=useState(null);
  const [devices,setDevices]=useState([]);                 // masters
  const [nodesByMaster,setNodesByMaster]=useState({});     // { master_id : [mac,...] }
  const [pair,setPair]=useState({open:false,code:null,expires_at:null});

  /* logs */
  const [lines,setLines]=useState([]);
  const logRef=useRef(null);
  const log = t => setLines(ls=>[...ls,`${new Date().toLocaleTimeString()}  ${t}`]);
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight },[lines]);

  /* command lists per master */
  const cmdLists=useRef(new Map());
  function upsertCmdRow(masterId, c){
    const ul = cmdLists.current.get(masterId); if(!ul) return;
    const id=`cmd-${c.id}`;
    const html = `<code>${c.status}</code> · ${c.action}${c.target_mac?' → '+c.target_mac:' (local)'} <span class="small">· ${fmtTS(c.created_at)}</span>`;
    let li = ul.querySelector(`#${CSS.escape(id)}`);
    if(!li){ li=document.createElement('li'); li.id=id; li.innerHTML=html; ul.prepend(li); while(ul.children.length>20) ul.removeChild(ul.lastChild) }
    else { li.innerHTML=html; }
  }

  /* auth bootstrap */
  useEffect(()=>{
    const sub = sb.auth.onAuthStateChange((ev,session)=>{
      setUser(session?.user||null);
      if(session?.user){ attachRealtime(); loadAll(); }
      else { cleanupRealtime(); setDevices([]); setNodesByMaster({}); }
    });
    (async()=>{ const {data:{session}} = await sb.auth.getSession(); setUser(session?.user||null); if(session?.user){ attachRealtime(); loadAll(); } })();
    return ()=>sub.data.subscription.unsubscribe();
    // eslint-disable-next-line
  },[]);

  /* realtime */
  const chDevices=useRef(null), chNodes=useRef(null), chCmds=useRef(null);
  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current)   sb.removeChannel(chNodes.current);
    if(chCmds.current)    sb.removeChannel(chCmds.current);
    chDevices.current=chNodes.current=chCmds.current=null;
  }
  function attachRealtime(){
    cleanupRealtime();
    chDevices.current = sb.channel("rt:devices")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'devices'}, p => { log(`+ device ${p.new.id}`); setDevices(ds=>[p.new,...ds]); refreshCommands(p.new.id); })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'devices'}, p => { const d=p.new; setDevices(ds=>ds.map(x=>x.id===d.id?{...x,...d}:x)); })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'devices'}, p => { log(`- device ${p.old.id}`); setDevices(ds=>ds.filter(x=>x.id!==p.old.id)); })
      .subscribe();
    chNodes.current = sb.channel("rt:nodes")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'nodes'}, p => { log(`+ node ${p.new.slave_mac} → ${p.new.master_id}`); refreshSlavesFor(p.new.master_id); })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'nodes'}, p => { log(`- node ${p.old.slave_mac} ← ${p.old.master_id}`); refreshSlavesFor(p.old.master_id); })
      .subscribe();
    chCmds.current = sb.channel("rt:commands")
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'commands'}, p => { upsertCmdRow(p.new.master_id,p.new); log(`cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`); })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'commands'}, p => { upsertCmdRow(p.new.master_id,p.new); log(`cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`); })
      .subscribe();
  }

  /* queries */
  async function loadAll(){
    const {data:devs,error:ed}=await sb
      .from('devices').select('id,name,master_mac,last_seen,online')
      .order('created_at',{ascending:false});
    if(ed){ log("Err devices: "+ed.message); return; }
    setDevices(devs||[]);
    const {data:nodes,error:en}=await sb.from('nodes').select('master_id,slave_mac');
    if(en){ log("Err nodes: "+en.message); return; }
    const map={}; (nodes||[]).forEach(n => { (map[n.master_id]??=[]).push(n.slave_mac); });
    setNodesByMaster(map);
    for(const d of devs||[]) await refreshCommands(d.id);
  }
  async function refreshCommands(mid){
    const {data,error}=await sb.from('commands')
      .select('id,action,target_mac,status,created_at')
      .eq('master_id',mid).order('created_at',{ascending:false}).limit(20);
    if(error){ log("Err cmds: "+error.message); return; }
    const ul=cmdLists.current.get(mid); if(!ul) return;
    ul.innerHTML=""; (data||[]).forEach(c => upsertCmdRow(mid,c));
  }
  async function refreshSlavesFor(mid){
    const {data}=await sb.from('nodes').select('slave_mac').eq('master_id',mid);
    setNodesByMaster(m => ({...m,[mid]:(data||[]).map(x=>x.slave_mac)}));
  }

  /* commands */
  async function sendCmd(mid,mac,action,payload={}){
    const {error}=await sb.from('commands').insert({master_id:mid,target_mac:mac||null,action,payload});
    if(error) log("cmd err: "+error.message);
    else log(`[cmd] ${action} → ${mid}${mac?" ▶ "+mac:""}`);
  }
  async function renameMaster(id){
    const name=prompt("Nouveau nom du master ?",""); if(!name) return;
    const {error}=await sb.from('devices').update({name}).eq('id',id);
    if(error) alert(error.message); else log(`Renommé ${id} → ${name}`);
  }
  async function deleteDevice(id){
    if(!confirm(`Supprimer ${id} ?`)) return;
    const {data:{session}}=await sb.auth.getSession(); if(!session){alert("Non connecté"); return;}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", apikey:SUPA_ANON, Authorization:`Bearer ${session.access_token}` },
      body:JSON.stringify({ master_id:id })
    });
    log(r.ok?`MASTER supprimé : ${id}`:`❌ Suppression : ${await r.text()}`);
  }
  async function openPairDialog(){
    const {data:{session}}=await sb.auth.getSession(); if(!session){alert("Non connecté"); return;}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", apikey:SUPA_ANON, Authorization:`Bearer ${session.access_token}` },
      body:JSON.stringify({ ttl_minutes:10 })
    });
    if(!r.ok){ alert(await r.text()); return; }
    const {code,expires_at}=await r.json();
    setPair({open:true,code,expires_at});
    log(`Pair-code ${code}`);
  }

  /* header actions */
  const userControls = (
    <div className="row">
      <span className="small">{user?.email || "non connecté"}</span>
      {!user
        ? <button className="btn text-blue" onClick={async ()=>{
            const {data,error}=await sb.auth.signInWithOAuth({
              provider:"google",
              options:{redirectTo:location.href,queryParams:{prompt:"select_account"}}
            });
            if(error) alert(error.message); else if(data?.url) location.href=data.url;
          }}>Connexion Google</button>
        : <button className="btn ghost" onClick={()=>sb.auth.signOut()}>Déconnexion</button>}
    </div>
  );

  /* render */
  return (
    <>
      <style>{css}</style>

      <header>
        <div className="row" style={{justifyContent:"space-between"}}>
          <h1>REMOTE POWER</h1>
          {userControls}
        </div>
      </header>

      <main>
        <div className="row" style={{justifyContent:"space-between"}}>
          <span className="small">Compte : {user?.email || "—"}</span>
          <div className="row">
            <button className="btn text-blue" onClick={openPairDialog}>Ajouter un MASTER</button>
            <button className="btn" onClick={loadAll}>Rafraîchir</button>
          </div>
        </div>

        {devices.map(d=>{
          const live=isLive(d);
          const slaves=nodesByMaster[d.id]||[];

          return (
            <section key={d.id} className="card">
              {/* master head */}
              <div className="masterHead">
                <div className="row">
                  <strong style={{fontSize:16}}>MASTER</strong>
                  <span className={`badge ${live?'ok':'ko'}`}>{live?'EN LIGNE':'HORS LIGNE'}</span>
                </div>
                <div className="row">
                  <button className="btn tiny" onClick={()=>renameMaster(d.id)}>Renommer</button>
                  <button className="btn tiny text-danger ghost" onClick={()=>deleteDevice(d.id)}>Supprimer</button>
                </div>
              </div>

              {/* meta */}
              <div className="meta">
                ID : <code>{d.id}</code> · MAC : <span style={{color:'var(--blue)'}}>{d.master_mac||'—'}</span> · Dernier contact : {fmtTS(d.last_seen)||'jamais'}
              </div>

              {/* slaves grid */}
              <div className="grid" style={{marginTop:8}}>
                {slaves.map(mac=>(
                  <article key={mac} className="slave">
                    <div className="row" style={{justifyContent:"space-between"}}>
                      <div className="row" style={{gap:6,minWidth:0}}>
                        <span style={{fontWeight:700,color:'var(--blue)'}}>SLAVE</span>
                        <span className="chip">
                          <span>⚙️</span>
                          <span className="mac">{mac}</span>
                        </span>
                      </div>
                    </div>

                    <div className="knob">
                      <span style={{fontSize:11,opacity:.8}}>PHOTO</span>
                      <span className="led" id={`led-${mac}`}></span>
                    </div>

                    <div className="row" style={{justifyContent:"center"}}>
                      <button
                        className="powerBtn"
                        title="Impulsion (IO)"
                        onClick={()=>{
                          // IO ON pulse
                          sendCmd(d.id,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1});
                          const led=document.getElementById(`led-${mac}`); if(led){ led.style.background='var(--ok-fg)'; setTimeout(()=>led.style.background='#6b7280',600); }
                        }}>
                        <span className="powerIcon">⏻</span>
                      </button>
                    </div>

                    <div className="row" style={{gap:8,flexWrap:"wrap"}}>
                      <button className="btn tiny" onClick={()=>sendCmd(d.id,mac,"SLV_RESET",{})}>Reset</button>
                      <button className="btn tiny" onClick={()=>sendCmd(d.id,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:0})}>Off</button>
                      <button className="btn tiny text-blue ghost" onClick={()=>sendCmd(d.id,mac,"SLV_FORCE_OFF",{})}>Hard Stop</button>
                      <button className="btn tiny text-blue ghost" onClick={()=>sendCmd(d.id,mac,"SLV_HARD_RESET",{ms:3000})}>Hard Reset</button>
                    </div>
                  </article>
                ))}

                {/* add tile (visuel) */}
                <div className="addTile" title="Ajouter un SLAVE (via bouton PAIR du MASTER)">
                  <div style={{fontSize:44,lineHeight:1,color:'var(--blue)'}}>＋</div>
                  <div className="small">Ajouter un SLAVE</div>
                </div>
              </div>

              <div className="hr" />

              <div className="row" style={{gap:8,flexWrap:"wrap"}}>
                <button className="btn tiny text-blue ghost" onClick={()=>sendCmd(d.id,null,"PULSE",{ms:500})}>⚡ Pulse 500 ms</button>
                <button className="btn tiny text-blue ghost" onClick={()=>sendCmd(d.id,null,"POWER_ON",{})}>🔌 Power ON</button>
                <button className="btn tiny text-blue ghost" onClick={()=>sendCmd(d.id,null,"POWER_OFF",{})}>⏹️ Power OFF</button>
                <button className="btn tiny text-blue ghost" onClick={()=>sendCmd(d.id,null,"RESET",{})}>↻ Reset</button>
                <span className="right small">Nom : <strong>{d.name||d.id}</strong></span>
              </div>

              <div className="hr" />
              <div className="cmdTitle">Commandes (20 dernières)</div>
              <ul className="cmdList" ref={el=>{ if(el) cmdLists.current.set(d.id,el); }}/>
            </section>
          );
        })}

        {/* Journal */}
        <div>
          <h3 style={{margin:"8px 0"}}>Journal</h3>
          <div className="log" ref={logRef}>{lines.join("\n")}</div>
        </div>
      </main>

      {/* Pair-code dialog */}
      {pair.open && (
        <dialog open onClose={()=>setPair({open:false,code:null,expires_at:null})} className="card" style={{border:'none',maxWidth:420}}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <h3 style={{margin:"6px 0"}}>Appairer un MASTER</h3>
            <div>Code : <code style={{fontSize:18}}>{String(pair.code).padStart(6,"0")}</code>
              {" "} (expire <span className="small">
                {(()=>{
                  const end = pair.expires_at ? new Date(pair.expires_at).getTime() : 0;
                  const l = Math.max(0,Math.floor((end-Date.now())/1000));
                  return `${Math.floor(l/60)}:${String(l%60).padStart(2,'0')}`;
                })()}
              </span>)
            </div>
            <div className="small">Saisis ce code dans le portail Wi-Fi de l’ESP32.</div>
            <div className="row" style={{justifyContent:"flex-end"}}>
              <button className="btn" onClick={()=>setPair({open:false,code:null,expires_at:null})}>Fermer</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
