// ===== HIZAYA PWA — Appairage par code + MQTT =====

// Base URL des Functions (auto depuis SUPABASE_URL)
function fnBase() {
  const url = window.__SUPABASE_URL__ || (window.supabase?.supabaseUrl) || "";
  try {
    const ref = new URL(url).host.split(".")[0];
    return `https://${ref}.functions.supabase.co`;
  } catch { return ""; }
}
const FN_CREATE_CLAIM = () => fnBase() + "/create_claim";
const FN_MQTT_CREDS   = () => fnBase() + "/get_or_create_mqtt_creds";

const S = {
  session: null,
  masters: [],
  mqtt: null,
  mqttReady: false,
  mqttSubs: new Set(),
};

const $ = (s) => document.querySelector(s);
function show(id){ $(id).classList.remove("hidden"); }
function hide(id){ $(id).classList.add("hidden"); }
function log(...a){ const el=$("#log"); if(!el) return; el.textContent += a.join(" ")+"\n"; el.scrollTop = el.scrollHeight; }

// ---------- AUTH ----------
async function initAuth(){
  window.addEventListener("supabase-auth", e => updateSession(e.detail.session));
  const { data: { session } } = await window.supabase.auth.getSession();
  updateSession(session);

  $("#btnGoogle")?.addEventListener("click", ()=>window.hzAuth.loginWithGoogle());
  $("#btnLogout")?.addEventListener("click", async ()=>{ await window.hzAuth.logout(); });
}

async function updateSession(session){
  S.session = session || null;
  if(!S.session){
    $("#who").textContent = "Hors ligne";
    show("#page-login"); hide("#page-main");
    return;
  }
  $("#who").textContent = S.session.user.email || "Connecté";
  hide("#page-login"); show("#page-main");
  await loadMasters();
}

// ---------- MASTERS (Supabase) ----------
async function loadMasters(){
  const { data, error } = await window.supabase
    .from("masters")
    .select("master_id, name, created_at")
    .order("created_at", { ascending: false });
  if(error){ log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();

  // (Re)abonnements MQTT state
  if(S.mqtt){
    for(const m of S.masters){
      const t = `hizaya/${m.master_id}/state`;
      if(!S.mqttSubs.has(t)){ S.mqtt.subscribe(t); S.mqttSubs.add(t); }
    }
  }
}

function renderMasters(){
  const cont = $("#masters");
  cont.innerHTML = "";
  if(!S.masters.length){
    cont.innerHTML = `<div class="muted">Aucun master. Clique “Lier un Master”.</div>`;
    return;
  }
  for(const m of S.masters){
    const card = document.createElement("div");
    card.className = "card";
    card.style.padding = "12px 12px 14px";
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div>
          <div style="font-weight:700">${m.name}</div>
          <div class="muted mono">ID: ${m.master_id} • <span class="badge">offline</span></div>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-scan">Scan</button>
          <button class="btn btn-danger btn-del">Supprimer</button>
        </div>
      </div>
      <div class="muted" style="margin-top:8px">Mes appareils (à implémenter avec tes messages MQTT /evt)</div>
    `;

    // suppression
    card.querySelector(".btn-del").onclick = async ()=>{
      if(!confirm("Supprimer ce master de ton compte ?")) return;
      await window.supabase.from("masters").delete().eq("master_id", m.master_id);
      await loadMasters();
    };

    // scan → publish cmd
    card.querySelector(".btn-scan").onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const t = `hizaya/${m.master_id}/cmd`;
      const msg = JSON.stringify({ cmd:"scan_start" });
      S.mqtt.publish(t, msg);
      log("[MQTT] ->", t, msg);
    };

    cont.appendChild(card);
  }
}

function setOnline(master_id, online){
  const cards = [...document.querySelectorAll("#masters .card")];
  for(const el of cards){
    const txt = el.querySelector(".mono")?.textContent || "";
    if(txt.includes(master_id)){
      const badge = el.querySelector(".badge");
      badge.textContent = online ? "online" : "offline";
      badge.style.background = online ? "#dcfce7" : "#f1f5f9";
      badge.style.borderColor = online ? "#86efac" : "#e2e8f0";
    }
  }
}

// ---------- APPAIRAGE ----------
let countdownTimer = null;
async function createPairingCode(){
  const { data:{ session } } = await window.supabase.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  const url = FN_CREATE_CLAIM();
  if(!url) return alert("Functions base URL introuvable (vérifie SUPABASE_URL).");

  const res = await fetch(url, { method:"POST", headers:{ Authorization:`Bearer ${session.access_token}` }});
  if(!res.ok){ return alert("Erreur create_claim: "+ await res.text()); }
  const { code, expires_at } = await res.json();
  showClaimModal(code, expires_at);
}

function showClaimModal(code, expiresAt){
  $("#claimCode").textContent = code;
  $("#modalClaim").classList.remove("hidden");
  clearInterval(countdownTimer);
  function refresh(){
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now())/1000));
    $("#claimTimer").textContent = s+"s";
    if(s<=0) clearInterval(countdownTimer);
  }
  refresh();
  countdownTimer = setInterval(refresh, 1000);
}
function closeClaimModal(){ $("#modalClaim").classList.add("hidden"); clearInterval(countdownTimer); }

$("#btnPairMaster")?.addEventListener("click", createPairingCode);
$("#btnClaimDone")?.addEventListener("click", async ()=>{ closeClaimModal(); await loadMasters(); });
$("#btnClaimClose")?.addEventListener("click", closeClaimModal);
$("#btnRefreshMasters")?.addEventListener("click", loadMasters);

// ---------- MQTT (Front) ----------
async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; S.mqttSubs.clear(); }

  const { data:{ session } } = await window.supabase.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  // Récupère des credentials Front
  const url = FN_MQTT_CREDS();
  if(!url) return alert("Functions base URL introuvable.");
  const r = await fetch(url, { method:"POST", headers:{ Authorization:`Bearer ${session.access_token}` } });
  if(!r.ok){ return alert("MQTT creds error: "+ await r.text()); }
  const { url: wssUrl, username, password } = await r.json();

  const endpoint = window.__MQTT_WSS_URL__ || wssUrl;
  if(!endpoint) return alert("URL WSS MQTT introuvable.");

  const clientId = "pwa-"+Math.random().toString(16).slice(2);
  const opts = { clientId, username, password, keepalive:30, clean:true, reconnectPeriod:3000 };

  S.mqtt = mqtt.connect(endpoint, opts);

  S.mqtt.on("connect", ()=>{
    S.mqttReady = true;
    log("[MQTT] connected", endpoint, "as", username);
    for(const m of S.masters){
      const t = `hizaya/${m.master_id}/state`;
      if(!S.mqttSubs.has(t)){ S.mqtt.subscribe(t); S.mqttSubs.add(t); }
    }
  });
  S.mqtt.on("message",(topic,payload)=>{
    const txt = payload.toString();
    log("[MQTT] <-", topic, txt);
    const m = topic.match(/^hizaya\/([^/]+)\/state$/);
    if(m){ setOnline(m[1], txt==="online"); }
  });
  S.mqtt.on("error", err=> log("[MQTT] error", err?.message||err));
  S.mqtt.on("close", ()=>{ S.mqttReady=false; log("[MQTT] closed"); });
}
function disconnectMQTT(){ if(S.mqtt){ S.mqtt.end(true); S.mqtt=null; S.mqttReady=false; S.mqttSubs.clear(); log("[MQTT] disconnected"); } }

$("#btnConnect")?.addEventListener("click", connectMQTT);
$("#btnDisconnect")?.addEventListener("click", disconnectMQTT);

// ---------- BOOT ----------
document.addEventListener("DOMContentLoaded", initAuth);
