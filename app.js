/* HIZAYA – App statique (GitHub Pages)
 * - Auth Supabase (Google + email)
 * - Liste des masters (table Supabase)
 * - MQTT (mqtt.js / WSS 8884) → souscription hizaya/+/state
 * - Appairage: create_claim → code 6 chiffres
 */

const CFG = window.__CFG__ || {};
const logEl = document.getElementById("log");
const mastersEl = document.getElementById("masters");
function log(...a){ logEl.textContent += a.join(" ")+"\n"; logEl.scrollTop = logEl.scrollHeight; }

const S = {
  session: null,
  masters: [],
  mqtt: null,
  mqttReady: false,
};

// ---------- AUTH UI ----------
function setAuthedUI(on, email=""){
  document.getElementById("userInfo").textContent = on ? (email||"Connecté") : "Hors ligne";
  document.getElementById("page-login").classList.toggle("hidden", !!on);
  document.getElementById("page-main").classList.toggle("hidden", !on);
  document.getElementById("btnLogout").classList.toggle("hidden", !on);
  document.getElementById("btnLoginGoogle").classList.toggle("hidden", !!on);
}

async function initAuth(){
  // events de supabase-auth.js
  window.addEventListener("supabase-auth", (e)=>updateSession(e.detail.session));

  // boutons
  document.getElementById("btnLoginGoogle").onclick = ()=>window.hzAuth.loginWithGoogle();
  document.getElementById("btnLoginEmail").onclick = async ()=>{
    const email = document.getElementById("email").value.trim();
    if(!email) return alert("Entre un email.");
    await window.hzAuth.loginWithEmail(email);
    alert("Lien envoyé (vérifie ta boîte mail).");
  };
  document.getElementById("btnLogout").onclick = async ()=>{ await window.hzAuth.logout(); };

  document.getElementById("btnConnect").onclick = connectMQTT;
  document.getElementById("btnDisconnect").onclick = disconnectMQTT;
  document.getElementById("btnPairMaster").onclick = createPairingCode;
  document.getElementById("btnRefreshMasters").onclick = loadMasters;

  // session initiale
  const { data:{ session } } = await window.sb.auth.getSession();
  updateSession(session);
}

async function updateSession(session){
  S.session = session || null;
  if(!S.session){ setAuthedUI(false); return; }
  setAuthedUI(true, S.session.user.email || "");
  await loadMasters();
}

// ---------- DB: masters ----------
async function loadMasters(){
  const { data, error } = await window.sb
    .from("masters")
    .select("master_id,name,created_at")
    .order("created_at", { ascending:false });
  if(error){ log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();

  if(S.mqttReady){
    // souscription wildcard (un seul subscribe)
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
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.innerHTML = `
      <div class="row">
        <div>
          <div style="font-weight:600">${escapeHTML(m.name||"Master")}</div>
          <div class="muted mono">ID: ${m.master_id} • <span class="badge" data-badge="${m.master_id}">offline</span></div>
        </div>
        <div class="spacer"></div>
        <button class="btn" data-scan="${m.master_id}">Scan (demo)</button>
        <button class="btn d" data-del="${m.master_id}">Supprimer</button>
      </div>
    `;
    mastersEl.appendChild(wrap);

    wrap.querySelector(`[data-del="${m.master_id}"]`).onclick = async ()=>{
      if(!confirm("Retirer ce master de ton compte ?")) return;
      await window.sb.from("masters").delete().eq("master_id", m.master_id);
      await loadMasters();
    };
    wrap.querySelector(`[data-scan="${m.master_id}"]`).onclick = ()=>{
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
  b.textContent = online ? "online" : "offline";
  b.className = "badge" + (online ? " ok" : "");
}

function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])) }

// ---------- Pairing (Edge Function create_claim) ----------
let timer = null;
async function createPairingCode(){
  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  const r = await fetch(CFG.FN_CREATE_CLAIM, {
    method:"POST",
    headers:{ Authorization:`Bearer ${session.access_token}` }
  });
  if(!r.ok){ return alert("Erreur create_claim: " + await r.text()); }
  const { code, expires_at } = await r.json();
  showClaimModal(code, expires_at);
}

function showClaimModal(code, expiresAt){
  document.getElementById("claimCode").textContent = code;
  const dlg = document.getElementById("dlgClaim");
  dlg.showModal();
  clearInterval(timer);
  const tick = ()=>{
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now())/1000));
    document.getElementById("claimTimer").textContent = s+"s";
    if(s<=0) clearInterval(timer);
  };
  tick(); timer = setInterval(tick, 1000);
}
document.getElementById("btnClaimClose").onclick = ()=> document.getElementById("dlgClaim").close();
document.getElementById("btnClaimDone").onclick  = async ()=>{ document.getElementById("dlgClaim").close(); await loadMasters(); };

// ---------- MQTT (mqtt.js / WSS) ----------
async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; }

  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  // récupère creds front (user_mqtt_creds)
  const r = await fetch(CFG.FN_MQTT_CREDS, { method:"POST", headers:{ Authorization:`Bearer ${session.access_token}` } });
  if(!r.ok){ return alert("MQTT creds error: "+ await r.text()); }
  const { url, username, password } = await r.json();

  const clientId = "pwa-"+Math.random().toString(16).slice(2);
  const opts = { clientId, username, password, keepalive:30, clean:true, reconnectPeriod:3000 };

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
