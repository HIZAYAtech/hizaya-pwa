/* ======================= Helpers ======================= */
const $  = (sel)=>document.querySelector(sel);
const $$ = (sel)=>document.querySelectorAll(sel);
const debounce=(fn,ms=400)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
function log(s){ const d=$("#log"); if(!d) return; d.textContent=(new Date()).toLocaleTimeString()+"  "+s+"\n"+d.textContent; }
function setStatus(s){ const el=$("#st"); if(!el) return; el.textContent=s; el.className="pill "+(s==="online"?"ok":(s==="offline"?"bad":"")); }
function macValid(m){ return /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(m); }

/* ======================= Supabase ======================= */
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON, {
  auth: { persistSession: true, detectSessionInUrl: true }
});

/* ---- MQTT utilities declared plus bas ---- */
let client=null, TOP_CMD="", TOP_EVT="", TOP_STATE="";
function uiConnected(on){
  ["host","mid","btnConnect"].forEach(id => { const el=$( "#"+id ); if (el) el.disabled = !!on; });
  const d=$("#btnDisconnect"); if (d) d.disabled = !on;
}
function disconnectMQTT(){
  try { if (client && client.isConnected()) client.disconnect(); } catch(e){}
  setStatus('offline'); uiConnected(false); log("MQTT disconnected");
}

/* ---- Auth state routing ---- */
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    // → Écran Login
    $("#page-main").classList.add("hidden");
    $("#page-login").classList.remove("hidden");
    $("#who").textContent = "Hors ligne";
    disconnectMQTT();
    return;
  }

  // → Écran Dashboard
  $("#page-login").classList.add("hidden");
  $("#page-main").classList.remove("hidden");
  $("#who").textContent = "Connecté : " + (session.user.email || "");
  await loadMasters();

  // restaure sélection Master si présente
  const sel = localStorage.getItem("selectedMid") || "";
  if (sel) { $("#mid").value = sel; }
});

/* ======================= Masters (Supabase) ======================= */
async function loadMasters(){
  const { data, error } = await sb.from('masters').select('*').order('created_at',{ascending:false});
  if(error){ log("Supabase error: "+error.message); return; }
  renderMasters(data||[]);
}

function renderMasters(rows){
  const tb=$("#tblMasters tbody"); tb.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${r.master_id}</td>
      <td><input data-id="${r.id}" class="inpMasterName" value="${(r.name||'').replace(/"/g,'&quot;')}"></td>
      <td><button class="secondary btnUse" data-mid="${r.master_id}">Utiliser</button></td>
      <td>
        <button class="secondary btnSave" data-id="${r.id}">Renommer</button>
        <button class="btnDel" data-id="${r.id}">Supprimer</button>
      </td>`;
    tb.appendChild(tr);
  });

  // Use master
  tb.querySelectorAll(".btnUse").forEach(b=>b.onclick = ()=>{
    const mid=b.dataset.mid;
    $("#mid").value = mid;
    localStorage.setItem("selectedMid", mid);
  });

  // Delete master
  tb.querySelectorAll(".btnDel").forEach(b=>b.onclick = async ()=>{
    if(!confirm("Supprimer ce master ?")) return;
    const { error } = await sb.from('masters').delete().eq('id', b.dataset.id);
    if(error) return alert(error.message);
    loadMasters();
  });

  // Rename master (button or blur autosave)
  const saveName = async (id,val)=>{
    const { error } = await sb.from('masters').update({ name: val }).eq('id', id);
    if(error) alert(error.message);
  };
  tb.querySelectorAll(".btnSave").forEach(b=>b.onclick = ()=>{
    const inp = tb.querySelector(`.inpMasterName[data-id="${b.dataset.id}"]`);
    if(inp) saveName(b.dataset.id, inp.value.trim());
  });
  tb.querySelectorAll(".inpMasterName").forEach(inp=>{
    inp.onblur = ()=> saveName(inp.dataset.id, inp.value.trim());
  });
}

async function addMaster(){
  const master_id = $("#newMid").value.trim();
  const name      = $("#newName").value.trim() || "Master";
  if(!master_id) return alert("Master ID ?");
  const { error } = await sb.from('masters').insert({ master_id, name });
  if(error){ alert(error.message); return; }
  $("#newMid").value=""; $("#newName").value="";
  loadMasters();
}

/* ======================= Login / Logout (Compte) ======================= */
$("#btnLogin").onclick = async ()=>{
  const email = $("#email").value.trim();
  if(!email) return alert("Email ?");
  const { error } = await sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: location.href }
  });
  if(error) alert(error.message); else alert("Regarde tes emails 📬");
};

$("#btnLogout").onclick = async ()=>{
  try { await sb.auth.signOut(); } catch(e){}
  // nettoyage local
  try { localStorage.removeItem("selectedMid"); } catch(e){}
  // coupe MQTT si connecté
  disconnectMQTT();
  // bascule immédiate sans recharger (évite SW cache)
  $("#page-main").classList.add("hidden");
  $("#page-login").classList.remove("hidden");
  $("#who").textContent = "Hors ligne";
};

$("#btnAddMaster").onclick = ()=> $("#newMid").focus();
$("#btnAddConfirm").onclick = addMaster;

/* ======================= MQTT (Master) ======================= */
let TOPS_READY=false;
function currentMID(){
  const v=$("#mid").value.trim();
  if(!/^[0-9A-Fa-f]{12}$/.test(v)) { alert("MASTER_ID attendu: 12 hex sans ':'"); return ""; }
  return v.toUpperCase();
}

function connectMQTT(){
  const host = ($("#host").value.trim() || CONFIG.BROKER_WSS);
  const mid  = currentMID(); if(!mid) return;

  localStorage.setItem("brokerHost", host);
  localStorage.setItem("selectedMid", mid);

  TOP_CMD   = `hizaya/${mid}/cmd`;
  TOP_EVT   = `hizaya/${mid}/evt`;
  TOP_STATE = `hizaya/${mid}/state`;
  TOPS_READY=true;

  // parse host like: domain:port/path
  const [h,p] = host.split('/');
  const parts = h.split(':');
  const hostname = parts[0];
  const port     = +(parts[1]||"443");
  const path     = "/"+(p||"mqtt");

  client = new Paho.MQTT.Client(hostname, port, path, "web-"+Math.random().toString(16).slice(2));
  client.onConnectionLost = (r)=>{
    setStatus('offline'); uiConnected(false);
    log("MQTT lost: "+r.errorMessage);
  };
  client.onMessageArrived = (m)=>{
    if (m.destinationName===TOP_STATE) { setStatus(m.payloadString); return; }
    handleEvt(m.payloadString);
  };

  client.connect({
    useSSL: true, timeout: 6,
    onSuccess: ()=>{
      client.subscribe(TOP_EVT);
      client.subscribe(TOP_STATE);
      setStatus('online');
      uiConnected(true);
      log("Sub "+TOP_EVT+" & "+TOP_STATE);
      sendCmd({cmd:'get_peers'}); sendCmd({cmd:'get_scan'});
    },
    onFailure: e=>{
      setStatus('offline'); uiConnected(false);
      alert("MQTT fail: "+e.errorMessage);
    }
  });
}

$("#btnConnect").onclick    = connectMQTT;
$("#btnDisconnect").onclick = disconnectMQTT;
// restore broker
$("#host").value = localStorage.getItem("brokerHost") || CONFIG.BROKER_WSS;

function sendCmd(obj){
  if(!TOPS_READY) return alert("Pas de MASTER_ID");
  if(!client || !client.isConnected()){ return alert("MQTT non connecté"); }
  const msg = new Paho.MQTT.Message(JSON.stringify(obj));
  msg.destinationName = TOP_CMD;
  client.send(msg);
  log("→ "+JSON.stringify(obj));
}

/* ====== Dashboard actions (MQTT) ====== */
$("#btnScan").onclick = ()=> sendCmd({cmd:'scan_start'});
$("#btnScanRefresh").onclick = ()=> sendCmd({cmd:'get_scan'});

function renderPeers(peers){
  const tb=$("#tblPeers tbody"); tb.innerHTML="";
  if(!Array.isArray(peers) || peers.length===0){
    const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="5" class="muted">Aucun appareil pairé.</td>`; tb.appendChild(tr); return;
  }
  peers.forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${p.mac}</td>
      <td><input class="inpPeerName" data-mac="${p.mac}" value="${(p.name||'').replace(/"/g,'&quot;')}"></td>
      <td><span class="switch ${p.led0? 'on':''}" data-mac="${p.mac}" data-id="0"><span class="dot"></span></span></td>
      <td><span class="switch ${p.led1? 'on':''}" data-mac="${p.mac}" data-id="1"><span class="dot"></span></span></td>
      <td><button class="secondary btnDelPeer" data-mac="${p.mac}">Supprimer</button></td>`;
    tb.appendChild(tr);
  });

  // rename (debounced)
  tb.querySelectorAll(".inpPeerName").forEach(inp=>{
    const mac = inp.dataset.mac;
    const deb = debounce(()=> sendCmd({cmd:'rename', mac, name: inp.value.trim() }), 500);
    inp.oninput = deb;
  });

  // toggles
  tb.querySelectorAll(".switch").forEach(sw=>{
    sw.onclick = ()=>{
      const mac=sw.dataset.mac, id=+sw.dataset.id;
      const next = !sw.classList.contains('on');
      sendCmd({cmd:'led', mac, id, on: next?1:0 });
      sw.classList.toggle('on', next);
    }
  });

  tb.querySelectorAll(".btnDelPeer").forEach(btn=>{
    btn.onclick = ()=>{ const mac=btn.dataset.mac; if(!confirm("Supprimer ce slave ?")) return;
      sendCmd({cmd:'delete', mac});
      // la suppression réelle sera reflétée par l'événement `peers` renvoyé par le Master
    };
  });
}

function renderScan(list){
  const tb=$("#tblScan tbody"); tb.innerHTML="";
  if(!Array.isArray(list) || list.length===0){
    const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="3" class="muted">Rien vu pour l’instant.</td>`; tb.appendChild(tr); return;
  }
  list.forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td class="mono">${p.mac}</td><td>${p.rssi??''}</td><td><button class="secondary btnPair" data-mac="${p.mac}">Pairer</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll(".btnPair").forEach(btn=>{
    btn.onclick = ()=>{
      const mac = btn.dataset.mac;
      sendCmd({cmd:'pair', mac});
      const name = prompt("Nom de l'appareil:", "Ordinateur 1");
      if(name) sendCmd({cmd:'rename', mac, name});
    }
  });
}

function handleEvt(payload){
  log("← "+payload);
  try{
    const j=JSON.parse(payload);
    if(j.peers){ renderPeers(j.peers); }
    if(j.scan){ renderScan(j.scan); }
  }catch(e){}
}

/* ======================= Boot ======================= */
(async ()=> {
  // force lecture session au démarrage
  const { data: { session } } = await sb.auth.getSession();
  // si session existe, onAuthStateChange a déjà basculé l’UI
})();
