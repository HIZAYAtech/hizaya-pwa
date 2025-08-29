/* HIZAYA PWA – sans build (Tailwind + Paho via CDN)
   - Login mock
   - MQTT (WSS) Paho
   - Masters/Slaves : add/rename/delete, scan, pair, led, rename slave
   - Persistance localStorage
*/

(function(){
  /* ---------- helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  const elMasters = $("#masters");
  const elLog = $("#log");

  const LS_KEYS = {
    user: "hz_user",
    masters: "hz_masters",
    broker: "hz_broker", // {host, port, path}
  };

  const defaultBroker = { host: "broker.hivemq.com", port: 8884, path: "/mqtt" };

  const state = {
    user: null,
    masters: [],
    broker: load(LS_KEYS.broker) || defaultBroker,
    client: null,
    connected: false,
    // subscriptions par masterId: { evt: boolean, state: boolean }
    subs: {},
  };

  function log(...a){ if(elLog){ elLog.textContent += a.join(" ") + "\n"; elLog.scrollTop = elLog.scrollHeight; } console.log(...a); }
  function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
  function load(key){ try{ return JSON.parse(localStorage.getItem(key) || "null"); }catch{ return null; } }

  function id(str){ return (str||"").trim().toUpperCase(); }
  function short(s){ return (s||"").slice(0,6) + (s && s.length>6 ? "…" : ""); }

  /* ---------- UI routing ---------- */
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

  /* ---------- Login mock ---------- */
  function initAuth(){
    const savedUser = load(LS_KEYS.user);
    if(savedUser){ state.user = savedUser; showMain(); }
    $("#btnLogin").onclick = ()=>{
      const email = $("#email").value.trim();
      if(!email){ alert("Entre un email"); return; }
      state.user = { email };
      save(LS_KEYS.user, state.user);
      showMain();
    };
    $("#btnLogout").onclick = ()=>{
      state.user = null;
      save(LS_KEYS.user, null);
      // Sécurité: on coupe aussi MQTT (comme décidé)
      disconnectMQTT();
      showLogin();
    };
  }

  /* ---------- Masters data ---------- */
  function initMasters(){
    state.masters = load(LS_KEYS.masters) || [];
    renderMasters();
  }

  function persistMasters(){
    save(LS_KEYS.masters, state.masters);
  }

  function addMaster(){
    const mid = id($("#mid").value);
    if(!mid || mid.length!==12){ alert("Master ID attendu (12 hex sans :)"); return; }
    const name = $("#mname").value.trim() || "Master";
    if(state.masters.some(m=>m.id===mid)){ alert("Ce Master existe déjà"); return; }
    state.masters.unshift({ id: mid, name, online: false, slaves: [], discovered: [] });
    persistMasters();
    renderMasters();
    $("#mid").value=""; $("#mname").value="";
    // si MQTT connecté, s'abonner direct
    if(state.connected) subscribeMaster(mid);
  }

  function removeMaster(mid){
    if(!confirm("Supprimer ce Master de la liste ?")) return;
    state.masters = state.masters.filter(m=>m.id!==mid);
    persistMasters();
    renderMasters();
    if(state.connected) unsubscribeMaster(mid);
  }

  function updateMaster(mid, patch){
    const i = state.masters.findIndex(m=>m.id===mid);
    if(i<0) return;
    state.masters[i] = { ...state.masters[i], ...patch };
    persistMasters();
    renderMasters();
  }

  function renameMaster(mid, name){
    updateMaster(mid, { name });
  }

  /* ---------- MQTT ---------- */
  function connectMQTT(){
    if(state.connected){ log("MQTT déjà connecté"); return; }
    const { host, port, path } = state.broker || defaultBroker;
    log(`MQTT → wss://${host}:${port}${path}`);

    try{
      state.client = new Paho.MQTT.Client(host, Number(port), path, "pwa-"+Math.random().toString(16).slice(2));
    }catch(err){
      alert("Erreur création client MQTT (Paho non chargé ?)");
      console.error(err);
      return;
    }

    state.client.onConnectionLost = (resp)=>{
      state.connected = false;
      log("MQTT perdu:", resp?.errorMessage ?? resp?.errorCode);
      // statut offline pour tous
      state.masters = state.masters.map(m=>({ ...m, online:false }));
      renderMasters();
    };
    state.client.onMessageArrived = (msg)=>{
      // Gestion des messages EVT/STATE
      const t = msg.destinationName || "";
      const payload = msg.payloadString || "";
      // evt: hizaya/<MID>/evt ; state: hizaya/<MID>/state
      const parts = t.split("/");
      if(parts.length<3 || parts[0]!="hizaya"){ log("←", t, payload); return; }
      const mid = parts[1];
      const leaf = parts[2];

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

          if(Array.isArray(j.peers)){ // liste de pairs
            m.slaves = j.peers.map(p=>({
              mac: p.mac,
              name: p.name || "Device",
              led0: !!p.led0,
              led1: !!p.led1
            }));
            persistMasters(); renderMasters();
            log(`← peers ${mid}: ${m.slaves.length}`);
          }
          if(Array.isArray(j.scan)){ // résultats scan
            m.discovered = j.scan.map(s=>({ mac:s.mac, rssi:s.rssi }));
            persistMasters(); renderMasters();
            log(`← scan ${mid}: ${m.discovered.length}`);
          }
        }catch(e){
          log("JSON evt invalide", e.message);
        }
      } else {
        log("←", t, payload);
      }
    };

    state.client.connect({
      useSSL: true,
      timeout: 15,
      cleanSession: true,
      onSuccess: ()=>{
        state.connected = true;
        log("MQTT connecté");
        // s'abonner aux masters connus
        state.masters.forEach(m=> subscribeMaster(m.id));
      },
      onFailure: (err)=>{
        state.connected = false;
        log("MQTT échec:", err?.errorMessage ?? JSON.stringify(err));
        alert("Connexion MQTT échouée (voir console)");
      }
    });
  }

  function disconnectMQTT(){
    if(state.client){
      try{ state.client.disconnect(); }catch{}
    }
    state.connected=false;
    state.client=null;
    log("MQTT déconnecté");
  }

  function subscribeMaster(mid){
    if(!state.client || !state.connected) return;
    const evt = `hizaya/${mid}/evt`;
    const st  = `hizaya/${mid}/state`;
    try{
      state.client.subscribe(evt);
      state.client.subscribe(st);
      state.subs[mid] = { evt:true, state:true };
      log("SUB →", evt, " & ", st);
      // demande d'état et de pairs
      sendCmd(mid, {cmd:"get_peers"});
    }catch(e){
      log("SUB erreur:", e.message);
    }
  }

  function unsubscribeMaster(mid){
    if(!state.client || !state.connected) return;
    const evt = `hizaya/${mid}/evt`;
    const st  = `hizaya/${mid}/state`;
    try{
      state.client.unsubscribe(evt);
      state.client.unsubscribe(st);
      delete state.subs[mid];
      log("UNSUB →", evt, " & ", st);
    }catch(e){
      log("UNSUB erreur:", e.message);
    }
  }

  function sendCmd(mid, obj){
    if(!state.client || !state.connected){ alert("MQTT non connecté"); return; }
    const topic = `hizaya/${mid}/cmd`;
    const m = new Paho.MQTT.Message(JSON.stringify(obj));
    m.destinationName = topic;
    state.client.send(m);
    log("→", topic, JSON.stringify(obj));
  }

  /* ---------- Actions Master ---------- */
  function doScan(mid){
    updateMaster(mid, { discovered: [] });
    sendCmd(mid, { cmd: "scan_start" });
  }

  function doPair(mid, mac){
    const name = prompt("Nom de l'appareil (par défaut: Ordinateur)") || "Ordinateur";
    sendCmd(mid, { cmd: "pair", mac });
    // côté master réel, il publiera peers; on attend l'evt pour MAJ
    // on peut pré-remplir provisoirement la discovered list
    const mm = state.masters.find(m=>m.id===mid);
    if(mm){
      mm.discovered = mm.discovered.filter(d=>d.mac!==mac);
      persistMasters(); renderMasters();
    }
  }

  function doRenameMaster(mid, name){
    renameMaster(mid, name);
    // côté cloud on n'a pas de cmd rename master (c’est local UI)
  }

  function doRenameSlave(mid, mac, name){
    sendCmd(mid, { cmd: "rename", mac, name });
    const m = state.masters.find(x=>x.id===mid);
    if(m){
      m.slaves = m.slaves.map(s=> s.mac===mac ? {...s, name} : s );
      persistMasters(); renderMasters();
    }
  }

  function doLed(mid, mac, id, on){
    sendCmd(mid, { cmd: "led", mac, id, on: on?1:0 });
    const m = state.masters.find(x=>x.id===mid);
    if(m){
      m.slaves = m.slaves.map(s=> s.mac===mac ? {...s, [id===0?"led0":"led1"]:!!on } : s );
      persistMasters(); renderMasters();
    }
  }

  function doDeleteSlave(mid, mac){
    if(!confirm("Supprimer cet appareil ?")) return;
    sendCmd(mid, { cmd: "delete", mac });
    const m = state.masters.find(x=>x.id===mid);
    if(m){
      m.slaves = m.slaves.filter(s=>s.mac!==mac);
      persistMasters(); renderMasters();
    }
  }

  /* ---------- RENDER ---------- */
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
      card.className = "card p-4";

      // header
      const head = document.createElement("div");
      head.className = "flex items-center justify-between gap-3 mb-3";

      const left = document.createElement("div");
      left.className="flex items-center gap-3";
      const logo = document.createElement("div");
      logo.className="h-10 w-10 rounded-2xl bg-slate-900 text-white grid place-items-center";
      logo.textContent="🖥️";
      const title = document.createElement("div");
      const h3 = document.createElement("div");
      h3.className="text-lg font-semibold";
      h3.textContent = m.name;
      const sub = document.createElement("div");
      sub.className="text-xs text-slate-500";
      sub.textContent = `ID: ${m.id}`;
      title.appendChild(h3); title.appendChild(sub);
      left.appendChild(logo); left.appendChild(title);

      const right = document.createElement("div");
      right.className="flex items-center gap-2";
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = m.online ? "online" : "offline";
      const btnScan = document.createElement("button");
      btnScan.className="px-3 py-1.5 rounded-xl bg-white border hover:bg-slate-50";
      btnScan.textContent="Scan";
      btnScan.onclick=()=>doScan(m.id);
      const btnDel = document.createElement("button");
      btnDel.className="px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700";
      btnDel.textContent="Supprimer";
      btnDel.onclick=()=>removeMaster(m.id);
      right.appendChild(chip); right.appendChild(btnScan); right.appendChild(btnDel);

      head.appendChild(left); head.appendChild(right);
      card.appendChild(head);

      // rename master (inline)
      const renameRow = document.createElement("div");
      renameRow.className = "flex items-center gap-3 text-sm mb-2";
      const lbl = document.createElement("span");
      lbl.className="hidden sm:inline text-slate-600";
      lbl.textContent="Nom du master :";
      const inp = document.createElement("input");
      inp.className="px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200";
      inp.value = m.name;
      let timer=null;
      inp.oninput = ()=>{
        clearTimeout(timer);
        timer = setTimeout(()=> doRenameMaster(m.id, inp.value.trim()||"Master"), 500);
      };
      const saved = document.createElement("span");
      saved.className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full hidden";
      saved.textContent="Sauvegardé ✓";
      inp.addEventListener("change", ()=>{
        saved.classList.remove("hidden");
        setTimeout(()=>saved.classList.add("hidden"), 800);
      });
      renameRow.append(lbl, inp, saved);
      card.appendChild(renameRow);

      // divider
      const dv = document.createElement("div");
      dv.className="h-px bg-slate-200 my-3";
      card.appendChild(dv);

      // Slaves + Découverte (2 colonnes)
      const grid = document.createElement("div");
      grid.className="grid md:grid-cols-2 gap-6";

      // Slaves
      const colL = document.createElement("div");
      const h4L = document.createElement("div");
      h4L.className="font-medium mb-2";
      h4L.textContent="Mes appareils";
      colL.appendChild(h4L);
      const listL = document.createElement("div");
      listL.className="divide-y rounded-xl border overflow-hidden";
      if(m.slaves.length===0){
        const empty = document.createElement("div");
        empty.className="text-sm text-slate-500 p-4";
        empty.textContent="Aucun appareil pairé.";
        listL.appendChild(empty);
      }else{
        m.slaves.forEach(s=>{
          const row = document.createElement("div");
          row.className="p-3 bg-white";
          const top = document.createElement("div");
          top.className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3";

          const left = document.createElement("div");
          left.className="min-w-0";
          const name = document.createElement("input");
          name.className="w-full px-3 py-2 rounded-xl border border-slate-300";
          name.value = s.name;
          name.onchange = ()=> doRenameSlave(m.id, s.mac, name.value.trim()||"Device");
          const mac = document.createElement("div");
          mac.className="text-xs text-slate-500 font-mono mt-1";
          mac.textContent = s.mac;
          left.append(name, mac);

          const right = document.createElement("div");
          right.className="flex items-center gap-4";
          // LED 0
          const g0 = document.createElement("div");
          g0.className="flex items-center gap-2 text-xs";
          const lab0 = document.createElement("span"); lab0.textContent="LED V";
          const sw0 = makeSwitch(s.led0, (v)=>doLed(m.id, s.mac, 0, v));
          g0.append(lab0, sw0);
          // LED 1
          const g1 = document.createElement("div");
          g1.className="flex items-center gap-2 text-xs";
          const lab1 = document.createElement("span"); lab1.textContent="LED B";
          const sw1 = makeSwitch(s.led1, (v)=>doLed(m.id, s.mac, 1, v));
          g1.append(lab1, sw1);
          // delete
          const bdel = document.createElement("button");
          bdel.className="px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700";
          bdel.textContent="Supprimer";
          bdel.onclick=()=>doDeleteSlave(m.id, s.mac);

          right.append(g0, g1, bdel);

          top.append(left, right);
          row.appendChild(top);
          listL.appendChild(row);
        });
      }
      colL.appendChild(listL);

      // Découverte
      const colR = document.createElement("div");
      const headR = document.createElement("div");
      headR.className="flex items-center justify-between mb-2";
      const h4R = document.createElement("div"); h4R.className="font-medium"; h4R.textContent="Découverte";
      const bRefresh = document.createElement("button");
      bRefresh.className="px-3 py-1.5 rounded-xl bg-white border hover:bg-slate-50";
      bRefresh.textContent="Rafraîchir";
      bRefresh.onclick=()=>doScan(m.id);
      headR.append(h4R, bRefresh);
      colR.appendChild(headR);

      const listR = document.createElement("div");
      listR.className="divide-y rounded-xl border overflow-hidden";
      if(m.discovered.length===0){
        const empty = document.createElement("div");
        empty.className="text-sm text-slate-500 p-4";
        empty.textContent="Aucun appareil en vue. Lance un scan puis mets le Slave en mode pairing.";
        listR.appendChild(empty);
      }else{
        m.discovered.forEach(d=>{
          const row = document.createElement("div");
          row.className="p-3 bg-white flex items-center justify-between gap-3";
          const left = document.createElement("div");
          const mac = document.createElement("div"); mac.className="font-mono text-sm"; mac.textContent=d.mac;
          const rssi = document.createElement("div"); rssi.className="text-xs text-slate-500"; rssi.textContent=`RSSI ${d.rssi}`;
          left.append(mac, rssi);
          const bpair = document.createElement("button");
          bpair.className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:opacity-90";
          bpair.textContent="Pairer";
          bpair.onclick=()=>doPair(m.id, d.mac);
          row.append(left, bpair);
          listR.appendChild(row);
        });
      }
      colR.appendChild(listR);

      grid.append(colL, colR);
      card.appendChild(grid);

      elMasters.appendChild(card);
    });
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

  /* ---------- Events globaux ---------- */
  document.addEventListener("DOMContentLoaded", ()=>{
    initAuth();
    initMasters();

    $("#btnAddMaster").onclick = addMaster;
    $("#btnConnect").onclick = connectMQTT;
    $("#btnDisconnect").onclick = disconnectMQTT;
  });
})();
