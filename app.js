/* HIZAYA – App front statique (GitHub Pages)
 * - Auth Supabase (Google ou email)
 * - Liste des masters (table Supabase)
 * - Connexion MQTT (mqtt.js via WSS) → souscription hizaya/+/state
 * - Création d’un code d’appairage 6 chiffres (Edge Function)
 */

const CFG = window.__CFG__ || {};
const logEl = document.getElementById("log");
const mastersEl = document.getElementById("masters");

function log(...a){ logEl.textContent += a.join(" ") + "\n"; logEl.scrollTop = logEl.scrollHeight; }

// Etat
const S = {
  session: null,
  masters: [],
  mqtt: null,
  mqttReady: false,
};

// ---------- AUTH ----------
async function initAuth(){
  // écoute les évènements du wrapper
  window.addEventListener("supabase-auth", (e)=>updateSession(e.detail.session));

  // Boutons
  document.getElementById("btnLoginGoogle").onclick = ()=>window.hzAuth.loginWithGoogle();
  document.getElementById("btnLoginEmail").onclick = async ()=>{
    const email = document.getElementById("email").value.trim();
    if(!email) return alert("Entre un email.");
    await window.hzAuth.loginWithEmail(email);
    alert("Lien envoyé (check email).");
  };
  document.getElementById("btnLogout").onclick = async ()=>{ await window.hzAuth.logout(); };

  // Actions
  document.getElementById("btnConnect").onclick = connectMQTT;
  document.getElementById("btnDisconnect").onclick = disconnectMQTT;
  document.getElementById("btnPairMaster").onclick = createPairingCode;
  document.getElementById("btnRefreshMasters").onclick = loadMasters;

  // Get session actuelle
  const { data:{ session } } = await window.sb.auth.getSession();
  updateSession(session);
}

async function updateSession(session){
  S.session = session || null;
  const ui = document.getElementById("userInfo");
  const pgLogin = document.getElementById("page-login");
  const pgMain  = document.getElementById("page-main");
  const btnOut  = document.getElementById("btnLogout");
  const btnGoogle = document.getElementById("btnLoginGoogle");

  if(!S.session){
    ui.textContent = "Hors ligne";
    pgLogin.classList.remove("hidden");
    pgMain.classList.add("hidden");
    btnOut.classList.add("hidden");
    btnGoogle.classList.remove("hidden");
    return;
  }
  ui.textContent = S.session.user.email || "Connecté";
  pgLogin.classList.add("hidden");
  pgMain.classList.remove("hidden");
  btnOut.classList.remove("hidden");
  btnGoogle.classList.add("hidden");

  await loadMasters();
}

// ---------- MASTERS ----------
async function loadMasters(){
  const { data, error } = await window.sb
    .from("masters")
    .select("master_id,name,created_at")
    .order("created_at", { ascending: false });

  if(error){ log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();

  // si MQTT est connecté, souscrire aux state
  if(S.mqttReady){
    S.mqtt.subscribe("hizaya/+/state");
  }
}

function renderMasters(){
  mastersEl.innerHTML = "";
  if(!S.masters.length){
    mastersEl.innerHTML = `<div class="muted">Aucun master. Clique “Lier un Master”.</div>`;
    return;
  }
  for(const m of S.masters){
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div>
          <div style="font-weight:600">${escapeHTML(m.name||"Master")}</div>
          <div class="muted mono">ID: ${m.master_id}</div>
        </div>
        <div class="spacer"></div>
        <span class="badge off" data-badge="${m.master_id}">offline</span>
        <button class="btn" data-scan="${m.master_id}">Scan (demo)</button>
        <button class="btn d" data-del="${m.master_id}">Supprimer</button>
      </div>
    `;
    mastersEl.appendChild(card);

    card.querySelector(`[data-del="${m.master_id}"]`).onclick = async ()=>{
      if(!confirm("Retirer ce master de ton compte ?")) return;
      await window.sb.from("masters").delete().eq("master_id", m.master_id);
      await loadMasters();
    };
    card.querySelector(`[data-scan="${m.master_id}"]`).onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const t = `hizaya/${m.master_id}/cmd`;
      const msg = JSON.stringify({ cmd:"scan_start" });
      S.mqtt.publish(t, msg);
      log("[MQTT] ->", t, msg);
    };
  }
}

function setOnline(master_id, online){
  const b = document.querySelector(`[data-badge="${master_id}"]`);
  if(!b) return;
  if(online){
    b.textContent = "online";
    b.className = "badge ok";
  }else{
    b.textContent = "offline";
    b.className = "badge off";
  }
}

function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])) }

// ---------- CLAIM (pairing) ----------
let countTimer = null;
async function createPairingCode(){
  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  const res = await fetch(CFG.FN_CREATE_CLAIM, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if(!res.ok){
    const t = await res.text();
    alert("Erreur create_claim: "+t);
    return;
  }
  const { code, expires_at } = await res.json();
  showClaimModal(code, expires_at);
}

function showClaimModal(code, expiresAt){
  document.getElementById("claimCode").textContent = code;
  const dlg = document.getElementById("dlgClaim");
  dlg.showModal();
  clearInterval(countTimer);
  function refresh(){
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now())/1000));
    document.getElementById("claimTimer").textContent = s+"s";
    if(s<=0) clearInterval(countTimer);
  }
  refresh();
  countTimer = setInterval(refresh, 1000);
}
document.getElementById("btnClaimClose").onclick = ()=> document.getElementById("dlgClaim").close();
document.getElementById("btnClaimDone").onclick  = async ()=>{
  document.getElementById("dlgClaim").close();
  await loadMasters();
};

// ---------- MQTT ----------
async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; }

  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  // Récupère des credentials dédiés front (Edge Function)
  const r = await fetch(CFG.FN_MQTT_CREDS, {
    method:"POST",
    headers:{ Authorization:`Bearer ${session.access_token}` }
  });
  if(!r.ok){ return alert("MQTT creds error: "+ await r.text()); }
  const { url, username, password } = await r.json();

  const clientId = "pwa-"+Math.random().toString(16).slice(2);
  const opts = { clientId, username, password, keepalive: 30, clean: true, reconnectPeriod: 3000 };

  log("[MQTT] connect", url, username);
  S.mqtt = mqtt.connect(url, opts);

  S.mqtt.on("connect", ()=>{
    S.mqttReady = true;
    log("[MQTT] connected");
    // un seul wildcard pour tous les masters
    S.mqtt.subscribe("hizaya/+/state");
  });
  S.mqtt.on("message", (topic, payload)=>{
    const txt = payload.toString();
    log("[MQTT] <-", topic, txt);
    const m = topic.match(/^hizaya\/([^/]+)\/state$/);
    if(m){ setOnline(m[1], txt==="online"); }
  });
  S.mqtt.on("error", err=> log("[MQTT] error", err?.message||err));
  S.mqtt.on("close", ()=>{ S.mqttReady=false; log("[MQTT] closed"); });
}

function disconnectMQTT(){
  if(S.mqtt){ S.mqtt.end(true); S.mqtt=null; S.mqttReady=false; log("[MQTT] disconnected"); }
}

// ---------- BOOT ----------
document.addEventListener("DOMContentLoaded", initAuth);
