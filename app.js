/* HIZAYA – PWA (Masters + Slaves)
 * - Auth via supabase-auth.js (window.sb & window.hzAuth)
 * - Masters: liste, renommage (autosave), suppression
 * - Slaves: scan/pair, rename, delete
 * - Commandes: Power / Reset / HardReset / HardOff
 * - États: online master, link ESP-NOW slave, PC on/off (pastille)
 * - MQTT auto-reconnect après reload (localStorage)
 */

const CFG = window.__CFG__ || {}; // { SUPABASE_URL, FN_CREATE_CLAIM, FN_MQTT_CREDS }
const $  = (s) => document.querySelector(s);
const MQTT_REMEMBER_KEY = "mqtt_autoconnect";

const S = {
  session: null,
  masters: [],            // [{ master_id, name, online, slaves:[], discovered:[] }]
  mqtt: null,
  mqttReady: false,
  subs: new Set()
};

function log(...a){
  const el = $("#log"); if(!el) return;
  el.textContent += a.join(" ") + "\n";
  el.scrollTop = el.scrollHeight;
}

/* ----------------------------- AUTH ----------------------------- */
function setAuthedUI(on, email=""){
  $("#userInfo")?.classList && ($("#userInfo").textContent = on ? (email||"Connecté") : "Hors ligne");
  $("#page-login")?.classList.toggle("hidden", !!on);
  $("#page-main")?.classList.toggle("hidden", !on);
  $("#btnLogout")?.classList.toggle("hidden", !on);
  $("#btnLoginGoogle")?.classList.toggle("hidden", !!on);
}

async function initAuthUI(){
  window.addEventListener("supabase-auth", (e)=> updateSession(e.detail.session));

  $("#btnLoginGoogle") && ($("#btnLoginGoogle").onclick = ()=> window.hzAuth.loginWithGoogle());
  $("#btnLoginEmail")  && ($("#btnLoginEmail").onclick  = async ()=>{
    const email = ($("#email")?.value||"").trim();
    if(!email) return alert("Entre un email.");
    await window.hzAuth.loginWithEmail(email);
    alert("Lien envoyé (vérifie ta boîte mail).");
  });
  $("#btnLogout")      && ($("#btnLogout").onclick = async ()=>{ await window.hzAuth.logout(); });

  $("#btnConnect")        && ($("#btnConnect").onclick = connectMQTT);
  $("#btnDisconnect")     && ($("#btnDisconnect").onclick = disconnectMQTT);
  $("#btnPairMaster")     && ($("#btnPairMaster").onclick = createPairingCode);
  $("#btnRefreshMasters") && ($("#btnRefreshMasters").onclick = loadMasters);

  const { data:{ session } } = await window.sb.auth.getSession();
  updateSession(session);
}

async function updateSession(session){
  S.session = session || null;
  if(!S.session){ setAuthedUI(false); return; }
  setAuthedUI(true, S.session.user.email || "");
  await loadMasters();

  // Auto-reconnect MQTT après reload si l’utilisateur l’avait activé
  try {
    if (localStorage.getItem(MQTT_REMEMBER_KEY) === "1") {
      await connectMQTT();
    }
  } catch (e) {
    console.warn("[MQTT] auto-connect failed:", e);
  }
}

/* --------------------------- DATA: MASTERS --------------------------- */
async function loadMasters(){
  const { data, error } = await window.sb
    .from("masters")
    .select("master_id,name,created_at")
    .order("created_at", { ascending:false });

  if(error){ log("[DB] masters error:", error.message); return; }

  // Conserve éventuellement l’existant (slaves/decouverte en RAM)
  const prev = new Map(S.masters.map(m=>[m.master_id, m]));
  S.masters = (data||[]).map(row=>{
    const old = prev.get(row.master_id);
    return {
      master_id: row.master_id,
      name: row.name || "Master",
      online: old?.online || false,
      slaves: old?.slaves || [],
      discovered: old?.discovered || []
    };
  });

  renderMasters();

  if(S.mqttReady){
    subscribeAll();
    // Demande explicite de l’état + des pairs au (re)chargement
    requestAllStates();
    requestAllPeers();
  }
}

function findMaster(mid){
  return S.masters.find(m=>m.master_id===mid);
}

function renderMasters(){
  const cont = $("#masters");
  if(!cont) return;
  cont.innerHTML = "";

  if(!S.masters.length){
    cont.innerHTML = `<div class="muted">Aucun master. Clique “Lier un Master”.</div>`;
    return;
  }

  for(const m of S.masters){
    const card = document.createElement("div");
    card.className = "card";
    // Slaves list HTML
    const slavesHTML = (m.slaves||[]).map(s=>`
      <div class="p-3 sm:p-4 bg-white">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="min-w-0">
            <input data-s-rename="${m.master_id}|${s.mac}" value="${escapeHTML(s.name||"Appareil")}"
                   class="px-3.5 py-2.5 rounded-2xl border border-gray-300 text-[15px] text-gray-900 bg-white outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium"/>
            <div class="text-xs text-gray-500 font-mono truncate mt-1">${s.mac}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge ${s.link? 'ok':''}">${s.link? "link OK":"link KO"}</span>
              <span class="badge ${s.pc_on? 'ok':''}">
                <span class="inline-block h-2 w-2 rounded-full ${s.pc_on? 'bg-green-500':'bg-gray-400'}"></span>
                ${s.pc_on? "PC ON":"PC OFF"}
              </span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn" data-cmd="${m.master_id}|${s.mac}|power">Power</button>
            <button class="btn" data-cmd="${m.master_id}|${s.mac}|reset">Reset</button>
            <button class="btn" data-cmd="${m.master_id}|${s.mac}|hard_reset">Hard Reset</button>
            <button class="btn d" data-cmd="${m.master_id}|${s.mac}|hard_off">Hard Off</button>
            <button class="btn d" data-s-del="${m.master_id}|${s.mac}">Supprimer</button>
          </div>
        </div>
      </div>
    `).join("");

    // Découverte HTML
    const discHTML = (m.discovered||[]).map(d=>`
      <div class="p-3 sm:p-4 bg-white">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div class="font-mono text-xs sm:text-sm text-gray-900">${d.mac}</div>
            <div class="text-xs text-gray-500">RSSI ${d.rssi}</div>
          </div>
          <button class="btn" data-pair="${m.master_id}|${d.mac}">Pairer</button>
        </div>
      </div>
    `).join("");

    card.innerHTML = `
      <div class="row" style="align-items:center; gap:12px;">
        <div>
          <div class="row" style="gap:8px; align-items:center;">
            <input class="rename input px-3 py-1.5 rounded-xl border border-slate-300 text-[15px]" value="${escapeHTML(m.name)}" data-m-rename="${m.master_id}">
            <span class="mono text-xs muted">ID: ${m.master_id}</span>
            <span class="badge ${m.online?'ok':''}" data-badge="${m.master_id}">${m.online?"online":"offline"}</span>
            <span class="badge ok hidden" data-saved="${m.master_id}">Sauvegardé ✓</span>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" data-m-scan="${m.master_id}">Scan</button>
        <button class="btn d" data-m-del="${m.master_id}">Supprimer</button>
      </div>

      <div class="h-px bg-gray-200 my-4"></div>

      <div class="grid md:grid-cols-2 gap-6">
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-gray-900">Mes appareils</h4>
          </div>
          <div class="divide-y divide-gray-100 rounded-2xl border border-gray-100 overflow-hidden">
            ${m.slaves?.length ? slavesHTML : `<div class="text-sm text-gray-500 py-6 text-center">Aucun appareil pairé.</div>`}
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-gray-900">Découverte</h4>
            <button class="btn" data-m-scan="${m.master_id}">Rafraîchir</button>
          </div>
          <div class="divide-y divide-gray-100 rounded-2xl border border-gray-100 overflow-hidden">
            ${m.discovered?.length ? discHTML : `<div class="text-sm text-gray-500 py-6 text-center">Aucun appareil en vue. Lance un scan puis mets le Slave en mode pairing.</div>`}
          </div>
        </div>
      </div>
    `;
    cont.appendChild(card);
  }

  // Bind actions
  bindMasterHandlers();
  bindSlaveHandlers();
}

function bindMasterHandlers(){
  // rename master
  document.querySelectorAll('[data-m-rename]').forEach(inp=>{
    let t=null;
    inp.addEventListener('input', ()=>{
      clearTimeout(t);
      t=setTimeout(async ()=>{
        const mid = inp.getAttribute('data-m-rename');
        const clean = (inp.value||"").trim() || "Master";
        if(inp.value !== clean) inp.value = clean;
        try{
          const { error } = await window.sb.from("masters").update({ name: clean }).eq("master_id", mid);
          if(error) throw error;
          const m = findMaster(mid); if(m) m.name = clean;
          const flash = document.querySelector(`[data-saved="${mid}"]`);
          if(flash){ flash.classList.remove("hidden"); setTimeout(()=>flash.classList.add("hidden"), 900); }
          log("[DB] rename master ->", mid, clean);
        }catch(e){
          alert("Erreur renommage: " + (e.message||e));
        }
      }, 500);
    });
    inp.addEventListener('blur', ()=>{ const v=(inp.value||"").trim()||"Master"; if(inp.value!==v) inp.value=v; });
  });

  // scan
  document.querySelectorAll('[data-m-scan]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const mid = btn.getAttribute('data-m-scan');
      const t = `hizaya/${mid}/cmd`;
      const msg = JSON.stringify({ cmd:"scan_start" });
      S.mqtt.publish(t, msg);
      log("[MQTT] ->", t, msg);
    };
  });

  // delete master (dés-associer du compte)
  document.querySelectorAll('[data-m-del]').forEach(btn=>{
    btn.onclick = async ()=>{
      const mid = btn.getAttribute('data-m-del');
      if(!confirm("Retirer ce master de ton compte ?")) return;
      await window.sb.from("masters").delete().eq("master_id", mid);
      await loadMasters();
    };
  });
}

function bindSlaveHandlers(){
  // Pairer
  document.querySelectorAll('[data-pair]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const [mid, mac] = btn.getAttribute('data-pair').split('|');
      const defName = "Ordinateur";
      const name = prompt("Nom de l'appareil:", defName) || defName;
      const t = `hizaya/${mid}/cmd`;
      const msg = JSON.stringify({ cmd:"pair", mac, name });
      S.mqtt.publish(t, msg);
      log("[MQTT] ->", t, msg);
      // on attend l’évènement 'peers/peer_update' pour rafraîchir la liste
    };
  });

  // Delete slave
  document.querySelectorAll('[data-s-del]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const [mid, mac] = btn.getAttribute('data-s-del').split('|');
      const t = `hizaya/${mid}/cmd`;
      const msg = JSON.stringify({ cmd:"delete", mac });
      if(confirm("Supprimer ce slave ?")){
        S.mqtt.publish(t, msg);
        log("[MQTT] ->", t, msg);
      }
    };
  });

  // Rename slave (autosend)
  document.querySelectorAll('[data-s-rename]').forEach(inp=>{
    let t=null;
    inp.addEventListener('input', ()=>{
      clearTimeout(t);
      t=setTimeout(()=>{
        if(!S.mqttReady) return;
        const [mid, mac] = inp.getAttribute('data-s-rename').split('|');
        const name = (inp.value||"").trim() || "Appareil";
        const tpc = `hizaya/${mid}/cmd`;
        const msg = JSON.stringify({ cmd:"rename", mac, name });
        S.mqtt.publish(tpc, msg);
        log("[MQTT] ->", tpc, msg);
      }, 500);
    });
    inp.addEventListener('blur', ()=>{ const v=(inp.value||"").trim()||"Appareil"; if(inp.value!==v) inp.value=v; });
  });

  // Commandes PC
  document.querySelectorAll('[data-cmd]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const [mid, mac, action] = btn.getAttribute('data-cmd').split('|');
      const t = `hizaya/${mid}/cmd`;
      const msg = JSON.stringify({ cmd:"pc", mac, action }); // action: power|reset|hard_reset|hard_off
      S.mqtt.publish(t, msg);
      log("[MQTT] ->", t, msg);
    };
  });
}

/* ----------------------- PAIRING PAR CODE ----------------------- */
let countdownTimer = null;

async function createPairingCode(){
  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  const r = await fetch(CFG.FN_CREATE_CLAIM, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if(!r.ok){ return alert("Erreur create_claim: "+ await r.text()); }
  const { code, expires_at } = await r.json();
  showClaimModal(code, expires_at);
}

function showClaimModal(code, expiresAt){
  const dlg = document.getElementById("dlgClaim");
  if(!dlg) return;
  const codeEl = document.getElementById("claimCode");
  const timerEl= document.getElementById("claimTimer");
  if(codeEl) codeEl.textContent = code;
  dlg.showModal();

  clearInterval(countdownTimer);
  const tick = ()=>{
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now())/1000));
    if(timerEl) timerEl.textContent = s+"s";
    if(s<=0) clearInterval(countdownTimer);
  };
  tick(); countdownTimer = setInterval(tick, 1000);

  const btnClose = document.getElementById("btnClaimClose");
  const btnDone  = document.getElementById("btnClaimDone");
  btnClose && (btnClose.onclick = ()=> dlg.close());
  btnDone  && (btnDone.onclick  = async ()=>{ dlg.close(); await loadMasters(); if(S.mqttReady){ subscribeAll(); requestAllStates(); requestAllPeers(); } });
}

/* ------------------------------ MQTT ------------------------------ */
function subscribe(topic){
  if(!S.mqttReady) return;
  if(S.subs.has(topic)) return;
  S.mqtt.subscribe(topic, (err)=>{
    if(!err){ S.subs.add(topic); log("[MQTT] SUB", topic); }
    else { log("[MQTT] SUB ERR", topic, err?.message||err); }
  });
}

function subscribeAll(){
  // Wildcards (si ACL l’autorise)
  subscribe("hizaya/+/state");
  subscribe("hizaya/+/evt");
  // Spécifique par master (si wildcard refusé)
  for(const m of S.masters){
    subscribe(`hizaya/${m.master_id}/state`);
    subscribe(`hizaya/${m.master_id}/evt`);
  }
}

function requestAllStates(){
  for(const m of S.masters){
    sendCmd(m.master_id, { cmd:"get_state" }); // firmware: republie "online" retained
  }
}
function requestAllPeers(){
  for(const m of S.masters){
    sendCmd(m.master_id, { cmd:"get_peers" }); // firmware: publie evt peers
  }
}

function sendCmd(mid, obj){
  if(!S.mqttReady) return;
  const t = `hizaya/${mid}/cmd`;
  const msg = JSON.stringify(obj||{});
  S.mqtt.publish(t, msg);
  log("[MQTT] ->", t, msg);
}

function onMqttMessage(topic, payload){
  const txt = payload.toString();
  log("[MQTT] <-", topic, txt);

  const mState = topic.match(/^hizaya\/([^/]+)\/state$/);
  if(mState){
    const mid = mState[1];
    setOnline(mid, txt==="online");
    return;
  }
  const mEvt = topic.match(/^hizaya\/([^/]+)\/evt$/);
  if(!mEvt) return;

  const mid = mEvt[1];
  const master = findMaster(mid); if(!master) return;

  // Parse JSON evt
  let doc; try{ doc = JSON.parse(txt); }catch{ return; }

  // Formats acceptés :
  // A) doc.type === "peers"  -> doc.peers = [{mac,name,link,pc_on}]
  // B) doc.type === "scan"   -> doc.list  = [{mac,rssi}]
  // C) doc.type === "peer_update" -> {mac, name?, link?, pc_on?}
  // D) legacy sans type : { peers:[...]} ou { scan:[...] }
  const type = doc.type || (doc.peers ? "peers" : (doc.scan||doc.list ? "scan" : null));
  if(type==="peers"){
    const peers = doc.peers || [];
    // merge par mac
    const map = new Map((master.slaves||[]).map(s=>[s.mac, s]));
    for(const p of peers){
      const prev = map.get(p.mac) || {};
      map.set(p.mac, {
        mac: p.mac,
        name: p.name ?? prev.name ?? "Appareil",
        link: !!p.link,
        pc_on: !!p.pc_on
      });
    }
    master.slaves = Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name));
    renderMasters();
  }else if(type==="scan"){
    const list = doc.list || doc.scan || [];
    master.discovered = list.slice(0,32).map(x=>({ mac:x.mac, rssi:x.rssi ?? 0 }));
    renderMasters();
  }else if(type==="peer_update"){
    const mac = doc.mac;
    if(!mac) return;
    const s = (master.slaves||[]).find(x=>x.mac===mac);
    if(s){
      if(typeof doc.name !== "undefined") s.name = doc.name || "Appareil";
      if(typeof doc.link !== "undefined") s.link = !!doc.link;
      if(typeof doc.pc_on !== "undefined") s.pc_on = !!doc.pc_on;
      renderMasters();
    }
  }
}

function setOnline(master_id, online){
  const m = findMaster(master_id);
  if(m){ m.online = !!online; }
  const b = document.querySelector(`[data-badge="${master_id}"]`);
  if(!b) return;
  b.textContent = online ? "online" : "offline";
  b.className = "badge" + (online ? " ok" : "");
}

async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; S.subs.clear(); }

  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  const r = await fetch(CFG.FN_MQTT_CREDS, { method:"POST", headers:{ Authorization:`Bearer ${session.access_token}` } });
  if(!r.ok){ return alert("MQTT creds error: "+ await r.text()); }
  const { url, username, password } = await r.json();

  const clientId = "pwa-"+Math.random().toString(16).slice(2);
  const opts = { clientId, username, password, keepalive:30, clean:true, reconnectPeriod:3000 };

  log("[MQTT] connect", url, username);
  S.mqtt = mqtt.connect(url, opts);

  try { localStorage.setItem(MQTT_REMEMBER_KEY, "1"); } catch(_) {}

  S.mqtt.on("connect", ()=>{
    S.mqttReady = true;
    log("[MQTT] connected");
    subscribeAll();
    requestAllStates();
    requestAllPeers();
  });
  S.mqtt.on("message", onMqttMessage);
  S.mqtt.on("error", err=> log("[MQTT] error", err?.message||err));
  S.mqtt.on("close", ()=>{ S.mqttReady=false; log("[MQTT] closed"); });
}

function disconnectMQTT(){
  if(S.mqtt){ S.mqtt.end(true); S.mqtt=null; S.mqttReady=false; S.subs.clear(); log("[MQTT] disconnected"); }
  try { localStorage.removeItem(MQTT_REMEMBER_KEY); } catch(_) {}
}

/* ------------------------------- BOOT ------------------------------- */
document.addEventListener("DOMContentLoaded", initAuthUI);

/* ----------------------------- HELPERS ------------------------------ */
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])) }
