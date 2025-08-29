/* HIZAYA PWA – Auth Supabase + MQTT.js (WSS) – no-build */

(function(){
  const $ = (sel) => document.querySelector(sel);
  const elMasters = $("#masters");
  const elLog = $("#log");

  const LS_KEYS = { masters:"hz_masters", broker:"hz_broker" };
  const defaultBroker = { url: "wss://broker.hivemq.com:8884/mqtt" };
  // Pour HiveMQ Cloud privé (après création du cluster) :
  // const defaultBroker = { url: "wss://VOTRECLUSTER.s#.hivemq.cloud:8884/mqtt" };

  const state = {
    user: null,                    // Supabase user
    masters: load(LS_KEYS.masters) || [],
    broker: load(LS_KEYS.broker) || defaultBroker,
    client: null,
    connected: false,
    subs: {},
  };

  function log(...a){ if(elLog){ elLog.textContent += a.join(" ") + "\n"; elLog.scrollTop = elLog.scrollHeight; } console.log(...a); }
  function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function load(k){ try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch{ return null; } }
  function id(str){ return (str||"").trim().toUpperCase(); }

  /* ---------- Routing ---------- */
  function showMain(){
    $("#page-login").classList.add("hidden");
    $("#page-main").classList.remove("hidden");
    $("#who").textContent = `Connecté: ${state.user.email}`;
    $("#btnLogout").classList.remove("hidden");
    renderMasters();
  }
  function showLogin(){
    $("#page-main").classList.add("hidden");
    $("#page-login").classList.remove("hidden");
    $("#who").textContent = "Hors ligne";
    $("#btnLogout").classList.add("hidden");
  }

  /* ---------- Auth Supabase ---------- */
  async function initAuth(){
    // initial session
    if(window.hzAuth){
      const session = await window.hzAuth.getSession();
      if(session?.user){ state.user = session.user; showMain(); } else { showLogin(); }
    }else{
      console.warn("Supabase non initialisé ?");
      showLogin();
    }

    // On écoute les changements (login/logout)
    window.addEventListener("supabase-auth", (e)=>{
      const session = e.detail?.session;
      if(session?.user){
        state.user = session.user;
        showMain();
      }else{
        state.user = null;
        disconnectMQTT();
        showLogin();
      }
    });

    // Boutons
    $("#btnGoogle").onclick = ()=> window.hzAuth.loginWithGoogle();
    $("#btnLogout").onclick = ()=> window.hzAuth.logout();
  }

  /* ---------- Masters ---------- */
  function persistMasters(){ save(LS_KEYS.masters, state.masters); }
  function renderMasters(){
    elMasters.innerHTML = "";
    if(state.masters.length===0){
      const d=document.createElement("div");
      d.className="text-slate-600";
      d.textContent="Aucun master. Ajoute un MASTER_ID ci-dessus.";
      elMasters.appendChild(d);
      return;
    }
    state.masters.forEach((m)=>{
      const card = document.createElement("div");
      card.className = "bg-white border border-slate-200 rounded-2xl shadow-sm p-4";

      const head = document.createElement("div");
      head.className = "flex items-center justify-between gap-3 mb-3";

      const left = document.createElement("div");
      left.className="flex items-center gap-3";
      const logo = document.createElement("div");
      logo.className="h-10 w-10 rounded-2xl bg-slate-900 text-white grid place-items-center"; logo.textContent="🖥️";
      const title = document.createElement("div");
      const h3 = document.createElement("div"); h3.className="text-lg font-semibold"; h3.textContent = m.name;
      const sub = document.createElement("div"); sub.className="text-xs text-slate-500"; sub.textContent = `ID: ${m.id}`;
      left.append(logo, title); title.append(h3, sub);

      const right = document.createElement("div");
      right.className="flex items-center gap-2";
      const chip = document.createElement("span"); chip.className = "text-xs px-2 py-1 rounded-full border"; chip.textContent = m.online ? "online" : "offline";
      const btnScan = document.createElement("button"); btnScan.className="px-3 py-1.5 rounded-xl bg-white border hover:bg-slate-50"; btnScan.textContent="Scan"; btnScan.onclick=()=>doScan(m.id);
      const btnDel = document.createElement("button"); btnDel.className="px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700"; btnDel.textContent="Supprimer"; btnDel.onclick=()=>removeMaster(m.id);
      right.append(chip, btnScan, btnDel);
      head.append(left, right);
      card.appendChild(head);

      // rename inline (autosave)
      const row = document.createElement("div"); row.className="flex items-center gap-3 text-sm mb-2";
      const lbl = document.createElement("span"); lbl.className="hidden sm:inline text-slate-600"; lbl.textContent="Nom du master :";
      const inp = document.createElement("input"); inp.className="px-3 py-2 rounded-xl border border-slate-300"; inp.value = m.name;
      let timer=null; inp.oninput = ()=>{ clearTimeout(timer); timer=setTimeout(()=> renameMaster(m.id, inp.value.trim()||"Master"), 500); };
      row.append(lbl, inp); card.appendChild(row);

      const dv = document.createElement("div"); dv.className="h-px bg-slate-200 my-3"; card.appendChild(dv);

      // grid
      const grid = document.createElement("div"); grid.className="grid md:grid-cols-2 gap-6";

      // Slaves
      const colL = document.createElement("div");
      const h4L = document.createElement("div"); h4L.className="font-medium mb-2"; h4L.textContent="Mes appareils"; colL.appendChild(h4L);
      const listL = document.createElement("div"); listL.className="divide-y rounded-xl border overflow-hidden";
      if(!m.slaves || m.slaves.length===0){
        const empty = document.createElement("div"); empty.className="text-sm text-slate-500 p-4"; empty.textContent="Aucun appareil pairé.";
        listL.appendChild(empty);
      }else{
        m.slaves.forEach(s=>{
          const row = document.createElement("div"); row.className="p-3 bg-white";
          const top = document.createElement("div"); top.className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3";

          const left = document.createElement("div"); left.className="min-w-0";
          const name = document.createElement("input"); name.className="w-full px-3 py-2 rounded-xl border border-slate-300"; name.value = s.name;
          name.onchange = ()=> doRenameSlave(m.id, s.mac, name.value.trim()||"Device");
          const mac = document.createElement("div"); mac.className="text-xs text-slate-500 font-mono mt-1"; mac.textContent = s.mac; left.append(name, mac);

          const right = document.createElement("div"); right.className="flex items-center gap-4";
          const g0 = document.createElement("div"); g0.className="flex items-center gap-2 text-xs";
          const lab0 = document.createElement("span"); lab0.textContent="LED V";
          const sw0 = makeSwitch(!!s.led0, (v)=>doLed(m.id, s.mac, 0, v)); g0.append(lab0, sw0);
          const g1 = document.createElement("div"); g1.className="flex items-center gap-2 text-xs";
          const lab1 = document.createElement("span"); lab1.textContent="LED B";
          const sw1 = makeSwitch(!!s.led1, (v)=>doLed(m.id, s.mac, 1, v)); g1.append(lab1, sw1);
          const bdel = document.createElement("button"); bdel.className="px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700"; bdel.textContent="Supprimer"; bdel.onclick=()=>doDeleteSlave(m.id, s.mac);
          right.append(g0, g1, bdel);

          top.append(left, right);
          row.appendChild(top);
          listL.appendChild(row);
        });
      }
      colL.appendChild(listL);

      // Découverte
      const colR = document.createElement("div");
      const headR = document.createElement("div"); headR.className="flex items-center justify-between mb-2";
      const h4R = document.createElement("div"); h4R.className="font-medium"; h4R.textContent="Découverte";
      const bRefresh = document.createElement("button"); bRefresh.className="px-3 py-1.5 rounded-xl bg-white border hover:bg-slate-50"; bRefresh.textContent="Rafraîchir"; bRefresh.onclick=()=>doScan(m.id);
      headR.append(h4R, bRefresh); colR.appendChild(headR);

      const listR = document.createElement("div"); listR.className="divide-y rounded-xl border overflow-hidden";
      if(!m.discovered || m.discovered.length===0){
        const empty = document.createElement("div"); empty.className="text-sm text-slate-500 p-4"; empty.textContent="Aucun appareil en vue. Lance un scan puis mets le Slave en mode pairing.";
        listR.appendChild(empty);
      }else{
        m.discovered.forEach(d=>{
          const row = document.createElement("div"); row.className="p-3 bg-white flex items-center justify-between gap-3";
          const left = document.createElement("div"); const mac = document.createElement("div"); mac.className="font-mono text-sm"; mac.textContent=d.mac;
          const rssi = document.createElement("div"); rssi.className="text-xs text-slate-500"; rssi.textContent=`RSSI ${d.rssi}`; left.append(mac, rssi);
          const bpair = document.createElement("button"); bpair.className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:opacity-90"; bpair.textContent="Pairer"; bpair.onclick=()=>doPair(m.id, d.mac);
          row.append(left, bpair); listR.appendChild(row);
        });
      }
      colR.appendChild(listR);

      grid.append(colL, colR);
      card.appendChild(grid);
      elMasters.appendChild(card);
    });
  }

  function addMaster(){
    const mid = id($("#mid").value);
    if(!mid || mid.length!==12) return alert("MASTER_ID attendu (12 hex sans :)");
    const name = $("#mname").value.trim() || "Master";
    if(state.masters.some(m=>m.id===mid)) return alert("Ce Master existe déjà");
    state.masters.unshift({ id: mid, name, online:false, slaves:[], discovered:[] });
    persistMasters(); renderMasters(); $("#mid").value=""; $("#mname").value="";
    if(state.connected) subscribeMaster(mid);
  }
  function removeMaster(mid){
    if(!confirm("Supprimer ce Master ?")) return;
    state.masters = state.masters.filter(m=>m.id!==mid);
    persistMasters(); renderMasters();
    if(state.connected) unsubscribeMaster(mid);
  }
  function renameMaster(mid, name){
    const i = state.masters.findIndex(m=>m.id===mid); if(i<0) return;
    state.masters[i] = { ...state.masters[i], name }; persistMasters(); renderMasters();
  }

  /* ---------- MQTT.js ---------- */
  function ensureMQTTjs(){ return !!(window.mqtt && typeof window.mqtt.connect==="function"); }

  function connectMQTT(){
    if(state.connected){ log("MQTT déjà connecté"); return; }
    if(!ensureMQTTjs()) return alert("mqtt.min.js introuvable");

    const url = (state.broker && state.broker.url) ? state.broker.url : defaultBroker.url;
    const clientId = "pwa-" + Math.random().toString(16).slice(2);
    log(`MQTT → ${url}`);

    try{
      state.client = mqtt.connect(url, {
        clientId, clean:true, reconnectPeriod:2000, connectTimeout:15000
      });
    }catch(err){
      alert("Erreur création client MQTT"); console.error(err); return;
    }

    state.client.on("connect", ()=>{
      state.connected = true; log("MQTT connecté");
      state.masters.forEach(m=> subscribeMaster(m.id));
    });
    state.client.on("reconnect", ()=> log("MQTT reconnect…"));
    state.client.on("close", ()=>{ state.connected=false; log("MQTT fermé"); state.masters = state.masters.map(m=>({...m,online:false})); renderMasters(); });
    state.client.on("error", (err)=> log("MQTT erreur:", err?.message||err));

    state.client.on("message", (topic, payloadBuf)=>{
      const payload = payloadBuf?.toString() || "";
      const parts = (topic||"").split("/");
      if(parts.length<3 || parts[0]!=="hizaya"){ log("←", topic, payload); return; }
      const mid = parts[1], leaf = parts[2];

      if(leaf==="state"){
        const online = payload==="online";
        const m = state.masters.find(x=>x.id===mid);
        if(m){ m.online = online; persistMasters(); renderMasters(); }
        log(`← state ${mid}: ${payload}`);
      } else if(leaf==="evt"){
        try{
          const j = JSON.parse(payload);
          const m = state.masters.find(x=>x.id===mid);
          if(!m) return;
          if(Array.isArray(j.peers)){
            m.slaves = j.peers.map(p=>({ mac:p.mac, name:p.name||"Device", led0:!!p.led0, led1:!!p.led1 }));
          }
          if(Array.isArray(j.scan)){
            m.discovered = j.scan.map(s=>({ mac:s.mac, rssi:s.rssi }));
          }
          persistMasters(); renderMasters();
          log(`← evt ${mid}: peers=${j.peers?.length||0} scan=${j.scan?.length||0}`);
        }catch(e){ log("JSON evt invalide", e.message); }
      } else {
        log("←", topic, payload);
      }
    });
  }

  function disconnectMQTT(){
    if(state.client){ try{ state.client.end(true); }catch{} }
    state.connected=false; state.client=null; log("MQTT déconnecté");
  }

  function subscribeMaster(mid){
    if(!state.client || !state.connected) return;
    const evt = `hizaya/${mid}/evt`;
    const st  = `hizaya/${mid}/state`;
    state.client.subscribe([evt, st]);
    state.subs[mid] = { evt:true, state:true };
    log("SUB →", evt, " & ", st);
    sendCmd(mid, {cmd:"get_peers"}); // demande initiale
  }
  function unsubscribeMaster(mid){
    if(!state.client || !state.connected) return;
    const evt = `hizaya/${mid}/evt`; const st = `hizaya/${mid}/state`;
    state.client.unsubscribe([evt, st]); delete state.subs[mid];
    log("UNSUB →", evt, " & ", st);
  }
  function sendCmd(mid, obj){
    if(!state.client || !state.connected){ alert("MQTT non connecté"); return; }
    const topic = `hizaya/${mid}/cmd`;
    state.client.publish(topic, JSON.stringify(obj), { qos:0, retain:false });
    log("→", topic, JSON.stringify(obj));
  }

  /* ---------- Actions Master ---------- */
  function doScan(mid){
    const i = state.masters.findIndex(m=>m.id===mid); if(i<0) return;
    state.masters[i].discovered = []; persistMasters(); renderMasters();
    sendCmd(mid, { cmd: "scan_start" });
  }
  function doPair(mid, mac){
    const name = prompt("Nom de l'appareil (par défaut: Ordinateur)") || "Ordinateur";
    sendCmd(mid, { cmd: "pair", mac });
    // On attend l’evt peers pour l’affichage
    const mm = state.masters.find(m=>m.id===mid);
    if(mm){ mm.discovered = mm.discovered.filter(d=>d.mac!==mac); persistMasters(); renderMasters(); }
  }
  function doRenameSlave(mid, mac, name){
    sendCmd(mid, { cmd: "rename", mac, name });
    const m = state.masters.find(x=>x.id===mid);
    if(m){ m.slaves = m.slaves.map(s=> s.mac===mac ? {...s, name} : s ); persistMasters(); renderMasters(); }
  }
  function doLed(mid, mac, id, on){
    sendCmd(mid, { cmd: "led", mac, id, on: on?1:0 });
    const m = state.masters.find(x=>x.id===mid);
    if(m){ m.slaves = m.slaves.map(s=> s.mac===mac ? {...s, [id===0?"led0":"led1"]:!!on } : s ); persistMasters(); renderMasters(); }
  }
  function doDeleteSlave(mid, mac){
    if(!confirm("Supprimer cet appareil ?")) return;
    sendCmd(mid, { cmd: "delete", mac });
    const m = state.masters.find(x=>x.id===mid);
    if(m){ m.slaves = m.slaves.filter(s=>s.mac!==mac); persistMasters(); renderMasters(); }
  }

  function makeSwitch(init, onChange){
    const btn = document.createElement("button");
    btn.className = "h-7 w-12 rounded-full transition flex items-center "+(init?"bg-brand-600":"bg-slate-300");
    const dot = document.createElement("div");
    dot.className = "h-5 w-5 bg-white rounded-full shadow transition "+(init?"translate-x-5":"translate-x-0");
    btn.appendChild(dot);
    btn.onclick = ()=>{
      const checked = btn.classList.contains("bg-brand-600");
      const next = !checked;
      btn.classList.toggle("bg-brand-600", next);
      btn.classList.toggle("bg-slate-300", !next);
      dot.classList.toggle("translate-x-5", next);
      dot.classList.toggle("translate-x-0", !next);
      onChange(next);
    };
    return btn;
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", ()=>{
    initAuth();                   // ← Supabase
    renderMasters();              // ← UI
    $("#btnAddMaster").onclick = addMaster;
    $("#btnConnect").onclick = connectMQTT;
    $("#btnDisconnect").onclick = disconnectMQTT;
  });
})();
