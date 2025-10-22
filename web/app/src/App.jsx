import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   SUPABASE (identique à ta base)
   ========================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPA_ANON);

/* =========================
   CONSTANTES
   ========================= */
const DEFAULT_IO_PIN = 26;
const LIVE_TTL_MS = 25_000;
const fmtTS  = s => (s ? new Date(s).toLocaleString() : "—");
const isLive = d => d.last_seen && Date.now() - new Date(d.last_seen) < LIVE_TTL_MS;

/* =========================
   THEME (light/dark) – palette limitée
   ========================= */
const THEME = {
  light: {
    bg: "#f5f5f7",
    panel: "rgba(255,255,255,0.7)",
    card: "#ffffff",
    stroke: "#e5e5ea",
    fg: "#1d1d1f",
    muted: "#6e6e73",
    chip: "#f2f2f7",
    // states
    okBg: "#e8f0ff",
    okFg: "#0a84ff",
    okBorder: "#c8d8ff",
    koBg: "#f2f2f7",
    koFg: "#6e6e73",
    koBorder: "#e5e5ea",
    // controls
    btn: "#f2f2f7",
    btnHover: "#ececf1",
    // accents
    blue: "#0a84ff",
    red: "#ff3b30",
    txtBlue: "#0a84ff",
    txtBlueMuted: "#5b8dff",
    txtRed: "#ff3b30",
  },
  dark: {
    bg: "#0b0b0f",
    panel: "rgba(16,16,20,0.7)",
    card: "#121217",
    stroke: "#2b2b33",
    fg: "#f5f5f7",
    muted: "#a1a1aa",
    chip: "#1a1a21",
    okBg: "#0b1f3b",
    okFg: "#8ab4ff",
    okBorder: "#1c355b",
    koBg: "#121217",
    koFg: "#a1a1aa",
    koBorder: "#2b2b33",
    btn: "#1a1a21",
    btnHover: "#22222a",
    blue: "#8ab4ff",
    red: "#ff6b5e",
    txtBlue: "#8ab4ff",
    txtBlueMuted: "#6fa0ff",
    txtRed: "#ff6b5e",
  }
};

/* =========================
   PRIMITIVES UI
   ========================= */
const Badge = ({ ok, children, t }) => (
  <span
    className="text-xs rounded-full border px-2 py-0.5"
    style={{
      background: ok ? t.okBg : t.koBg,
      color: ok ? t.okFg : t.koFg,
      borderColor: ok ? t.okBorder : t.koBorder,
    }}
  >
    {children}
  </span>
);

const Button = ({
  tone = "default", // default | primary | danger | ghost | tiny
  className = "",
  style: styleProp = {},
  children,
  t,
  ...props
}) => {
  const base =
    "rounded-2xl border text-sm px-3 py-2 transition-colors select-none w-full sm:w-auto";
  const tiny = tone === "tiny";
  const toneStyle = (() => {
    switch (tone) {
      case "primary":
        return { background: "transparent", borderColor: t.stroke, color: t.txtBlue };
      case "danger":
        return { background: "transparent", borderColor: t.stroke, color: t.txtRed };
      case "ghost":
        return { background: "transparent", borderColor: t.stroke, color: t.fg };
      default:
        return { background: t.btn, borderColor: t.stroke, color: t.fg };
    }
  })();
  const cls = [base, tiny ? "px-2 py-1 text-[12px]" : "", className].join(" ");
  const style = { minHeight: tiny ? 36 : 44, ...toneStyle, ...styleProp };
  return (
    <button className={cls} style={style} {...props}>{children}</button>
  );
};

const Chip = ({ children, t }) => (
  <span
    className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs shrink"
    style={{ background: t.chip, borderColor: t.stroke, maxWidth: "100%", overflow: "hidden" }}
  >
    {children}
  </span>
);

/* Bouton “power” = impulsion (pas un switch) */
function PowerButton({ onPulse, disabled, t }){
  const size = typeof window !== "undefined" && window.innerWidth <= 480 ? 64 : 56;
  return (
    <button
      onClick={() => !disabled && onPulse?.()}
      disabled={disabled}
      aria-label="Power pulse"
      className={`group relative inline-flex items-center justify-center rounded-full ${disabled ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"}`}
      style={{ width: size, height: size, background: t.btn, border: `1px solid ${t.stroke}` }}
    >
      <span className="text-[20px]" style={{ color: t.blue }}>⏻</span>
    </button>
  );
}

/* =========================
   APP
   ========================= */
export default function App(){
  /* ---------- Dark mode ---------- */
  const prefersDark = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const [isDark, setIsDark] = useState(prefersDark);
  useEffect(()=>{
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if(!mq) return;
    const h = e => setIsDark(e.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h);
  },[]);
  const t = isDark ? THEME.dark : THEME.light;
  const frame = useMemo(()=>({ background:t.bg, color:t.fg, borderColor:t.stroke }),[t]);

  /* ---------- State / logs ---------- */
  const [user,setUser]=useState(null);
  const [devices,setDevices]=useState([]);
  const [nodesByMaster,setNodesByMaster]=useState({});
  const [pair,setPair]=useState({open:false,code:null,expires_at:null});
  const [lines,setLines]=useState([]);
  const logRef=useRef(null);
  const log = (txt)=>setLines(ls=>[...ls,`${new Date().toLocaleTimeString()}  ${txt}`]);
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[lines]);

  /* ---------- Realtime refs ---------- */
  const cmdLists=useRef(new Map());
  const chDevices=useRef(null), chNodes=useRef(null), chCmds=useRef(null);

  /* ---------- Auth bootstrap ---------- */
  useEffect(()=>{
    const sub = sb.auth.onAuthStateChange((ev,session)=>{
      setUser(session?.user||null);
      if(session?.user){ attachRealtime(); loadAll(); }
      else { cleanupRealtime(); setDevices([]); setNodesByMaster({}); }
    });
    (async()=>{
      const {data:{session}} = await sb.auth.getSession();
      setUser(session?.user||null);
      if(session?.user){ attachRealtime(); loadAll(); }
    })();
    return ()=> sub.data.subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

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

  /* ---------- Queries ---------- */
  async function loadAll(){
    const {data:devs,error:ed}=await sb.from('devices')
      .select('id,name,master_mac,last_seen,online')
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

  /* ---------- Commands ---------- */
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

  /* ---------- Render helpers ---------- */
  function upsertCmdRow(masterId, c){
    const ul = cmdLists.current.get(masterId); if(!ul) return;
    const id=`cmd-${c.id}`;
    const html = `<code>${c.status}</code> · ${c.action}${c.target_mac?' → '+c.target_mac:' (local)'} <span style="opacity:.7;font-size:12px">· ${fmtTS(c.created_at)}</span>`;
    let li = ul.querySelector(`#${CSS.escape(id)}`);
    if(!li){
      li=document.createElement('li'); li.id=id; li.innerHTML=html; ul.prepend(li);
      while(ul.children.length>20) ul.removeChild(ul.lastChild);
    }else li.innerHTML=html;
  }

  /* ---------- Header controls ---------- */
  const UserControls = (
    <div className="flex items-center gap-2 text-xs" style={{ color: t.muted }}>
      <span>{user?.email || "non connecté"}</span>
      {!user
        ? <Button tone="ghost" t={t} onClick={async ()=>{
            const {data,error}=await sb.auth.signInWithOAuth({
              provider:"google",
              options:{redirectTo:location.href, queryParams:{prompt:"select_account"}}
            });
            if(error) alert(error.message); else if(data?.url) location.href=data.url;
          }}>Connexion Google</Button>
        : <>
            <Button tone="ghost" t={t} onClick={()=>setIsDark(d=>!d)}>{isDark?"Mode clair":"Mode sombre"}</Button>
            <Button tone="ghost" t={t} onClick={()=>sb.auth.signOut()}>Déconnexion</Button>
          </>
      }
    </div>
  );

  /* ---------- UI: Slave card (utilise commandes réelles) ---------- */
  function SlaveCard({ mac, masterId }){
    return (
      <article className="flex flex-col gap-3 rounded-3xl border p-4" style={{ background:t.card, borderColor:t.stroke }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ minWidth:0 }}>
            <span className="font-semibold" style={{ color:t.txtBlue }}>SLAVE</span>
            <Chip t={t}>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ color:t.txtBlue }}>⚙️</span>
              <code style={{ fontFamily:"ui-monospace,Menlo,monospace", fontSize:12, maxWidth:"12ch", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mac}</code>
            </Chip>
          </div>
        </div>

        <div className="relative mx-auto mt-1 flex h-24 w-24 items-center justify-center rounded-full border text-[11px]"
             style={{ borderColor:t.stroke, background:"linear-gradient(180deg,#fafafa,#f2f2f7)" }}>
          PHOTO
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border"
                style={{ background:"#6b7280", borderColor:t.stroke }} />
        </div>

        <div className="flex justify-center">
          <PowerButton t={t} onPulse={()=>{
            sendCmd(masterId,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:1});
          }}/>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button tone="tiny" t={t} onClick={()=>sendCmd(masterId,mac,"SLV_RESET",{})}>Reset</Button>
          <Button tone="tiny" t={t} onClick={()=>sendCmd(masterId,mac,"SLV_IO",{pin:DEFAULT_IO_PIN,mode:"OUT",value:0})}>Off</Button>
          <Button tone="tiny" t={t} onClick={()=>sendCmd(masterId,mac,"SLV_FORCE_OFF",{})} style={{ color:t.txtBlue }}>
            Hard Stop
          </Button>
          <Button tone="tiny" t={t} onClick={()=>sendCmd(masterId,mac,"SLV_HARD_RESET",{ms:3000})} style={{ color:t.txtBlueMuted }}>
            Hard Reset
          </Button>
        </div>
      </article>
    );
  }

  /* ---------- RENDER ---------- */
  return (
    <div className="min-h-screen"
         style={{ background:frame.background, color:frame.color, fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',Segoe UI,Roboto,Arial,Helvetica,sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md border-b px-4 md:px-6 py-4" style={{ background:t.panel, borderColor:t.stroke }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 flex-wrap">
          <h1 className="m-0 text-[18px] tracking-wide">REMOTE POWER</h1>
          {UserControls}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color:t.muted }}>Compte : {user?.email || "—"}</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button tone="primary" className="sm:w-auto" t={t} onClick={openPairDialog}>Ajouter un MASTER</Button>
            <Button t={t} onClick={loadAll}>Rafraîchir</Button>
          </div>
        </div>

        {/* Cartes MASTER */}
        {devices.map(d=>{
          const live = isLive(d);
          const slaves = nodesByMaster[d.id] || [];
          return (
            <section key={d.id} className="flex flex-col gap-4 rounded-3xl border p-4 md:p-6" style={{ background:t.card, borderColor:t.stroke }}>
              {/* header master */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <strong className="text-[17px] tracking-wide">MASTER</strong>
                  <Badge ok={live} t={t}>{live?"EN LIGNE":"HORS LIGNE"}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button tone="tiny" t={t} onClick={()=>renameMaster(d.id)}>Renommer</Button>
                  <Button tone="tiny" t={t} onClick={()=>deleteDevice(d.id)} style={{ color:t.txtRed }}>Supprimer</Button>
                </div>
              </div>

              <div className="text-[12px]" style={{ color:t.muted }}>
                ID : <code>{d.id}</code> · MAC : <span style={{ color:t.txtBlue }}>{d.master_mac || "—"}</span> · Dernier contact : {fmtTS(d.last_seen) || "jamais"}
              </div>

              {/* slaves */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-4">
                {slaves.map(mac => <SlaveCard key={mac} mac={mac} masterId={d.id} />)}

                {/* add tile visuelle (pairing côté master bouton long) */}
                <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed p-8 text-[13px]"
                     style={{ borderColor:t.stroke, background:t.btn, color:t.muted }}>
                  <span className="text-5xl leading-none" style={{ color:t.blue }}>＋</span>
                  Ajouter un SLAVE
                </div>
              </div>

              <div className="h-px" style={{ background:t.stroke }} />

              {/* actions master */}
              <div className="flex flex-wrap items-center gap-2">
                <Button tone="tiny" t={t} style={{ color:t.txtBlue }} onClick={()=>sendCmd(d.id,null,"PULSE",{ms:500})}>⚡ Pulse 500 ms</Button>
                <Button tone="tiny" t={t} style={{ color:t.txtBlue }} onClick={()=>sendCmd(d.id,null,"POWER_ON",{})}>🔌 Power ON</Button>
                <Button tone="tiny" t={t} style={{ color:t.txtBlueMuted }} onClick={()=>sendCmd(d.id,null,"POWER_OFF",{})}>⏹️ Power OFF</Button>
                <Button tone="tiny" t={t} style={{ color:t.txtBlue }} onClick={()=>sendCmd(d.id,null,"RESET",{})}>↻ Reset</Button>
                <span className="ml-auto text-xs" style={{ color:t.muted }}>
                  Nom : <strong>{d.name || d.id}</strong>
                </span>
              </div>

              {/* commandes (20 dernières) */}
              <div className="h-px" style={{ background:t.stroke }} />
              <div className="text-[12px]" style={{ color:t.muted }}>Commandes (20 dernières)</div>
              <ul className="list-disc pl-5 max-h-40 overflow-auto" ref={el=>{ if(el) cmdLists.current.set(d.id,el); }}/>
            </section>
          );
        })}

        {/* Journal global */}
        <div>
          <h3 className="m-0 mb-2 text-[16px]">Journal</h3>
          <div className="whitespace-pre-wrap border rounded-2xl p-3 h-40 overflow-auto"
               ref={logRef} style={{ background:isDark?"#0b1220":"#fafafa", borderColor:t.stroke }}>
            {lines.join("\n")}
          </div>
        </div>
      </main>

      {/* Pair-code dialog (simple) */}
      {pair.open && (
        <dialog open onClose={()=>setPair({open:false,code:null,expires_at:null})}
                style={{ border:`1px solid ${t.stroke}`, borderRadius:12, background:t.card, color:t.fg }}>
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
            <h3 style={{margin:0}}>Appairer un MASTER</h3>
            <div>Code : <code>{String(pair.code).padStart(6,"0")}</code>{" "}
              (expire <span style={{opacity:.8}}>
                {(()=>{
                  const end = pair.expires_at ? new Date(pair.expires_at).getTime() : 0;
                  const l = Math.max(0, Math.floor((end - Date.now())/1000));
                  return `${Math.floor(l/60)}:${String(l%60).padStart(2,'0')}`;
                })()}
              </span>)
            </div>
            <div style={{opacity:.8,fontSize:13}}>Saisis ce code dans le portail Wi-Fi de l’ESP32.</div>
            <div className="flex justify-end">
              <Button t={t} onClick={()=>setPair({open:false,code:null,expires_at:null})}>Fermer</Button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
