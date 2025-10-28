import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   CONFIG SUPABASE (vient des variables d'env Vite)
   ========================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// si jamais les env ne sont pas définies, on évite de crasher
const sb = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* =========================================================
   CONSTANTES
   ========================================================= */
const LIVE_TTL_MS = 8000;         // master online si last_seen < 8s
const DEFAULT_IO_PIN = 26;        // pin impulsion power du slave

/* =========================================================
   STYLES GLOBAUX
   ========================================================= */
const styles = `
:root {
  --bg-main:#f5f7fa;
  --glass-bg:rgba(255,255,255,0.45);
  --glass-stroke:rgba(0,0,0,0.08);
  --slave-bg:rgba(255,255,255,0.55);
  --text-main:#0a0a0a;
  --text-dim:#4a4a4a;
  --text-muted:#8a8fa3;
  --ok:#22c55e;
  --ko:#ef4444;
  --border-radius-xl:20px;
  --border-radius-lg:16px;
  --border-radius-md:12px;
  --btn-bg:rgba(0,0,0,0.06);
  --btn-bg-hover:rgba(0,0,0,0.12);
  --btn-bg-active:#0a0a0a;
  --btn-icon:#0a0a0a;
  --btn-icon-active:#fff;
  --header-height:56px;
  --backdrop-blur:20px;
  --font-family:-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, Roboto, "Segoe UI", Arial, sans-serif;
}

* {
  box-sizing:border-box;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}

html, body, #root {
  margin:0;
  padding:0;
  min-height:100%;
  width:100%;
  font-family:var(--font-family);
  background: var(--bg-main);
  color:var(--text-main);
}

/* ====== BACKGROUND global ====== */
.app-bg {
  position:fixed;
  inset:0;
  background-size:cover;
  background-position:center;
  background-repeat:no-repeat;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60");
  filter:brightness(1) saturate(1.05);
  z-index:0;
}

/* ===== TOP BAR ===== */
.topBar {
  position:fixed;
  top:0;left:0;right:0;
  height:var(--header-height);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 16px;
  background:rgba(255,255,255,0.4);
  backdrop-filter:blur(var(--backdrop-blur));
  border-bottom:1px solid var(--glass-stroke);
  z-index:10;
}
.topBar-left {
  font-size:14px;
  font-weight:600;
  display:flex;
  flex-direction:column;
  line-height:1.2;
}
.topBar-sub {
  color:var(--text-dim);
  font-weight:400;
  font-size:12px;
}
.topBar-right {
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
}
.badgeOnline {
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  font-weight:500;
  padding:4px 8px;
  border-radius:999px;
  background:rgba(34,197,94,0.12);
  color:var(--ok);
  border:1px solid rgba(34,197,94,0.3);
}
.badgeOffline {
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  font-weight:500;
  padding:4px 8px;
  border-radius:999px;
  background:rgba(239,68,68,0.12);
  color:var(--ko);
  border:1px solid rgba(239,68,68,0.3);
}

/* bouton simple topBar */
.tbBtn {
  appearance:none;
  background:var(--btn-bg);
  border:1px solid var(--glass-stroke);
  border-radius:999px;
  min-height:32px;
  padding:0 12px;
  font-size:13px;
  line-height:32px;
  color:var(--text-main);
  cursor:pointer;
}
.tbBtn:hover { background:var(--btn-bg-hover); }
.tbBtn.danger { color:#b91c1c; }

/* ===== MAIN WRAP ===== */
.mainWrap {
  position:relative;
  z-index:1; /* passer devant le fond */
  padding-top:calc(var(--header-height) + 16px);
  padding-bottom:48px;
  max-width:1200px;
  margin:0 auto;
  display:flex;
  flex-direction:column;
  gap:24px;
}

/* ===== MASTER CARD ===== */
.masterCard {
  width:100%;
  max-width:1000px;
  margin:0 auto;
  background:var(--glass-bg);
  border:1px solid var(--glass-stroke);
  backdrop-filter:blur(var(--backdrop-blur));
  border-radius:var(--border-radius-xl);
  box-shadow:0 20px 40px -10px rgba(0,0,0,0.2);
  padding:16px 20px;
  display:flex;
  flex-direction:column;
  gap:16px;
}

/* header master */
.masterHead {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  row-gap:8px;
}
.masterInfoL {
  display:flex;
  flex-direction:column;
  min-width:0;
  max-width:100%;
}
.masterNameRow {
  display:flex;
  align-items:center;
  gap:8px;
  font-size:16px;
  font-weight:600;
  color:var(--text-main);
}
.masterMeta {
  color:var(--text-dim);
  font-size:12px;
  line-height:1.3;
  word-break:break-all;
}
.masterActions {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  font-size:13px;
}
.masterActionBtn {
  appearance:none;
  background:var(--btn-bg);
  border:1px solid var(--glass-stroke);
  border-radius:999px;
  min-height:32px;
  line-height:32px;
  padding:0 12px;
  font-size:13px;
  color:var(--text-main);
  cursor:pointer;
}
.masterActionBtn:hover { background:var(--btn-bg-hover); }
.masterActionBtn.danger { color:#b91c1c; }

/* ===== SLAVES WRAP ===== */
.slavesWrap {
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  align-items:flex-start;
  column-gap:16px;
  row-gap:16px;
}

/* ===== SLAVE CARD ===== */
.slaveCard {
  position:relative;
  flex:0 1 180px;
  min-width:150px;
  max-width:220px;
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:16px 12px 12px;
  background:var(--slave-bg);
  border:1px solid var(--glass-stroke);
  border-radius:var(--border-radius-lg);
  box-shadow:0 12px 30px -8px rgba(0,0,0,0.18);
  backdrop-filter:blur(var(--backdrop-blur));
  color:var(--text-main);
  font-size:14px;
}

/* bouton "i" */
.slaveInfoBtn {
  position:absolute;
  top:8px;
  right:8px;
  background:var(--btn-bg);
  border:1px solid var(--glass-stroke);
  width:28px;
  height:28px;
  border-radius:999px;
  font-size:13px;
  line-height:28px;
  color:var(--text-main);
  text-align:center;
  cursor:pointer;
}
.slaveInfoBtn:hover {
  background:var(--btn-bg-hover);
}

/* panneau info/rename */
.slaveInfoPanel {
  position:absolute;
  top:8px;
  right:8px;
  left:8px;
  background:rgba(255,255,255,0.9);
  border:1px solid var(--glass-stroke);
  border-radius:var(--border-radius-md);
  box-shadow:0 20px 40px -10px rgba(0,0,0,.35);
  padding:12px;
  font-size:12px;
  color:var(--text-main);
  line-height:1.4;
  z-index:5;
}
.slaveInfoRow {
  margin-bottom:8px;
  word-break:break-all;
}
.slaveInfoLabel {
  font-weight:600;
  color:var(--text-dim);
  display:block;
  font-size:11px;
}
.slaveRenameRow {
  display:flex;
  align-items:center;
  gap:6px;
}
.slaveRenameInput {
  flex:1;
  min-width:0;
  font-size:12px;
  line-height:1.4;
  background:#fff;
  border:1px solid var(--glass-stroke);
  border-radius:8px;
  padding:4px 6px;
  color:var(--text-main);
}
.slaveRenameBtn {
  appearance:none;
  background:var(--btn-bg);
  border:1px solid var(--glass-stroke);
  border-radius:8px;
  padding:4px 8px;
  font-size:12px;
  cursor:pointer;
}
.slaveRenameBtn:hover { background:var(--btn-bg-hover); }

/* Nom du SLAVE en gros */
.slaveName {
  font-size:16px;
  font-weight:600;
  text-align:center;
  color:var(--text-main);
  margin-top:8px;
  word-break:break-word;
  max-width:100%;
}

/* statut PC */
.pcStatus {
  font-size:12px;
  line-height:1.3;
  color:var(--text-dim);
  text-align:center;
  margin-top:4px;
  margin-bottom:8px;
}
.pcStatus .on {
  color:var(--ok);
  font-weight:500;
}
.pcStatus .off {
  color:var(--text-dim);
  font-weight:400;
}

/* barre d'activité */
.activityBarWrap {
  position:relative;
  width:100%;
  height:4px;
  border-radius:999px;
  background:rgba(0,0,0,0.06);
  overflow:hidden;
  margin-bottom:12px;
}
.activityBarInner {
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  background:#0a0a0a;
  transition:width .2s linear, background .2s linear;
}

/* rangée de boutons ronds */
.slaveBtnRow {
  display:flex;
  justify-content:center;
  align-items:flex-end;
  gap:12px;
  flex-wrap:nowrap;
  width:100%;
}

/* bouton rond */
.roundBtn {
  appearance:none;
  width:40px;
  height:40px;
  min-width:40px;
  min-height:40px;
  border-radius:999px;
  border:1px solid var(--glass-stroke);
  background:var(--btn-bg);
  color:var(--btn-icon);
  font-size:14px;
  font-weight:500;
  line-height:40px;
  text-align:center;
  cursor:pointer;
  position:relative;
  flex-shrink:0;
}
.roundBtn:hover {
  background:var(--btn-bg-hover);
}
.roundBtn:active {
  background:var(--btn-bg-active);
  color:var(--btn-icon-active);
}
.roundBtn.moreBtn {
  font-size:18px;
  font-weight:600;
  line-height:38px;
}

/* menu "..." */
.moreMenu {
  position:absolute;
  bottom:48px;
  right:-4px;
  background:rgba(255,255,255,0.95);
  border:1px solid var(--glass-stroke);
  border-radius:var(--border-radius-md);
  box-shadow:0 20px 40px -10px rgba(0,0,0,.4);
  min-width:120px;
  padding:8px;
  font-size:13px;
  line-height:1.4;
  color:var(--text-main);
  z-index:10;
}
.moreMenuItem {
  padding:6px 8px;
  border-radius:8px;
  cursor:pointer;
}
.moreMenuItem.alert {
  color:#b91c1c;
}
.moreMenuItem:hover {
  background:var(--btn-bg-hover);
}

/* ===== JOURNAL ===== */
.journalCard {
  width:100%;
  max-width:1000px;
  margin:0 auto;
  background:var(--glass-bg);
  border:1px solid var(--glass-stroke);
  backdrop-filter:blur(var(--backdrop-blur));
  border-radius:var(--border-radius-xl);
  box-shadow:0 20px 40px -10px rgba(0,0,0,0.2);
  padding:16px 20px;
  display:flex;
  flex-direction:column;
  gap:12px;
}
.journalTitle {
  font-size:14px;
  font-weight:600;
  color:var(--text-main);
}
.journalBox {
  background:rgba(0,0,0,0.05);
  border:1px solid var(--glass-stroke);
  border-radius:var(--border-radius-md);
  font-size:12px;
  line-height:1.4;
  padding:12px;
  color:var(--text-main);
  max-height:150px;
  overflow-y:auto;
  white-space:pre-wrap;
  word-break:break-word;
}

/* petit texte */
.smallText {
  font-size:12px;
  color:var(--text-dim);
}

/* ===== PAIR MODAL ===== */
.pairOverlay {
  position:fixed;
  inset:0;
  background:rgba(0,0,0,0.4);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:999;
}
.pairCard {
  background:rgba(255,255,255,0.8);
  border:1px solid var(--glass-stroke);
  backdrop-filter:blur(20px);
  border-radius:var(--border-radius-lg);
  box-shadow:0 24px 60px -10px rgba(0,0,0,0.4);
  width:90%;
  max-width:320px;
  padding:16px;
  color:var(--text-main);
  font-size:14px;
  line-height:1.4;
}
.pairTitle {
  font-size:16px;
  font-weight:600;
  margin-bottom:8px;
  color:var(--text-main);
}
.pairRow {
  font-size:14px;
  margin-bottom:8px;
  word-break:break-word;
}
.pairLabel {
  font-size:12px;
  font-weight:500;
  color:var(--text-dim);
  margin-right:4px;
}
.pairCodeBox {
  font-size:20px;
  font-weight:600;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing:2px;
  background:#fff;
  border:1px solid var(--glass-stroke);
  border-radius:var(--border-radius-md);
  padding:8px 12px;
  display:inline-block;
}
.pairFooter {
  font-size:12px;
  color:var(--text-dim);
  margin-top:4px;
}
.pairBtnRow {
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:12px;
}
.pairBtn {
  appearance:none;
  background:var(--btn-bg);
  border:1px solid var(--glass-stroke);
  border-radius:999px;
  min-height:32px;
  line-height:32px;
  padding:0 12px;
  font-size:13px;
  color:var(--text-main);
  cursor:pointer;
}
.pairBtn:hover { background:var(--btn-bg-hover); }
`;

/* =========================================================
   HELPERS
   ========================================================= */
function fmtTS(ts){
  if(!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}
function isMasterLive(dev){
  if(!dev.last_seen) return false;
  const delta = Date.now() - new Date(dev.last_seen).getTime();
  return delta < LIVE_TTL_MS;
}

/* =========================================================
   COMPOSANT PRINCIPAL
   ========================================================= */
export default function App(){

  // ---------- état auth ----------
  const [authReady,setAuthReady] = useState(false);
  const [user,setUser] = useState(null);

  // ---------- data ----------
  const [masters,setMasters] = useState([]);
  // { master_id: [ {slave_mac,friendly_name,pc_on,last_seen}, ... ] }
  const [slavesByMaster,setSlavesByMaster] = useState({});

  // logs / journal
  const [lines,setLines] = useState([]);
  const logRef = useRef(null);
  const log = (txt)=>{
    setLines(ls=>[...ls, `${new Date().toLocaleTimeString()}  ${txt}`]);
  };
  useEffect(()=>{
    if(logRef.current){
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  },[lines]);

  // UI state par slave
  const [openInfo,setOpenInfo] = useState({});   // { mac: bool }
  const [openMore,setOpenMore] = useState({});   // { mac: bool }
  const [editName,setEditName] = useState({});   // { mac: "text" }
  const [phase,setPhase] = useState({});         // { mac: "idle"|"sending"|"acked" }

  // Pairing dialog
  const [pair,setPair] = useState({
    open:false,
    code:null,
    expires_at:null
  });

  // refs realtime
  const chDevices = useRef(null);
  const chNodes   = useRef(null);
  const chCmds    = useRef(null);

  /* =================================
     AUTH / SESSION INIT
     ================================= */
  useEffect(()=>{
    if(!sb){
      console.warn("Supabase client is null (env missing).");
      return;
    }

    const { data: sub } = sb.auth.onAuthStateChange(async (_ev,session)=>{
      setUser(session?.user || null);
      setAuthReady(true);

      if(session?.user){
        attachRealtime();
        loadAll();
      } else {
        cleanupRealtime();
        setMasters([]);
        setSlavesByMaster({});
      }
    });

    (async ()=>{
      const { data:{ session } } = await sb.auth.getSession();
      setUser(session?.user || null);
      setAuthReady(true);

      if(session?.user){
        attachRealtime();
        loadAll();
      }
    })();

    return ()=>{ sub.subscription.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* =================================
     REALTIME
     ================================= */
  function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current)   sb.removeChannel(chNodes.current);
    if(chCmds.current)    sb.removeChannel(chCmds.current);
    chDevices.current = null;
    chNodes.current   = null;
    chCmds.current    = null;
  }

  function attachRealtime(){
    cleanupRealtime();

    // devices
    chDevices.current = sb.channel("rt:devices")
      .on("postgres_changes",
          { event:"INSERT", schema:"public", table:"devices" },
          p => {
            const d = p.new;
            log(`+ master ${d.id}`);
            setMasters(ms=>[d, ...ms]);
          })
      .on("postgres_changes",
          { event:"UPDATE", schema:"public", table:"devices" },
          p => {
            const d = p.new;
            setMasters(ms=>ms.map(m=>m.id===d.id?{...m,...d}:m));
          })
      .on("postgres_changes",
          { event:"DELETE", schema:"public", table:"devices" },
          p => {
            const id = p.old.id;
            log(`- master ${id}`);
            setMasters(ms=>ms.filter(m=>m.id!==id));
            setSlavesByMaster(cur=>{
              const copy={...cur};
              delete copy[id];
              return copy;
            });
          })
      .subscribe();

    // nodes
    chNodes.current = sb.channel("rt:nodes")
      .on("postgres_changes",
          { event:"INSERT", schema:"public", table:"nodes" },
          p => {
            const row = p.new;
            log(`+ slave ${row.slave_mac} → ${row.master_id}`);
            refreshSlavesFor(row.master_id);
          })
      .on("postgres_changes",
          { event:"UPDATE", schema:"public", table:"nodes" },
          p => {
            const row = p.new;
            setSlavesByMaster(cur => {
              const list = cur[row.master_id] || [];
              const upd  = list.map(s => s.slave_mac===row.slave_mac ? {...s, ...row} : s);
              return {...cur, [row.master_id]:upd};
            });
          })
      .on("postgres_changes",
          { event:"DELETE", schema:"public", table:"nodes" },
          p => {
            const row = p.old;
            log(`- slave ${row.slave_mac} (${row.master_id})`);
            setSlavesByMaster(cur => {
              const list = cur[row.master_id] || [];
              const upd = list.filter(s => s.slave_mac !== row.slave_mac);
              return {...cur, [row.master_id]:upd};
            });
          })
      .subscribe();

    // commands
    chCmds.current = sb.channel("rt:commands")
      .on("postgres_changes",
          { event:"INSERT", schema:"public", table:"commands" },
          p => {
            const c = p.new;
            if(c.target_mac){
              setPhase(ph => ({...ph, [c.target_mac]:"sending"}));
            }
            log(`cmd + ${c.action} (${c.status}) → ${c.master_id}${c.target_mac?" ▶ "+c.target_mac:""}`);
          })
      .on("postgres_changes",
          { event:"UPDATE", schema:"public", table:"commands" },
          p => {
            const c = p.new;
            if(c.target_mac && c.status==="acked"){
              setPhase(ph => ({...ph, [c.target_mac]:"acked"}));
              setTimeout(()=>{
                setPhase(ph2 => ({...ph2,[c.target_mac]:"idle"}));
              },1200);
            }
            log(`cmd ~ ${c.action} (${c.status}) → ${c.master_id}${c.target_mac?" ▶ "+c.target_mac:""}`);
          })
      .subscribe();
  }

  /* =================================
     LOAD DATA
     ================================= */
  async function loadAll(){
    if(!sb) return;

    const { data:devs, error:ed } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at",{ascending:false});
    if(ed){
      log("Err devices: "+ed.message);
    } else {
      setMasters(devs||[]);
    }

    const { data:nodes, error:en } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on,last_seen");
    if(en){
      log("Err nodes: "+en.message);
    } else {
      const map = {};
      (nodes||[]).forEach(n=>{
        if(!map[n.master_id]) map[n.master_id]=[];
        map[n.master_id].push(n);
      });
      setSlavesByMaster(map);
    }
  }

  async function refreshSlavesFor(masterId){
    if(!sb) return;
    const { data, error } = await sb
      .from("nodes")
      .select("master_id,slave_mac,friendly_name,pc_on,last_seen")
      .eq("master_id",masterId);
    if(error){
      log("Err nodes: "+error.message);
      return;
    }
    setSlavesByMaster(cur => ({...cur,[masterId]:data||[]}));
  }

  /* =================================
     COMMANDES
     ================================= */
  async function sendCmd(masterId, targetMac, action, payload={}){
    if(!sb) return;
    if(targetMac){
      setPhase(ph => ({...ph,[targetMac]:"sending"}));
    }

    const { error } = await sb
      .from("commands")
      .insert({
        master_id: masterId,
        target_mac: targetMac || null,
        action,
        payload
      });

    if(error){
      log("cmd err: "+error.message);
      if(targetMac){
        setPhase(ph => ({...ph,[targetMac]:"idle"}));
      }
    } else {
      log(`[cmd] ${action} → ${masterId}${targetMac?" ▶ "+targetMac:""}`);
    }
  }

  async function renameMaster(masterId){
    const newName = window.prompt("Nouveau nom du master ?","");
    if(!newName) return;
    const { error } = await sb
      .from("devices")
      .update({ name:newName })
      .eq("id", masterId);
    if(error){
      alert(error.message);
    } else {
      log(`Master ${masterId} renommé en ${newName}`);
    }
  }

  async function deleteMaster(masterId){
    if(!window.confirm(`Supprimer ${masterId} ?`)) return;
    const { data:{session} } = await sb.auth.getSession();
    if(!session){
      alert("Non connecté");
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${session.access_token}`
      },
      body:JSON.stringify({ master_id:masterId })
    });
    if(r.ok){
      log(`MASTER supprimé : ${masterId}`);
    } else {
      const txt = await r.text();
      log(`❌ Suppression : ${txt}`);
    }
  }

  async function submitRenameSlave(masterId, mac){
    const newName = (editName[mac] ?? "").trim();
    if(!newName) return;
    const { error } = await sb
      .from("nodes")
      .update({ friendly_name:newName })
      .eq("master_id",masterId)
      .eq("slave_mac",mac);
    if(error){
      alert(error.message);
    } else {
      log(`Slave ${mac} renommé en ${newName}`);
    }
  }

  /* =================================
     PAIRING MASTER
     ================================= */
  async function openPairDialog(){
    const { data:{session} } = await sb.auth.getSession();
    if(!session){
      alert("Non connecté");
      return;
    }
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`, {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${session.access_token}`
        },
        body:JSON.stringify({ ttl_minutes:10 })
      });
      if(!r.ok){
        const t = await r.text();
        alert(t);
        return;
      }
      const { code, expires_at } = await r.json();
      setPair({
        open:true,
        code,
        expires_at
      });
      log(`Pair-code ${code}`);
    } catch(e){
      console.error(e);
      alert("Erreur pair-code");
    }
  }

  function closePairDialog(){
    setPair({
      open:false,
      code:null,
      expires_at:null
    });
  }

  // compte à rebours d'expiration du code
  const pairCountdownText = (() => {
    if(!pair.open || !pair.expires_at) return "—";
    const end = new Date(pair.expires_at).getTime();
    const left = Math.max(0, Math.floor((end - Date.now())/1000));
    const min = Math.floor(left/60);
    const sec = left%60;
    return `${min}:${String(sec).padStart(2,"0")}`;
  })();

  /* =================================
     TOGGLES UI SLAVE
     ================================= */
  function toggleInfo(mac){
    setOpenInfo(cur=>({...cur,[mac]:!cur[mac]}));
  }
  function toggleMore(mac){
    setOpenMore(cur=>({...cur,[mac]:!cur[mac]}));
  }

  /* =================================
     AUTH BUTTONS
     ================================= */
  function handleLogin(){
    if(!sb) return;
    sb.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo: window.location.href,
        queryParams:{ prompt:"select_account" }
      }
    })
    .then(({data,error})=>{
      if(error) alert(error.message);
      else if(data?.url) window.location.href=data.url;
    });
  }

  function handleLogout(){
    if(!sb) return;
    sb.auth.signOut();
  }

  const accountEmail = user?.email || "non connecté";

  /* =================================
     RENDER SLAVE
     ================================= */
  function SlaveCard({ masterId, slave }){
    const mac = slave.slave_mac;
    const niceName = slave.friendly_name || mac;
    const pcState = slave.pc_on; // true/false/null
    const isInfoOpen = !!openInfo[mac];
    const isMoreOpen = !!openMore[mac];
    const ph = phase[mac] || "idle";

    // barre activité
    let barWidth="0%";
    if(ph==="sending") barWidth="30%";
    else if(ph==="acked") barWidth="100%";

    // statut PC
    let pcText;
    if(pcState===true){
      pcText = <span className="on">Ordinateur : Allumé</span>;
    } else if(pcState===false){
      pcText = <span className="off">Ordinateur : Éteint</span>;
    } else {
      pcText = <span className="off">Ordinateur : Inconnu</span>;
    }

    return (
      <div className="slaveCard">
        {/* bouton info */}
        <button
          className="slaveInfoBtn"
          onClick={()=>toggleInfo(mac)}
          title="Infos / renommer"
        >
          i
        </button>

        {/* panneau info / rename */}
        {isInfoOpen && (
          <div className="slaveInfoPanel">
            <div className="slaveInfoRow">
              <span className="slaveInfoLabel">Adresse MAC</span>
              <span>{mac}</span>
            </div>
            <div className="slaveInfoRow">
              <span className="slaveInfoLabel">Dernier contact</span>
              <span>{fmtTS(slave.last_seen)}</span>
            </div>

            <div className="slaveInfoRow">
              <span className="slaveInfoLabel">Renommer le SLAVE</span>
              <div className="slaveRenameRow">
                <input
                  className="slaveRenameInput"
                  value={editName[mac] ?? niceName}
                  onChange={e=>setEditName(cur=>({...cur,[mac]:e.target.value}))}
                />
                <button
                  className="slaveRenameBtn"
                  onClick={()=>submitRenameSlave(masterId, mac)}
                >
                  OK
                </button>
              </div>
            </div>

            <div style={{textAlign:"right"}}>
              <button
                className="slaveRenameBtn"
                onClick={()=>toggleInfo(mac)}
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* nom du slave */}
        <div className="slaveName">{niceName}</div>

        {/* statut pc */}
        <div className="pcStatus">{pcText}</div>

        {/* barre d'activité */}
        <div className="activityBarWrap">
          <div
            className="activityBarInner"
            style={{
              width:barWidth,
              background:"#0a0a0a"
            }}
          />
        </div>

        {/* boutons ronds */}
        <div className="slaveBtnRow">
          {/* IO / power pulse */}
          <button
            className="roundBtn"
            onClick={()=>sendCmd(masterId, mac, "SLV_IO", {
              pin:DEFAULT_IO_PIN, mode:"OUT", value:1
            })}
            title="Impulsion Power / IO"
          >
            ⏻
          </button>

          {/* RESET normal */}
          <button
            className="roundBtn"
            onClick={()=>sendCmd(masterId, mac, "SLV_RESET", {})}
            title="Reset normal"
          >
            ↻
          </button>

          {/* ... menu */}
          <div style={{position:"relative"}}>
            <button
              className="roundBtn moreBtn"
              onClick={()=>toggleMore(mac)}
              title="Plus d'actions"
            >
              …
            </button>

            {isMoreOpen && (
              <div className="moreMenu">
                <div
                  className="moreMenuItem"
                  onClick={()=>{
                    sendCmd(masterId, mac, "SLV_IO", {
                      pin:DEFAULT_IO_PIN, mode:"OUT", value:0
                    });
                    toggleMore(mac);
                  }}
                >
                  Power OFF forcé
                </div>
                <div
                  className="moreMenuItem alert"
                  onClick={()=>{
                    sendCmd(masterId, mac, "SLV_HARD_RESET", {ms:3000});
                    toggleMore(mac);
                  }}
                >
                  Hard Reset
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* =================================
     RENDER MASTER
     ================================= */
  function MasterCard({m}){
    const live = isMasterLive(m);
    const listSlaves = slavesByMaster[m.id] || [];

    return (
      <section className="masterCard">
        <div className="masterHead">
          <div className="masterInfoL">
            <div className="masterNameRow">
              <span>{m.name || m.id}</span>
              {live ? (
                <span className="badgeOnline"><span>●</span>En ligne</span>
              ) : (
                <span className="badgeOffline"><span>●</span>Hors ligne</span>
              )}
            </div>
            <div className="masterMeta">
              ID : {m.id}<br/>
              MAC : {m.master_mac || "—"}<br/>
              Dernier contact : {fmtTS(m.last_seen) || "jamais"}
            </div>
          </div>

          <div className="masterActions">
            <button
              className="masterActionBtn"
              onClick={()=>renameMaster(m.id)}
            >
              Renommer
            </button>
            <button
              className="masterActionBtn danger"
              onClick={()=>deleteMaster(m.id)}
            >
              Supprimer
            </button>
          </div>
        </div>

        <div className="slavesWrap">
          {listSlaves.length===0 ? (
            <div
              className="smallText"
              style={{textAlign:"center",padding:"24px 0"}}
            >
              Aucun SLAVE.
            </div>
          ) : (
            listSlaves.map(sl=>(
              <SlaveCard
                key={sl.slave_mac}
                masterId={m.id}
                slave={sl}
              />
            ))
          )}

          {/* tuile "ajouter un SLAVE" (visuel pour l'instant) */}
          <div
            className="slaveCard"
            style={{
              opacity:0.4,
              justifyContent:"center",
              cursor:"default"
            }}
            title="Appuie sur PAIR du MASTER pour associer un nouveau SLAVE"
          >
            <div style={{
              fontSize:"28px",
              lineHeight:"1",
              fontWeight:"500",
              marginBottom:"4px"
            }}>＋</div>
            <div style={{
              fontSize:"12px",
              color:"var(--text-dim)",
              textAlign:"center"
            }}>
              Ajouter un SLAVE
            </div>
          </div>
        </div>

        {/* actions globales du master */}
        <div style={{
          display:"flex",
          flexWrap:"wrap",
          rowGap:"8px",
          columnGap:"8px",
          alignItems:"center",
          justifyContent:"flex-start",
          fontSize:"13px"
        }}>
          <button
            className="masterActionBtn"
            onClick={()=>sendCmd(m.id,null,"PULSE",{ms:500})}
          >
            Pulse 500 ms
          </button>
          <button
            className="masterActionBtn"
            onClick={()=>sendCmd(m.id,null,"POWER_ON",{})}
          >
            Power ON
          </button>
          <button
            className="masterActionBtn"
            onClick={()=>sendCmd(m.id,null,"POWER_OFF",{})}
          >
            Power OFF
          </button>
          <button
            className="masterActionBtn"
            onClick={()=>sendCmd(m.id,null,"RESET",{})}
          >
            Reset
          </button>

          <div className="smallText" style={{marginLeft:"auto"}}>
            Nom : <strong>{m.name || m.id}</strong>
          </div>
        </div>
      </section>
    );
  }

  /* =================================
     RENDER PRINCIPAL
     ================================= */

  if(!sb){
    // pas de config env
    return (
      <>
        <style>{styles}</style>
        <div className="app-bg" />
        <div className="topBar">
          <div className="topBar-left">
            <div style={{fontSize:"14px",fontWeight:600}}>REMOTE POWER</div>
            <div className="topBar-sub">Config manquante</div>
          </div>
          <div className="topBar-right">
            <span className="tbBtn" style={{opacity:.5,cursor:"default"}}>—</span>
          </div>
        </div>

        <main className="mainWrap">
          <section
            className="masterCard"
            style={{textAlign:"center",fontSize:"14px",color:"var(--text-dim)"}}
          >
            Définis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans les secrets,
            rebuild, puis recharge la page.
          </section>
        </main>
      </>
    );
  }

  if(!authReady){
    // on attend l'auth
    return (
      <>
        <style>{styles}</style>
        <div className="app-bg" />
        <div className="topBar">
          <div className="topBar-left">
            <div style={{fontSize:"14px",fontWeight:600}}>REMOTE POWER</div>
            <div className="topBar-sub">Initialisation…</div>
          </div>
          <div className="topBar-right">
            <span className="tbBtn" style={{opacity:.5,cursor:"default"}}>…</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="app-bg" />

      {/* barre du haut */}
      <div className="topBar">
        <div className="topBar-left">
          <div style={{fontSize:"14px",fontWeight:600}}>
            REMOTE POWER
          </div>
          <div className="topBar-sub">
            {user ? <>Compte : {accountEmail}</> : <>Non connecté</>}
          </div>
        </div>

        <div className="topBar-right">
          {user && (
            <>
              {masters.some(isMasterLive) ? (
                <div className="badgeOnline"><span>●</span>Online</div>
              ) : (
                <div className="badgeOffline"><span>●</span>Offline</div>
              )}

              <button className="tbBtn" onClick={loadAll}>
                Rafraîchir
              </button>

              {/* NOUVEAU : bouton pour générer le code d'appairage MASTER */}
              <button className="tbBtn" onClick={openPairDialog}>
                Ajouter un MASTER
              </button>

              <button className="tbBtn danger" onClick={handleLogout}>
                Déconnexion
              </button>
            </>
          )}

          {!user && (
            <button className="tbBtn" onClick={handleLogin}>
              Connexion Google
            </button>
          )}
        </div>
      </div>

      {/* contenu principal */}
      <main className="mainWrap">
        {/* Liste des masters */}
        {user ? (
          masters.length===0 ? (
            <section
              className="masterCard"
              style={{textAlign:"center",fontSize:"14px",color:"var(--text-dim)"}}
            >
              Aucun MASTER (utilise “Ajouter un MASTER” pour générer le code).
            </section>
          ) : (
            masters.map(m => (
              <MasterCard key={m.id} m={m}/>
            ))
          )
        ) : (
          <section
            className="masterCard"
            style={{textAlign:"center",fontSize:"14px",color:"var(--text-dim)"}}
          >
            Connecte-toi pour voir tes appareils.
          </section>
        )}

        {/* Journal */}
        <section className="journalCard">
          <div className="journalTitle">Journal</div>
          <div ref={logRef} className="journalBox">
            {lines.join("\n")}
          </div>
        </section>
      </main>

      {/* MODALE PAIRING MASTER */}
      {pair.open && (
        <div className="pairOverlay" onClick={closePairDialog}>
          <div
            className="pairCard"
            onClick={e=>e.stopPropagation()}
          >
            <div className="pairTitle">Appairer un MASTER</div>

            <div className="pairRow">
              <span className="pairLabel">Code :</span>
              <span className="pairCodeBox">
                {String(pair.code).padStart(6,"0")}
              </span>
            </div>

            <div className="pairFooter">
              Saisis ce code dans le portail Wi-Fi de l’ESP32 MASTER.<br/>
              Expire dans {pairCountdownText}.
            </div>

            <div className="pairBtnRow">
              <button className="pairBtn" onClick={closePairDialog}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
