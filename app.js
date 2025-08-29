/* HIZAYA PWA – Auth Supabase + MQTT.js (WSS HiveMQ Cloud) */

(function(){
  const $ = (sel) => document.querySelector(sel);
  const elMasters = $("#masters");
  const elLog = $("#log");

  const LS_KEYS = { masters:"hz_masters" };
  const state = {
    user: null,
    masters: load(LS_KEYS.masters) || [],
    client: null,
    connected: false,
    subs: {},
  };

  // Broker vars depuis index.html
  const MQTT_URL = window.__MQTT_URL__;
  const MQTT_USER = window.__MQTT_USER__;
  const MQTT_PASS = window.__MQTT_PASS__;

  function log(...a){ if(elLog){ elLog.textContent += a.join(" ") + "\n"; elLog.scrollTop = elLog.scrollHeight; } console.log(...a); }
  function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function load(k){ try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch{ return null; } }
  const up = (s)=> (s||"").trim().toUpperCase();

  /* ---------- Routing ---------- */
  function showMain(){ $("#page-login").classList.add("hidden"); $("#page-main").classList.remove("hidden"); $("#who").textContent=`Connecté: ${state.user.email}`; $("#btnLogout").classList.remove("hidden"); renderMasters(); }
  function showLogin(){ $("#page-main").classList.add("hidden"); $("#page-login").classList.remove("hidden"); $("#who").textContent="Hors ligne"; $("#btnLogout").classList.add("hidden"); }

  /* ---------- Auth Supabase ---------- */
  async function initAuth(){
    const session = await window.hzAuth.getSession();
    if(session?.user){ state.user = session.user; showMain(); } else { showLogin(); }

    window.addEventListener("supabase-auth", (e)=>{
      const s = e.detail?.session;
      if(s?.user){ state.user = s.user; showMain(); } else { state.user=null; disconnectMQTT(); showLogin(); }
    });

    $("#btnGoogle").onclick = ()=> window.hzAuth.loginWithGoogle();
    $("#btnLogout").onclick = ()=> window.hzAuth.logout();
  }

  /* ---------- Masters UI ---------- */
  function persist(){ save(LS_KEYS.masters, state.masters); }
  function renderMasters(){
    elMasters.innerHTML = "";
    if(state.masters.length===0){
      const d=document.createElement("div"); d.className="text-slate-600"; d.textContent="Aucun master. Ajoute un MASTER_ID ci-dessus.";
      elMasters.appendChild(d); return;
    }
    state.masters.forEach((m)=>{
      const card = document.createElement("div"); card.className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4";
      const head = document.createElement("div"); head.className="flex items-center justify-between gap-3 mb-3";
      const left = document.createElement("div"); left.className="flex items-center gap-3";
      const logo = document.createElement("div"); logo.className="h-10 w-10 rounded-2xl bg-slate-900 text-white grid place-items-center"; logo.textContent="🖥️";
      const title = document.createElement("div");
      const h3 = document.createElement("div"); h3.className="text-lg font-semibold"; h3.textContent = m.name;
      const sub = document.createElement("div"); sub.className="text-xs text-slate-500"; sub.textContent = `ID: ${m.id}`;
      left.append(logo,title); title.append(h3,sub);

      const right=document.createElement("div"); right.className="flex items-center gap-2";
      const chip=document.createElement("span"); chip.className="text-xs px-2 py-1 rounded-full border"; chip.textContent=m.online?"online":"offline";
      const btnScan=document.createElement("button"); btnScan.className="px-3 py-1.5 rounded-xl bg-white border hover:bg-slate-50"; btnScan.textContent="Scan"; btnScan.onclick=()=>doScan(m.id);
      const btnDel=document.createElement("button"); btnDel.className="px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700"; btnDel.textContent="Supprimer"; btnDel.onclick=()=>removeMaster(m.id);
      right.append(chip,btnScan,btnDel);
      head.append(left,right); card.appendChild(head);

      const row=document.createElement("div"); row.className="flex items-center gap-3 text-sm mb-2";
      const lbl=document.createElement("span"); lbl.className="hidden sm:inline text-slate-600"; lbl.textContent="Nom du master :";
      const inp=document.createElement("input"); inp.className="px-3 py-2 rounded-xl border border-slate-300"; inp.value=m.name;
      let timer=null; inp.oninput=()=>{ clearTimeout(timer); timer=setTimeout(()=>renameMaster(m.id, inp.value.trim()||"Master"), 500); };
      row.append(lbl,inp); card.appendChild(row);

      const dv=document.createElement("div"); dv.className="h-px bg-slate-200 my-3"; card.appendChild(dv);

      const grid=document.createElement("div"); grid.className="grid md:grid-cols-2 gap-6";

      // Slaves
      const colL=document.createElement("div");
      const h4L=document.createElement("div"); h4L.className="font-medium mb-2"; h4L.textContent="Mes appareils"; colL.appendChild(h4L);
      const listL=document.createElement("div"); listL.className="divide-y rounded-xl border overflow-hidden";
      if(!m.slaves || m.slaves.length===0){ const empty=document.createElement("div"); empty.className="text-sm text-slate-500 p-4"; empty.textContent="Aucun appareil pairé."; listL.appendChild(empty); }
      else {
        m.slaves.forEach(s=>{
          const row=document.createElement("div"); row.className="p-3 bg-white";
          const top=document.createElement("div"); top.className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3";

          const left=document.createElement("div"); left.className="min-w-0";
          const name=document.createElement("input"); name.className="w-full px-3 py-2 rounded-xl border border-slate-300"; name.value=s.name;
          name.onchange = ()=> doRenameSlave(m.id, s.mac, name.value.trim()||"Device");
          const mac=document.createElement("div"); mac.className="text-xs text-slate-500 font-mono mt-1"; mac.textContent=s.mac; left.append(name,mac);

          const right=document.createElement("div"); right.className="flex items-center gap-4";
          const g0=document.createElement("div"); g0.className="flex items-center gap-2 text-xs"; const lab0=document.createElement("span"); lab0.textContent="LED V";
          const sw0=makeSwitch(!!s.led0,(v)=>doLed(m.id,s.mac,0,v)); g0.append(lab0,sw0);
          const g1=document.createElement("div"); g1.className="flex items-center gap-2 text-xs"; const lab1=document.createElement("span"); lab1.textContent="LED B";
          const sw1=makeSwitch(!!s.led1,(v)=>doLed(m.id,s.mac,1,v)); g1.append(lab1,sw1);
          const bdel=document.createElement("button"); bdel.className="px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700"; bdel.textContent="Supprimer"; bdel.onclick=()=>doDeleteSlave(m.id, s.mac);
          right.append(g0,g1,bdel);

          top.append(left,right); row.appendChild(top); listL.appendChild(row);
        });
      }
      colL.appendChild(listL);

      // Découverte
      const colR=document.createElement("div");
      const headR=document.createElement("div"); headR.className="flex items-center justify-between mb-2";
      const h4R=document.createElement("div"); h4R.className="font-medium"; h4R.textContent="Découverte";
      const bRefresh=document.createElement("button"); bRefresh.className="px-3 py-1.5 rounded-xl bg-white border hover:bg-slate-50"; bRefresh.textContent="Rafraîchir"; bRefresh.onclick=()=>doScan(m.id);
      headR.append(h4R,bRefresh); colR.appendChild(headR);

      const listR=document.createElement("div"); listR.className="divide-y rounded-xl border overflow-hidden";
      if(!m.discovered || m.discovered.length===0){ const empty=document.createElement("div"); empty.className="text-sm text-slate-500 p-4"; empty.textContent="Aucun appareil en vue. Lance un scan puis mets le Slave en mode pairing."; listR.appendChild(empty); }
      else {
        m.discovered.forEach(d=>{
          const row=document.createElement("div"); row.className="p-3 bg-white flex items-center justify-between gap-3";
          const left=document.createElement("div"); const mac=document.createElement("div"); mac.className="font-mono text-sm"; mac.textContent=d.mac;
          const rssi=document.createElement("div"); rssi.className="text-xs text-slate-500"; rssi.textContent=`RSSI ${d.rssi}`; left.append(mac,rssi);
          const bpair=document.createElement("button"); bpair.className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:opacity-90"; bpair.textContent="Pairer"; bpair.onclick=()=>doPair(m.id,d.mac);
          row.append(left,bpair); listR.appendChild(row);
        });
      }
      colR.appendChild(listR);

      grid.append(colL,colR);
      card.appendChild(grid);
      elMasters.appendChild(card);
    });
  }

  function makeSwitch(init,onChange){
    const btn=document.createElement("button"); btn.className="h-7 w-12 rounded-full transition flex items-center "+(init?"bg-sky-600":"bg-slate-300");
    const dot=document.createElement("div"); dot.className="h-5 w-5 bg-white rounded-full shadow transition "+(init?"translate-x-5":"translate-x-0");
    btn.appendChild(dot); btn.onclick=()=>{ const next=!btn.classList.contains("bg-sky-600"); btn.classList.toggle("bg-sky-600",next); btn.classList.toggle("bg-slate-300",!next); dot.classList.toggle("translate-x-5",next); dot.classList.toggle("translate-x-0",!next); onChange(next); };
    return btn;
  }

  /* ---------- Actions ---------- */
  function addMaster(){
    const mid = up($("#mid").value); if(!mid || mid.length!==12) return alert("MASTER_ID attendu (12 hex sans :)");
    const name = $("#mname").value.trim() || "Master";
    if(state.masters.some(m=>m.id===mid)) return alert("Ce Master existe déjà");
    state.masters.unshift({ id: mid, name, online:false, slaves:[], discovered:[] });
    persist(); renderMasters(); $("#mid").value=""; $("#mname").value="";
    if(state.connected) subscribeMaster(mid);
  }
  function removeMaster(mid){
    if(!confirm("Supprimer ce Master ?")) return;
    state.masters = state.masters.filter(m=>m.id!==mid); persist(); renderMasters();
    if(state.connected) unsubscribeMaster(mid);
  }
  function renameMaster(mid, name){
    const i = state.masters.findIndex(m=>m.id===mid); if(i<0) return;
    state.masters[i] = { ...state.masters[i], name }; persist(); renderMasters();
  }
  function doScan(mid){
    const i = state.masters.findIndex(m=>m.id===mid); if(i<0) return;
    state.masters[i].discovered = []; persist(); renderMasters();
    sendCmd(mid, { cmd: "scan_start" });
  }
  function doPair(mid, mac){
    const name = prompt("Nom de l'appareil (par défaut: Ordinateur)") || "Ordinateur";
    sendCmd(mid, { cmd: "pair", mac });
    const m = state.masters.find(x=>x.id===mid);
    if(m){ m.discovered = m.discovered.filter(d=>d.mac!==mac); persist(); renderMasters(); }
  }
  function doRenameSlave(mid, mac, name){ sendCmd(mid, { cmd:"rename", mac, name }); }
  function doLed(mid, mac, id, on){ sendCmd(mid, { cmd:"led", mac, id, on: on?1:0 }); }
  function doDeleteSlave(mid, mac){
    if(!confirm("Supprimer cet appareil ?")) return;
    sendCmd(mid, { cmd:"delete", mac });
    const m=state.masters.find(x=>x.id===mid); if(m){ m.slaves=m.slaves.filter(s=>s.mac!==mac); persist(); renderMasters(); }
  }

  /* ---------- MQTT.js ---------- */
  function connectMQTT(){
    if(state.connected) return log("MQTT déjà connecté");
    if(!(window.mqtt && window.mqtt.connect)) return alert("mqtt.min.js introuvable");

    const url = MQTT_URL;
    const clientId = "pwa-" + Math.random().toString(16).slice(2);
    log(`MQTT → ${url}`);

    state.client = mqtt.connect(url, {
      clientId, clean:true, reconnectPeriod:2000, connectTimeout:15000,
      username: MQTT_USER, password: MQTT_PASS
    });

    state.client.on("connect", ()=>{ state.connected=true; log("MQTT connecté"); state.masters.forEach(m=>subscribeMaster(m.id)); });
    state.client.on("reconnect", ()=> log("MQTT reconnect…"));
    state.client.on("close", ()=>{ state.connected=false; log("MQTT fermé"); state.masters=state.masters.map(m=>({...m,online:false})); renderMasters(); });
    state.client.on("error", (err)=> log("MQTT erreur:", err?.message||err));
    state.client.on("message", (topic, payloadBuf)=>{
      const payload = payloadBuf?.toString() || "";
      const parts = topic.split("/");
      if(parts.length<3 || parts[0]!=="hizaya") return;
      const mid = parts[1], leaf = parts[2];

      if(leaf==="state"){
        const m = state.masters.find(x=>x.id===mid); if(!m) return;
        m.online = payload==="online"; persist(); renderMasters();
        log(`← state ${mid}: ${payload}`);
      } else if(leaf==="evt"){
        try{
          const j = JSON.parse(payload);
          const m = state.masters.find(x=>x.id===mid); if(!m) return;
          if(Array.isArray(j.peers))    m.slaves     = j.peers.map(p=>({ mac:p.mac, name:p.name||"Device", led0:!!p.led0, led1:!!p.led1 }));
          if(Array.isArray(j.scan))     m.discovered = j.scan.map(s=>({ mac:s.mac, rssi:s.rssi }));
          persist(); renderMasters();
          log(`← evt ${mid}: peers=${j.peers?.length||0} scan=${j.scan?.length||0}`);
        }catch(e){ log("JSON evt invalide", e.message); }
      }
    });
  }
  function disconnectMQTT(){ if(state.client){ try{ state.client.end(true); }catch{} } state.connected=false; state.client=null; log("MQTT déconnecté"); }
  function subscribeMaster(mid){ if(!state.client || !state.connected) return; const t1=`hizaya/${mid}/evt`, t2=`hizaya/${mid}/state`; state.client.subscribe([t1,t2]); log("SUB →", t1, "&", t2); sendCmd(mid,{cmd:"get_peers"}); }
  function unsubscribeMaster(mid){ if(!state.client || !state.connected) return; const t1=`hizaya/${mid}/evt`, t2=`hizaya/${mid}/state`; state.client.unsubscribe([t1,t2]); log("UNSUB →", t1, "&", t2); }
  function sendCmd(mid, obj){ if(!state.client || !state.connected) return alert("MQTT non connecté"); const t=`hizaya/${mid}/cmd`; state.client.publish(t, JSON.stringify(obj), { qos:0, retain:false }); log("→", t, JSON.stringify(obj)); }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", ()=>{
    initAuth();
    $("#btnAddMaster").onclick = addMaster;
    $("#btnConnect").onclick = connectMQTT;
    $("#btnDisconnect").onclick = disconnectMQTT;
  });
})();
