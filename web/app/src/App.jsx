import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* =============================
   CONFIG / SUPABASE
   ============================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPA_ANON);

/* délais "online": si last_seen < 8s -> en ligne */
const LIVE_TTL_MS   = 8000;
/* pin par défaut pour action IO */
const DEFAULT_IO_PIN = 26;

/* =============================
   STYLES GLOBAUX (glass UI clair)
   ============================= */
const STYLES = `
*{box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body,#root{min-height:100%}
body{
  margin:0;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  color:#0f172a;
  background:#f5f6fa;
}

/* -------- BACKGROUND FULL PAGE -------- */
.pageBg{
  min-height:100vh;
  background-image:
    radial-gradient(circle at 20% 20%,rgba(255,255,255,0.6) 0%,rgba(255,255,255,0) 60%),
    radial-gradient(circle at 80% 30%,rgba(255,255,255,0.4) 0%,rgba(255,255,255,0) 70%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60");
  background-size:cover;
  background-position:center;
  background-attachment:fixed;
  display:flex;
  flex-direction:column;
}

/* -------- TOP BAR -------- */
.topbar{
  position:sticky;
  top:0;left:0;right:0;
  z-index:1000;
  background:rgba(255,255,255,0.55);
  backdrop-filter:blur(20px) saturate(180%);
  -webkit-backdrop-filter:blur(20px) saturate(180%);
  border-bottom:1px solid rgba(0,0,0,0.08);
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  align-items:center;
  padding:12px 16px;
  row-gap:8px;
}
.topbarTitle{
  font-size:14px;
  font-weight:600;
  letter-spacing:-.03em;
  color:#0f172a;
}
.topbarRightRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
}
.tagUser{
  font-size:12px;
  color:#475569;
  background:rgba(0,0,0,0.04);
  border-radius:999px;
  padding:4px 8px;
  border:1px solid rgba(0,0,0,0.06);
  max-width:180px;
  text-overflow:ellipsis;
  white-space:nowrap;
  overflow:hidden;
}
.primaryBtn{
  border-radius:12px;
  border:1px solid rgba(0,0,0,0.1);
  background:rgba(0,0,0,0.07);
  font-size:13px;
  padding:8px 12px;
  line-height:1.2;
  cursor:pointer;
  color:#0f172a;
}
.primaryBtn:hover{background:rgba(0,0,0,0.12);}
.dangerBtn{color:#b91c1c;}
.smallLabel{
  font-size:12px;
  color:#475569;
  line-height:1.4;
}

/* -------- MAIN WRAPPER -------- */
.contentWrap{
  flex:1;
  max-width:1400px;
  width:100%;
  margin:24px auto 80px;
  padding:0 16px;
  display:flex;
  flex-direction:column;
  gap:24px;
}

/* -------- GENERIC GLASS CARD -------- */
.glassCard{
  background:rgba(255,255,255,0.22);
  backdrop-filter:blur(20px) saturate(180%);
  -webkit-backdrop-filter:blur(20px) saturate(180%);
  border:1px solid rgba(0,0,0,0.08);
  border-radius:24px;
  box-shadow:0 30px 60px rgba(0,0,0,.15);
  color:#0f172a;
}

/* =============================
   GROUPS SECTION
   ============================= */
.groupsSectionCard{
  padding:16px 20px;
  display:flex;
  flex-direction:column;
  gap:16px;
}
.groupsHeaderRow{
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  align-items:flex-start;
  row-gap:8px;
}
.groupsHeaderLeft{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.groupsTitle{
  font-size:14px;
  font-weight:600;
  letter-spacing:-.03em;
  color:#0f172a;
}
.groupsRow{
  display:flex;
  flex-wrap:wrap;
  gap:16px;
}

/* --- single group card --- */
.groupCard{
  position:relative;
  min-width:260px;
  flex:1 1 260px;
  background:rgba(255,255,255,0.4);
  border:1px solid rgba(0,0,0,0.08);
  border-radius:20px;
  box-shadow:0 20px 40px rgba(0,0,0,.12);
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:12px;
  color:#0f172a;
}
.groupHeaderTop{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  flex-wrap:wrap;
  gap:8px;
}
.groupNameBlock{
  display:flex;
  flex-direction:column;
  min-width:0;
}
.groupName{
  font-size:16px;
  font-weight:600;
  line-height:1.2;
  color:#0f172a;
  word-break:break-word;
}
.groupCount{
  font-size:12px;
  color:#475569;
}
.iconRow{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  align-items:center;
}
.iconBtn{
  border:0;
  background:rgba(0,0,0,0.05);
  border-radius:999px;
  width:32px;
  height:32px;
  font-size:13px;
  line-height:1;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  color:#0f172a;
}
.iconBtn:hover{background:rgba(0,0,0,0.08);}
.iconBtn.danger{color:#b91c1c;}

.progressWrapGroup{
  height:4px;
  background:rgba(0,0,0,0.08);
  border-radius:999px;
  overflow:hidden;
}
.progressBarBusy{
  height:100%;
  background:#000;
  width:100%;
}
.resultList{
  font-size:12px;
  color:#0f172a;
  line-height:1.4;
  white-space:pre-wrap;
}

.groupActionsRow{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
}
.btnCircle{
  flex-shrink:0;
  width:44px;
  height:44px;
  border-radius:999px;
  background:rgba(0,0,0,0.04);
  border:1px solid rgba(0,0,0,0.1);
  color:#0f172a;
  font-size:12px;
  font-weight:500;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  line-height:1;
}
.btnCircle.small{width:40px;height:40px;font-size:11px;}
.btnCircle:hover{background:rgba(0,0,0,0.07);}

.groupMoreWrap{position:relative;}
.moreMenu{
  position:absolute;
  bottom:60px;
  right:0;
  background:rgba(255,255,255,0.9);
  backdrop-filter:blur(16px) saturate(180%);
  -webkit-backdrop-filter:blur(16px) saturate(180%);
  border:1px solid rgba(0,0,0,0.08);
  border-radius:16px;
  box-shadow:0 20px 40px rgba(0,0,0,.2);
  padding:8px;
  display:flex;
  flex-direction:column;
  min-width:140px;
  z-index:20;
}
.moreMenuBtn{
  all:unset;
  cursor:pointer;
  font-size:13px;
  padding:8px 10px;
  border-radius:12px;
  color:#0f172a;
  line-height:1.2;
}
.moreMenuBtn.danger{color:#b91c1c;}
.moreMenuBtn:hover{background:rgba(0,0,0,0.05);}


/* =============================
   MASTER CARD
   ============================= */
.masterCard{
  position:relative;
  padding:20px;
  display:flex;
  flex-direction:column;
  gap:16px;
}
.masterHeadTop{
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  gap:12px;
  align-items:flex-start;
}
.masterLeft{
  display:flex;
  flex-direction:column;
  gap:6px;
  min-width:0;
}
.masterRow1{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
  row-gap:6px;
}
.masterName{
  font-weight:600;
  font-size:15px;
  line-height:1.2;
  color:#0f172a;
}
.badgeOnline{
  font-size:11px;
  padding:2px 8px;
  border-radius:999px;
  font-weight:500;
  border:1px solid rgba(0,0,0,0.08);
  background:rgba(16,185,129,.12);
  color:#065f46;
}
.badgeOffline{
  font-size:11px;
  padding:2px 8px;
  border-radius:999px;
  font-weight:500;
  border:1px solid rgba(0,0,0,0.08);
  background:rgba(254,202,202,.4);
  color:#7f1d1d;
}
.masterMeta{
  font-size:12px;
  color:#475569;
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  line-height:1.4;
  align-items:center;
  word-break:break-word;
}
.metaBtn{
  font-size:12px;
  cursor:pointer;
  background:rgba(0,0,0,0.05);
  border:0;
  border-radius:999px;
  padding:2px 6px;
  line-height:1.2;
  color:#0f172a;
}
.metaBtn:hover{background:rgba(0,0,0,0.08);}
.masterActionsRow{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
}

.slaveGridWrap{
  width:100%;
  display:flex;
  justify-content:center;
}
.slaveGrid{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  gap:16px;
  width:100%;
}

/* =============================
   SLAVE CARD
   ============================= */
.slaveCard{
  position:relative;
  flex:1 1 140px;
  max-width:200px;
  min-width:140px;
  min-height:210px;
  background:rgba(255,255,255,0.55);
  border:1px solid rgba(0,0,0,0.08);
  border-radius:20px;
  box-shadow:0 16px 32px rgba(0,0,0,.12);
  padding:16px;
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  color:#0f172a;
}
.slaveInfoBtn{
  position:absolute;
  top:12px;
  right:12px;
  width:24px;
  height:24px;
  border-radius:999px;
  background:rgba(0,0,0,.05);
  border:0;
  font-size:12px;
  line-height:1;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  color:#0f172a;
}
.slaveInfoBtn:hover{background:rgba(0,0,0,.08);}
.slaveName{
  margin-top:24px;
  font-size:16px;
  font-weight:600;
  line-height:1.2;
  word-break:break-word;
  max-width:100%;
}
.pcState{
  margin-top:6px;
  font-size:12px;
  color:#475569;
  line-height:1.2;
}

.progressWrapSlave{
  margin-top:8px;
  width:100%;
  height:4px;
  background:rgba(0,0,0,0.08);
  border-radius:999px;
  overflow:hidden;
}
.progressBarSlave{
  height:100%;
  background:#000;
  width:100%;
}
.resultText{
  margin-top:6px;
  font-size:12px;
  color:#0f172a;
  line-height:1.4;
}

.slaveButtonsRow{
  margin-top:auto;
  display:flex;
  gap:10px;
  align-items:center;
  justify-content:center;
  flex-wrap:nowrap;
  width:100%;
}

/* menu "..." du slave */
.moreWrap{position:relative;}
.moreMenu{
  position:absolute;
  bottom:60px;
  right:0;
  background:rgba(255,255,255,0.9);
  backdrop-filter:blur(16px) saturate(180%);
  -webkit-backdrop-filter:blur(16px) saturate(180%);
  border:1px solid rgba(0,0,0,0.08);
  border-radius:16px;
  box-shadow:0 20px 40px rgba(0,0,0,.2);
  padding:8px;
  display:flex;
  flex-direction:column;
  min-width:140px;
  z-index:20;
}
.moreMenuBtn{
  all:unset;
  cursor:pointer;
  font-size:13px;
  padding:8px 10px;
  border-radius:12px;
  color:#0f172a;
  line-height:1.2;
}
.moreMenuBtn.danger{color:#b91c1c;}
.moreMenuBtn:hover{background:rgba(0,0,0,0.05);}

/* infoSheet dans un slave */
.infoSheet{
  position:absolute;
  inset:0;
  background:rgba(255,255,255,0.95);
  border-radius:20px;
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:10px;
  align-items:stretch;
  justify-content:flex-start;
  text-align:left;
  box-shadow:0 20px 40px rgba(0,0,0,.3);
  z-index:30;
}
.infoRowLabel{
  font-size:12px;
  color:#475569;
  line-height:1.3;
}
.infoMac{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px;
  color:#0f172a;
  word-break:break-all;
}
.infoInput{
  width:100%;
  border-radius:12px;
  border:1px solid rgba(0,0,0,0.15);
  background:#fff;
  padding:8px 10px;
  font-size:14px;
  color:#0f172a;
}
.infoActionsRow{
  display:flex;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
}
.smallBtn{
  flex:1;
  border-radius:12px;
  border:1px solid rgba(0,0,0,0.1);
  background:rgba(0,0,0,0.03);
  font-size:13px;
  padding:8px 10px;
  text-align:center;
  cursor:pointer;
  color:#0f172a;
  line-height:1.2;
}
.smallBtn.danger{color:#b91c1c;}
.smallBtn:hover{background:rgba(0,0,0,0.07);}

/* -------------- CMD HISTORY / JOURNAL -------------- */
.cmdSectionTitle{
  font-size:12px;
  color:#475569;
  line-height:1.4;
}
.cmdList{
  margin:0;
  padding-left:18px;
  max-height:100px;
  overflow:auto;
  font-size:12px;
  color:#475569;
  line-height:1.4;
}
.cmdList code{
  background:rgba(0,0,0,0.05);
  border-radius:6px;
  padding:1px 4px;
}

/* -------------- MODALS (pair-code, éditer membres, liste ON) -------------- */
.modalBackdrop{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,0.4);
  z-index:2000;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
}
.modalCard{
  background:rgba(255,255,255,0.9);
  backdrop-filter:blur(20px) saturate(180%);
  -webkit-backdrop-filter:blur(20px) saturate(180%);
  border-radius:20px;
  border:1px solid rgba(0,0,0,0.08);
  box-shadow:0 30px 60px rgba(0,0,0,.4);
  width:100%;
  max-width:400px;
  max-height:90vh;
  overflow:auto;
  padding:20px;
  color:#0f172a;
  display:flex;
  flex-direction:column;
  gap:16px;
}
.modalTitle{
  font-size:16px;
  font-weight:600;
  line-height:1.2;
}
.scrollY{
  max-height:40vh;
  overflow:auto;
  border:1px solid rgba(0,0,0,0.06);
  border-radius:12px;
  padding:12px;
  background:rgba(255,255,255,0.4);
}
.checkboxRow{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:14px;
  color:#0f172a;
  line-height:1.3;
  margin-bottom:8px;
}
.checkboxRow input{width:16px;height:16px;}
.smallNote{
  font-size:12px;
  color:#475569;
  line-height:1.4;
  word-break:break-word;
}
.rowEnd{
  display:flex;
  justify-content:flex-end;
  gap:8px;
  flex-wrap:wrap;
}
.rowBetween{
  display:flex;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
  align-items:flex-start;
}

/* Journal global debug */
.logBox{
  white-space:pre-wrap;
  font-size:12px;
  line-height:1.4;
  background:rgba(0,0,0,0.05);
  border:1px solid rgba(0,0,0,0.08);
  border-radius:16px;
  padding:12px;
  max-height:160px;
  overflow:auto;
  color:#0f172a;
}
`;

/* =============================
   HELPERS
   ============================= */
function isLive(device){
  return device.last_seen && (Date.now() - new Date(device.last_seen)) < LIVE_TTL_MS;
}
function fmtTS(s){
  return s ? new Date(s).toLocaleString() : "—";
}
function shortNameFromMac(mac){
  if(!mac) return "SLAVE";
  return mac;
}

/* =========================================================
   APP COMPONENT
   ========================================================= */
export default function App(){

  /* ---------- AUTH / USER ---------- */
  const [authReady,setAuthReady] = useState(false);
  const [user,setUser]           = useState(null);

  /* ---------- DATA ---------- */
  const [devices,setDevices]                 = useState([]);               // masters
  const [nodesByMaster,setNodesByMaster]     = useState({});               // { master_id: [ {mac,nameShort,pc_on,master_id}, ... ] }
  const [groups,setGroups]                   = useState([]);               // [ {id,name}, ... ]
  const [groupMembers,setGroupMembers]       = useState({});               // { group_id: [ {master_id,mac,nameShort,pc_on}, ... ] }

  /* ---------- CMD HISTORY + JOURNAL ---------- */
  const cmdLists = useRef(new Map()); // masterId -> <ul>
  const [lines,setLines] = useState([]);
  const logRef = useRef(null);
  function addLog(t){
    setLines(ls=>[...ls,`${new Date().toLocaleTimeString()}  ${t}`]);
  }
  useEffect(()=>{ if(logRef.current){logRef.current.scrollTop=logRef.current.scrollHeight;} },[lines]);

  /* ---------- UI STATE / MODALS ---------- */

  // Pairing MASTER dialog
  const [pairDialog,setPairDialog] = useState({
    open:false,
    code:null,
    expires_at:null,
  });

  // Slave info sheet open?
  const [openSlaveInfo,setOpenSlaveInfo] = useState({}); // mac -> bool
  // Slave "..." popover open?
  const [openSlaveMore,setOpenSlaveMore] = useState({}); // mac -> bool
  // Edit friendly name local buffer
  const [editNames,setEditNames] = useState({}); // mac -> string

  // Per-slave activity bar state
  // { [mac]: {phase:'idle'|'busy'|'done'|'err', msg:''} }
  const [slaveActivity,setSlaveActivity] = useState({});

  // GROUP side
  const [openGroupMore,setOpenGroupMore] = useState({}); // groupId -> bool
  // per-group activity (batch action)
  // { [groupId]: {phase:'idle'|'busy'|'done', okNames:[] } }
  const [groupActivity,setGroupActivity] = useState({});

  // group members editor modal
  const [editGroupId,setEditGroupId] = useState(null);

  // show list of "ON" members for a group
  const [listOnGroupId,setListOnGroupId] = useState(null);

  /* ---------- Realtime channels ---------- */
  const chDevices = useRef(null);
  const chNodes   = useRef(null);
  const chCmds    = useRef(null);

  /* =========================================================
     AUTH BOOTSTRAP
     ========================================================= */
  useEffect(()=>{
    // live listener
    const sub = sb.auth.onAuthStateChange(async (ev,session)=>{
      setUser(session?.user||null);
      if(session?.user){
        await attachRealtime();
        await loadAll();
      }else{
        cleanupRealtime();
        setDevices([]);
        setNodesByMaster({});
        setGroups([]);
        setGroupMembers({});
      }
      setAuthReady(true);
    });
    // initial
    (async()=>{
      const {data:{session}} = await sb.auth.getSession();
      setUser(session?.user||null);
      if(session?.user){
        await attachRealtime();
        await loadAll();
      }
      setAuthReady(true);
    })();
    return ()=>{
      sub.data.subscription.unsubscribe();
      cleanupRealtime();
    };
    // eslint-disable-next-line
  },[]);

  /* =========================================================
     REALTIME
     ========================================================= */
  async function cleanupRealtime(){
    if(chDevices.current) sb.removeChannel(chDevices.current);
    if(chNodes.current)   sb.removeChannel(chNodes.current);
    if(chCmds.current)    sb.removeChannel(chCmds.current);
    chDevices.current = null;
    chNodes.current   = null;
    chCmds.current    = null;
  }

  async function attachRealtime(){
    cleanupRealtime();

    // Devices & Nodes → on recharge tout (inclut pc_on live + groups)
    chDevices.current = sb.channel("rt:devices")
    .on('postgres_changes',
      {event:'INSERT',schema:'public',table:'devices'},
      ()=>{ addLog("[rt] device INSERT"); loadAll(); }
    )
    .on('postgres_changes',
      {event:'UPDATE',schema:'public',table:'devices'},
      ()=>{ addLog("[rt] device UPDATE"); loadAll(); }
    )
    .on('postgres_changes',
      {event:'DELETE',schema:'public',table:'devices'},
      ()=>{ addLog("[rt] device DELETE"); loadAll(); }
    )
    .subscribe();

    chNodes.current = sb.channel("rt:nodes")
    .on('postgres_changes',
      {event:'INSERT',schema:'public',table:'nodes'},
      ()=>{ addLog("[rt] node INSERT"); loadAll(); }
    )
    .on('postgres_changes',
      {event:'UPDATE',schema:'public',table:'nodes'},
      ()=>{ addLog("[rt] node UPDATE"); loadAll(); }
    )
    .on('postgres_changes',
      {event:'DELETE',schema:'public',table:'nodes'},
      ()=>{ addLog("[rt] node DELETE"); loadAll(); }
    )
    .subscribe();

    // Commands → on maintient historique + on gère "Succès"
    chCmds.current = sb.channel("rt:commands")
    .on('postgres_changes',
      {event:'INSERT',schema:'public',table:'commands'},
      payload=>{
        upsertCmdRow(payload.new.master_id,payload.new);
        addLog(`cmd + ${payload.new.action} (${payload.new.status}) → ${payload.new.master_id} ${payload.new.target_mac||""}`);
      }
    )
    .on('postgres_changes',
      {event:'UPDATE',schema:'public',table:'commands'},
      payload=>{
        upsertCmdRow(payload.new.master_id,payload.new);
        addLog(`cmd ~ ${payload.new.action} (${payload.new.status}) → ${payload.new.master_id} ${payload.new.target_mac||""}`);
        // si on reçoit acked => on conclut côté slaveActivity
        if(payload.new.target_mac && payload.new.status==="acked"){
          const mac = payload.new.target_mac;
          setSlaveActivity(sa=>{
            return {
              ...sa,
              [mac]: {phase:"done", msg:"Succès"},
            };
          });
          // cacher après 3s
          setTimeout(()=>{
            setSlaveActivity(sa=>{
              const cur = sa[mac];
              if(!cur || cur.phase!=="done"){
                return sa;
              }
              return {
                ...sa,
                [mac]: {phase:"idle", msg:""},
              };
            });
          },3000);
        }
      }
    )
    .subscribe();
  }

  /* =========================================================
     LOAD DATA (devices, nodes, groups, group_members, cmd history)
     ========================================================= */
  async function loadAll(){
    // 1. devices
    const {data:devs,error:ed}=await sb
      .from('devices')
      .select('id,name,master_mac,last_seen')
      .order('created_at',{ascending:false});
    if(ed){ addLog("Err devices: "+ed.message); return; }

    // 2. nodes
    const {data:nodes,error:en}=await sb
      .from('nodes')
      .select('master_id,slave_mac,friendly_name,pc_on');
    if(en){ addLog("Err nodes: "+en.message); return; }

    // build nodesByMaster + flat list
    const nbm={};
    const flatSlaves=[];
    (nodes||[]).forEach(n=>{
      const obj={
        master_id:n.master_id,
        mac:n.slave_mac,
        nameShort:n.friendly_name || shortNameFromMac(n.slave_mac),
        pc_on:!!n.pc_on,
      };
      if(!nbm[n.master_id]) nbm[n.master_id]=[];
      nbm[n.master_id].push(obj);
      flatSlaves.push(obj);
    });

    // 3. groups
    const {data:grps,error:eg}=await sb
      .from('groups')
      .select('id,name')
      .order('created_at',{ascending:true});
    if(eg){ addLog("Err groups: "+eg.message); }

    // 4. group_members
    const {data:gmembers,error:em}=await sb
      .from('group_members')
      .select('group_id,master_id,slave_mac');
    if(em){ addLog("Err group_members: "+em.message); }

    const gmap={};
    (grps||[]).forEach(g=>{gmap[g.id]=[];});
    (gmembers||[]).forEach(m=>{
      let match = flatSlaves.find(
        s=>s.master_id===m.master_id && s.mac===m.slave_mac
      );
      if(!match){
        match = {
          master_id:m.master_id,
          mac:m.slave_mac,
          nameShort:m.slave_mac,
          pc_on:false,
        };
      }
      if(!gmap[m.group_id]) gmap[m.group_id]=[];
      gmap[m.group_id].push(match);
    });

    setDevices(devs||[]);
    setNodesByMaster(nbm);
    setGroups(grps||[]);
    setGroupMembers(gmap);

    // 5. refresh cmd lists for each master (remplir seulement si vide)
    for(const d of devs||[]){
      await refreshCommands(d.id);
    }
  }

  /* load / refresh last 20 commands for one master and render into cmdLists ref
     FIX ANTI-FLICKER:
     - on ne vide / rerend QUE si la liste était vide.
     - sinon on laisse le realtime ajouter progressivement.
  */
  async function refreshCommands(masterId){
    const ul = cmdLists.current.get(masterId);
    if(!ul) return;

    // si déjà des lignes → on ne touche pas (évite le clignotement)
    if(ul.children.length > 0){
      return;
    }

    const {data, error} = await sb
      .from('commands')
      .select('id,action,target_mac,status,created_at')
      .eq('master_id', masterId)
      .order('created_at',{ascending:false})
      .limit(20);

    if(error){
      addLog("Err cmds: "+error.message);
      return;
    }

    // liste vide → on la peuple une première fois
    (data||[]).forEach(c => upsertCmdRow(masterId,c));
  }

  /* insère/MAJ une ligne dans l'historique d'un master */
  function upsertCmdRow(masterId, c){
    const ul = cmdLists.current.get(masterId);
    if(!ul) return;
    const id = `cmd-${c.id}`;
    const html = `<code>${c.status}</code> · ${c.action}${c.target_mac?' → '+c.target_mac:' (local)'} <span class="smallLabel">· ${fmtTS(c.created_at)}</span>`;
    let li = ul.querySelector(`#${CSS.escape(id)}`);
    if(!li){
      li = document.createElement("li");
      li.id = id;
      li.innerHTML = html;
      ul.prepend(li);
      while(ul.children.length>20) ul.removeChild(ul.lastChild);
    }else{
      li.innerHTML=html;
    }
  }

  /* =========================================================
     COMMAND HELPERS (SLAVE / MASTER / GROUP)
     ========================================================= */

  async function sendCmd(masterId, targetMac, action, payload={}){
    const {error} = await sb.from('commands').insert({
      master_id: masterId,
      target_mac: targetMac || null,
      action,
      payload
    });
    if(error){
      addLog("cmd err: "+error.message);
      return false;
    } else {
      addLog(`[cmd] ${action} → ${masterId}${targetMac?" ▶ "+targetMac:""}`);
      return true;
    }
  }

  /* Quand on tape un seul slave (IO / RESET / ...).
     On affiche la barre noire "busy", on laissera le realtime 'acked'
     nous mettre en "done" => 'Succès' / puis disparition. */
  function runSlaveAction(slave, action, payload){
    // mark busy
    setSlaveActivity(sa=>{
      return {
        ...sa,
        [slave.mac]: {phase:"busy",msg:""},
      };
    });
    // send
    sendCmd(slave.master_id, slave.mac, action, payload);
  }

  // group action: lancer sur tous les membres
  async function runGroupAction(groupId, action, payload){
    const members = groupMembers[groupId] || [];
    // phase busy pour le groupe
    setGroupActivity(ga=>({
      ...ga,
      [groupId]:{phase:"busy",okNames:[]}
    }));
    // mettre chaque slave en busy
    members.forEach(m=>{
      setSlaveActivity(sa=>({
        ...sa,
        [m.mac]:{phase:"busy",msg:""}
      }));
    });

    // envoi en parallèle
    const promises = members.map(m=>{
      return sendCmd(m.master_id, m.mac, action, payload).then(ok=>({
        ok,
        name:m.nameShort||m.mac
      }));
    });
    const results = await Promise.all(promises);
    const okNames = results.filter(r=>r.ok).map(r=>r.name);

    // marquer groupe comme "done" + liste succès
    setGroupActivity(ga=>({
      ...ga,
      [groupId]:{phase:"done", okNames}
    }));
    // on "done" les slaves tout de suite; le realtime 'acked' fera pareil
    members.forEach(m=>{
      setSlaveActivity(sa=>({
        ...sa,
        [m.mac]:{phase:"done",msg:"Succès"}
      }));
    });

    // puis on efface après quelques secondes
    setTimeout(()=>{
      setGroupActivity(ga=>{
        const cur=ga[groupId];
        if(!cur || cur.phase!=="done") return ga;
        return {...ga,[groupId]:{phase:"idle",okNames:[]}};
      });
      members.forEach(m=>{
        setSlaveActivity(sa=>{
          const cur=sa[m.mac];
          if(!cur || cur.phase!=="done") return sa;
          return {...sa,[m.mac]:{phase:"idle",msg:""}};
        });
      });
    },3000);
  }

  /* =========================================================
     MASTER MANAGEMENT
     ========================================================= */
  async function renameMaster(masterId){
    const name = prompt("Nouveau nom du master ?","");
    if(!name) return;
    const {error} = await sb.from('devices').update({name}).eq('id',masterId);
    if(error){ alert(error.message); }
    else { addLog(`Renommé ${masterId} → ${name}`); }
  }

  async function deleteMaster(masterId){
    if(!confirm(`Supprimer ${masterId} ?`)) return;
    const {data:{session}} = await sb.auth.getSession();
    if(!session){ alert("Non connecté"); return; }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        apikey:SUPA_ANON,
        Authorization:`Bearer ${session.access_token}`
      },
      body:JSON.stringify({ master_id:masterId })
    });
    addLog(r.ok?`MASTER supprimé : ${masterId}`:`❌ Suppression : ${await r.text()}`);
  }

  /* =========================================================
     SLAVE INFO / RENAME
     ========================================================= */
  function toggleSlaveInfo(mac){
    setOpenSlaveInfo(m=>({...m,[mac]:!m[mac]}));
  }
  function toggleSlaveMore(mac){
    setOpenSlaveMore(m=>({...m,[mac]:!m[mac]}));
  }

  function onEditNameChange(mac,val){
    setEditNames(n=>({...n,[mac]:val}));
  }
  async function submitSlaveRename(masterId,mac){
    const newName = editNames[mac]?.trim();
    if(!newName) return;
    const {error} = await sb
      .from('nodes')
      .update({friendly_name:newName})
      .eq('master_id',masterId)
      .eq('slave_mac',mac);
    if(error){
      alert(error.message);
      return;
    }
    addLog(`Renommé ${mac} → ${newName}`);
    loadAll();
    setOpenSlaveInfo(m=>({...m,[mac]:false}));
  }

  /* =========================================================
     GROUPS MANAGEMENT
     ========================================================= */
  function toggleGroupMore(groupId){
    setOpenGroupMore(m=>({...m,[groupId]:!m[groupId]}));
  }

  // create group
  async function createGroup(){
    const nm = prompt("Nom du groupe ?");
    if(!nm) return;
    const uid = user?.id;
    if(!uid){ alert("Non connecté"); return; }
    const {error} = await sb.from('groups').insert({name:nm,owner_uid:uid});
    if(error){
      alert("Erreur création groupe: "+error.message);
      return;
    }
    addLog("Groupe créé : "+nm);
    loadAll();
  }

  async function renameGroup(groupId){
    const nm = prompt("Nouveau nom du groupe ?");
    if(!nm) return;
    const {error} = await sb.from('groups').update({name:nm}).eq('id',groupId);
    if(error){
      alert("Erreur rename: "+error.message);
      return;
    }
    addLog("Groupe renommé "+groupId+" → "+nm);
    loadAll();
  }

  async function deleteGroup(groupId){
    if(!confirm("Supprimer ce groupe ?")) return;
    const {error} = await sb.from('groups').delete().eq('id',groupId);
    if(error){
      alert("Erreur suppression groupe: "+error.message);
      return;
    }
    addLog("Groupe supprimé "+groupId);
    loadAll();
  }

  // éditeur membres
  function openEditGroupMembers(id){
    setEditGroupId(id);
  }
  function closeEditGroupMembers(){
    setEditGroupId(null);
  }

  async function saveGroupMembers(groupId, selectedKeys){
    // selectedKeys: Set("masterId|mac")
    const current = groupMembers[groupId]||[];
    const curSet = new Set(current.map(m=>`${m.master_id}|${m.mac}`));

    // -> inserts
    const toAdd = [];
    selectedKeys.forEach(k=>{
      if(!curSet.has(k)){
        const [mid,mac] = k.split("|");
        toAdd.push({group_id:groupId, master_id:mid, slave_mac:mac});
      }
    });

    // -> deletes
    const toRemove = [];
    curSet.forEach(k=>{
      if(!selectedKeys.has(k)){
        const [mid,mac] = k.split("|");
        toRemove.push({master_id:mid, slave_mac:mac});
      }
    });

    if(toAdd.length){
      const {error} = await sb.from('group_members').insert(toAdd);
      if(error){ alert("Erreur insert membres: "+error.message); }
    }
    for(const rem of toRemove){
      const {error} = await sb
        .from('group_members')
        .delete()
        .eq('group_id',groupId)
        .eq('master_id',rem.master_id)
        .eq('slave_mac',rem.slave_mac);
      if(error){ alert("Erreur delete membre: "+error.message); }
    }

    addLog(`Membres groupe ${groupId} mis à jour`);
    await loadAll();
    setEditGroupId(null);
  }

  function openListOn(groupId){
    setListOnGroupId(groupId);
  }
  function closeListOn(){
    setListOnGroupId(null);
  }

  /* =========================================================
     PAIR MASTER DIALOG
     ========================================================= */
  async function openPairDialog(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){ alert("Non connecté"); return; }
    try{
      const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          apikey:SUPA_ANON,
          Authorization:`Bearer ${session.access_token}`
        },
        body:JSON.stringify({ ttl_minutes:10 })
      });
      if(!r.ok){
        alert(await r.text());
        return;
      }
      const {code,expires_at} = await r.json();
      setPairDialog({
        open:true,
        code,
        expires_at
      });
      addLog(`Pair-code ${code}`);
    }catch(e){
      addLog("Erreur pair-code: "+e);
    }
  }
  function closePairDialog(){
    setPairDialog({open:false,code:null,expires_at:null});
  }

  /* =========================================================
     LOGIN LOGOUT
     ========================================================= */
  async function signInGoogle(){
    const {data,error} = await sb.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo:location.href,
        queryParams:{prompt:"select_account"},
      }
    });
    if(error){
      alert(error.message);
    }else if(data?.url){
      location.href=data.url;
    }
  }
  async function signOut(){
    await sb.auth.signOut();
  }

  /* =========================================================
     RENDER SUBCOMPONENTS
     ========================================================= */

  /* --------------- SlaveCard --------------- */
  function SlaveCard({slave}){
    const mac    = slave.mac;
    const isInfo = !!openSlaveInfo[mac];
    const isMore = !!openSlaveMore[mac];
    const act    = slaveActivity[mac] || {phase:"idle",msg:""};

    const showBar = act.phase==="busy";
    const showDoneMsg = (act.phase==="done" && act.msg);

    return (
      <div className="slaveCard">

        <button className="slaveInfoBtn" onClick={()=>toggleSlaveInfo(mac)}>i</button>

        <div className="slaveName">{slave.nameShort||shortNameFromMac(mac)}</div>
        <div className="pcState">
          {slave.pc_on ? "Ordinateur allumé" : "Ordinateur éteint"}
        </div>

        {showBar && (
          <div className="progressWrapSlave">
            <div className="progressBarSlave"/>
          </div>
        )}

        {!showBar && showDoneMsg && (
          <div className="resultText">{act.msg}</div>
        )}

        <div className="slaveButtonsRow">
          <button
            className="btnCircle small"
            title="IO"
            onClick={()=>runSlaveAction(
              slave,
              "SLV_IO",
              {pin:DEFAULT_IO_PIN,mode:"OUT",value:1}
            )}
          >IO</button>

          <button
            className="btnCircle small"
            title="RESET"
            onClick={()=>runSlaveAction(slave,"SLV_RESET",{})}
          >RST</button>

          <div className="moreWrap">
            <button
              className="btnCircle small"
              title="Plus…"
              onClick={()=>toggleSlaveMore(mac)}
            >⋯</button>

            {isMore && (
              <div className="moreMenu">
                <button
                  className="moreMenuBtn danger"
                  onClick={()=>{
                    runSlaveAction(slave,"SLV_FORCE_OFF",{});
                    toggleSlaveMore(mac);
                  }}
                >Hard OFF</button>
                <button
                  className="moreMenuBtn danger"
                  onClick={()=>{
                    runSlaveAction(slave,"SLV_HARD_RESET",{ms:3000});
                    toggleSlaveMore(mac);
                  }}
                >Hard RESET</button>
              </div>
            )}
          </div>
        </div>

        {isInfo && (
          <div className="infoSheet">
            <div className="infoRowLabel">Nom du slave</div>
            <input
              className="infoInput"
              value={editNames[mac] ?? slave.nameShort ?? ""}
              onChange={e=>onEditNameChange(mac,e.target.value)}
              placeholder="Nom lisible"
            />

            <div className="infoRowLabel">Adresse MAC</div>
            <div className="infoMac">{mac}</div>

            <div className="infoActionsRow">
              <button
                className="smallBtn"
                onClick={()=>submitSlaveRename(slave.master_id,mac)}
              >Enregistrer</button>
              <button
                className="smallBtn"
                onClick={()=>toggleSlaveInfo(mac)}
              >Fermer</button>
            </div>
          </div>
        )}

      </div>
    );
  }

  /* --------------- MasterCard --------------- */
  function MasterCard({dev, slaves}){
    const live = isLive(dev);

    return (
      <section className="glassCard masterCard">

        <div className="masterHeadTop">
          <div className="masterLeft">
            <div className="masterRow1">
              <div className="masterName">{dev.name||"MASTER"}</div>
              <span className={live?"badgeOnline":"badgeOffline"}>
                {live?"EN LIGNE":"HORS LIGNE"}
              </span>
            </div>

            <div className="masterMeta">
              <div>Dernier contact : {fmtTS(dev.last_seen)||"jamais"}</div>
              <div className="smallLabel">ID : <code>{dev.id}</code></div>
              <div className="smallLabel">MAC : <code>{dev.master_mac||"—"}</code></div>
            </div>

            <div className="masterActionsRow">
              <button className="metaBtn" onClick={()=>renameMaster(dev.id)}>Renommer</button>
              <button className="metaBtn dangerBtn" onClick={()=>deleteMaster(dev.id)}>Supprimer</button>
              <button
                className="metaBtn"
                onClick={()=>sendCmd(dev.id,null,"PULSE",{ms:500})}
              >Pulse</button>
              <button
                className="metaBtn"
                onClick={()=>sendCmd(dev.id,null,"POWER_ON",{})}
              >Power ON</button>
              <button
                className="metaBtn"
                onClick={()=>sendCmd(dev.id,null,"POWER_OFF",{})}
              >Power OFF</button>
              <button
                className="metaBtn"
                onClick={()=>sendCmd(dev.id,null,"RESET",{})}
              >Reset</button>
            </div>
          </div>
        </div>

        <div className="slaveGridWrap">
          <div className="slaveGrid">
            {slaves.map(sl=>(
              <SlaveCard key={sl.mac} slave={sl}/>
            ))}
          </div>
        </div>

        <div style={{marginTop:12}}>
          <div className="cmdSectionTitle">Commandes (20 dernières)</div>
          <ul
            className="cmdList"
            ref={el=>{ if(el) cmdLists.current.set(dev.id,el); }}
          />
        </div>
      </section>
    );
  }

  /* --------------- GroupCard --------------- */
  function GroupCard({group, members}){
    const gid = group.id;
    const st  = groupActivity[gid] || {phase:"idle",okNames:[]};

    const onCount = members.filter(m=>m.pc_on).length;
    const total   = members.length;
    const showBar = (st.phase==="busy");
    const showDone= (st.phase==="done");

    return (
      <div className="groupCard">

        <div className="groupHeaderTop">
          <div className="groupNameBlock">
            <div className="groupName">{group.name||"GROUPE"}</div>
            <div className="groupCount">{onCount}/{total} allumé</div>
          </div>

          <div className="iconRow">
            <button className="iconBtn" title="Membres"
              onClick={()=>openEditGroupMembers(gid)}>👥</button>

            <button className="iconBtn" title="Voir ON"
              onClick={()=>openListOn(gid)}>👁</button>

            <button className="iconBtn" title="Renommer"
              onClick={()=>renameGroup(gid)}>✎</button>

            <button className="iconBtn danger" title="Supprimer"
              onClick={()=>deleteGroup(gid)}>🗑</button>
          </div>
        </div>

        {showBar && (
          <div className="progressWrapGroup">
            <div className="progressBarBusy"></div>
          </div>
        )}

        {showDone && (
          <div className="resultList">
            Succès:
            {" "}
            {st.okNames.length
              ? st.okNames.join(", ")
              : "aucun ?" }
          </div>
        )}

        <div className="groupActionsRow">
          <button
            className="btnCircle small"
            title="IO"
            onClick={()=>runGroupAction(
              gid,
              "SLV_IO",
              {pin:DEFAULT_IO_PIN,mode:"OUT",value:1}
            )}
          >IO</button>

          <button
            className="btnCircle small"
            title="RESET"
            onClick={()=>runGroupAction(gid,"SLV_RESET",{})}
          >RST</button>

          <div className="groupMoreWrap">
            <button
              className="btnCircle small"
              title="Plus…"
              onClick={()=>toggleGroupMore(gid)}
            >⋯</button>

            {openGroupMore[gid] && (
              <div className="moreMenu">
                <button
                  className="moreMenuBtn danger"
                  onClick={()=>{
                    runGroupAction(gid,"SLV_FORCE_OFF",{});
                    toggleGroupMore(gid);
                  }}
                >Hard OFF (tous)</button>
                <button
                  className="moreMenuBtn danger"
                  onClick={()=>{
                    runGroupAction(gid,"SLV_HARD_RESET",{ms:3000});
                    toggleGroupMore(gid);
                  }}
                >Hard RESET (tous)</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --------------- GroupsSection --------------- */
  function GroupsSection(){
    return (
      <section className="glassCard groupsSectionCard">
        <div className="groupsHeaderRow">
          <div className="groupsHeaderLeft">
            <div className="groupsTitle">Groupes</div>
            <div className="smallLabel">
              Déclenche plusieurs machines en même temps.
            </div>
          </div>

          <div className="topbarRightRow">
            <button className="primaryBtn" onClick={createGroup}>
              Nouveau groupe
            </button>
          </div>
        </div>

        <div className="groupsRow">
          {groups.map(g=>(
            <GroupCard
              key={g.id}
              group={g}
              members={groupMembers[g.id]||[]}
            />
          ))}
          {!groups.length && (
            <div className="smallLabel">
              Aucun groupe pour l’instant.
            </div>
          )}
        </div>
      </section>
    );
  }

  /* =========================================================
     MODALS
     ========================================================= */

  /* --- Pair-code modal --- */
  function PairDialogModal(){
    if(!pairDialog.open) return null;
    const endMs = pairDialog.expires_at
      ? new Date(pairDialog.expires_at).getTime()
      : 0;
    const remainingSec = Math.max(0, Math.floor((endMs-Date.now())/1000));
    const mm = Math.floor(remainingSec/60);
    const ss = String(remainingSec%60).padStart(2,"0");

    return (
      <div className="modalBackdrop" onClick={closePairDialog}>
        <div className="modalCard" onClick={e=>e.stopPropagation()}>
          <div className="modalTitle">Appairer un MASTER</div>

          <div className="smallLabel">
            Code :
            {" "}
            <code style={{
              fontWeight:600,
              fontSize:"16px",
              padding:"2px 6px",
              borderRadius:"8px",
              background:"rgba(0,0,0,0.05)"
            }}>
              {String(pairDialog.code||"").padStart(6,"0")}
            </code>
          </div>

          <div className="smallLabel">
            Expire dans {mm}:{ss}
          </div>

          <div className="smallNote">
            Saisis ce code dans le portail Wi-Fi du MASTER
            (mode config). Une fois validé, il apparaîtra ici.
          </div>

          <div className="rowEnd">
            <button className="primaryBtn" onClick={closePairDialog}>Fermer</button>
          </div>
        </div>
      </div>
    );
  }

  /* --- Group Members Editor modal --- */
  function GroupMembersEditor(){
    if(!editGroupId) return null;
    const gid = editGroupId;
    const grp = groups.find(g=>g.id===gid);

    // liste de tous les slaves (tous masters confondus)
    const allSlaves = useMemo(()=>{
      const acc=[];
      Object.values(nodesByMaster).forEach(arr=>{
        arr.forEach(sl=>{
          acc.push(sl);
        });
      });
      return acc;
    },[nodesByMaster]);

    // membres actuels du groupe -> set de "masterId|mac"
    const curSet = useMemo(()=>{
      const set=new Set();
      (groupMembers[gid]||[]).forEach(m=>{
        set.add(`${m.master_id}|${m.mac}`);
      });
      return set;
    },[gid,groupMembers]);

    const [localSel,setLocalSel] = useState(curSet);

    // sync si on ouvre un autre groupe
    useEffect(()=>{
      const newSet=new Set();
      (groupMembers[gid]||[]).forEach(m=>{
        newSet.add(`${m.master_id}|${m.mac}`);
      });
      setLocalSel(newSet);
    },[gid]);

    function toggleOne(masterId,mac){
      const key=`${masterId}|${mac}`;
      setLocalSel(sel=>{
        const n=new Set(sel);
        if(n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    }

    return (
      <div className="modalBackdrop" onClick={closeEditGroupMembers}>
        <div className="modalCard" onClick={e=>e.stopPropagation()}>
          <div className="modalTitle">
            Membres du groupe
            {" "}
            <strong>{grp?.name||"?"}</strong>
          </div>

          <div className="scrollY">
            {allSlaves.length===0 && (
              <div className="smallNote">
                Aucun slave détecté.
              </div>
            )}
            {allSlaves.map(sl=>{
              const key=`${sl.master_id}|${sl.mac}`;
              return (
                <label key={key} className="checkboxRow">
                  <input
                    type="checkbox"
                    checked={localSel.has(key)}
                    onChange={()=>toggleOne(sl.master_id,sl.mac)}
                  />
                  <span>
                    <strong>{sl.nameShort||sl.mac}</strong><br/>
                    <span className="smallLabel">
                      {sl.mac} • Master {sl.master_id.slice(0,8)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="rowBetween">
            <button
              className="primaryBtn"
              onClick={()=>saveGroupMembers(gid, localSel)}
            >
              Enregistrer
            </button>
            <button
              className="primaryBtn"
              onClick={closeEditGroupMembers}
            >
              Annuler
            </button>
          </div>

          <div className="smallNote">
            Astuce : tu peux mettre dans un même groupe
            des slaves issus de masters différents.
          </div>
        </div>
      </div>
    );
  }

  /* --- Group "ON list" modal --- */
  function GroupOnListModal(){
    if(!listOnGroupId) return null;
    const gid = listOnGroupId;
    const grp = groups.find(g=>g.id===gid);
    const members = groupMembers[gid]||[];
    const onMembers = members.filter(m=>m.pc_on);

    return (
      <div className="modalBackdrop" onClick={closeListOn}>
        <div className="modalCard" onClick={e=>e.stopPropagation()}>
          <div className="modalTitle">
            Machines allumées
            {" "}
            <strong>{grp?.name||"?"}</strong>
          </div>

          <div className="scrollY">
            {onMembers.length===0 ? (
              <div className="smallNote">
                Aucune machine allumée dans ce groupe.
              </div>
            ):(
              onMembers.map(m=>(
                <div key={m.master_id+"|"+m.mac} className="smallNote">
                  <strong>{m.nameShort||m.mac}</strong><br/>
                  <span className="smallLabel">
                    {m.mac} • Master {m.master_id.slice(0,8)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="rowEnd">
            <button className="primaryBtn" onClick={closeListOn}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     MAIN RENDER
     ========================================================= */
  // Quand authReady=false, on n'affiche rien (évite flash logout/login)
  if(!authReady){
    return (
      <>
        <style>{STYLES}</style>
        <div className="pageBg">
          <div className="topbar">
            <div className="topbarTitle">REMOTE POWER</div>
            <div className="topbarRightRow">
              <div className="smallLabel">Chargement…</div>
            </div>
          </div>
          <div className="contentWrap">
            <div className="smallLabel">Initialisation…</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>

      <div className="pageBg">
        {/* ---------- TOP BAR ---------- */}
        <div className="topbar">
          <div className="topbarTitle">REMOTE POWER</div>

          <div className="topbarRightRow">
            <div className="tagUser">
              {user?.email || "non connecté"}
            </div>

            {!user ? (
              <button className="primaryBtn" onClick={signInGoogle}>
                Connexion Google
              </button>
            ) : (
              <>
                <button className="primaryBtn" onClick={signOut}>
                  Déconnexion
                </button>

                <button className="primaryBtn" onClick={openPairDialog}>
                  Ajouter un MASTER
                </button>
              </>
            )}
          </div>
        </div>

        {/* ---------- CONTENT ---------- */}
        <main className="contentWrap">

          {/* SECTION GROUPES */}
          {user && (
            <GroupsSection/>
          )}

          {/* MASTERS */}
          {devices.map(dev=>{
            const slaves = nodesByMaster[dev.id]||[];
            return (
              <MasterCard
                key={dev.id}
                dev={dev}
                slaves={slaves}
              />
            );
          })}

          {!devices.length && (
            <div className="smallLabel">
              Aucun MASTER pour l’instant.
              Ajoute-en un avec “Ajouter un MASTER”.
            </div>
          )}

          {/* JOURNAL DEBUG */}
          <section className="glassCard" style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:"8px"}}>
            <div className="groupsTitle">Journal</div>
            <div className="logBox" ref={logRef}>
              {lines.join("\n")}
            </div>
          </section>

        </main>

        {/* MODALS */}
        <PairDialogModal/>
        <GroupMembersEditor/>
        <GroupOnListModal/>
      </div>
    </>
  );
}
