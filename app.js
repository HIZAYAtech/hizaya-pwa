// ===== HIZAYA PWA — app.js =====
// Auth via supabase-auth.js (expose window.supabase, window.hzAuth)
// MQTT via mqtt.min.js (expose window.mqtt.connect)

// ⚙️ URLs des Edge Functions (mets bien ton REF Supabase)
const FN_CREATE_CLAIM = "https://ctjljqmxjnfykskfgral.supabase.co/functions/v1/create_claim";
const FN_MQTT_CREDS   = "https://ctjljqmxjnfykskfgral.supabase.co/functions/v1/get_or_create_mqtt_creds";

// État global
const S = {
  session: null,
  masters: [],
  mqtt: null,
  mqttReady: false,
  mqttSubs: new Set(),
};

// -------- Helpers DOM/UI --------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function show(sel){ $(sel)?.classList.remove("hidden"); }
function hide(sel){ $(sel)?.classList.add("hidden"); }
function log(...a){ const el=$("#log"); if(!el) return; el.textContent += a.join(" ")+"\n"; el.scrollTop = el.scrollHeight; }
function debounce(fn, d=400){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), d); }; }
function escapeHtml(s=""){ return s.replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }

// --------------- AUTH ---------------
async function initAuth(){
  // écoute session depuis supabase-auth.js
  window.addEventListener("supabase-auth", (e)=> updateSession(e.detail.session));

  // session existante
  try{
    const { data:{ session } } = await window.supabase.auth.getSession();
    updateSession(session);
  }catch(err){
    console.error("[AUTH] getSession error", err);
  }

  // boutons
  $("#btnGoogle")?.addEventListener("click", ()=>window.hzAuth?.loginWithGoogle());
  $("#btnLogout")?.addEventListener("click", ()=>window.hzAuth?.logout());
}

async function updateSession(session){
  S.session = session || null;
  if(!S.session){
    if($("#who")) $("#who").textContent = "Hors ligne";
    show("#page-login"); hide("#page-main");
    return;
  }
  if($("#who")) $("#who").textContent = S.session.user.email || "Connecté";
  hide("#page-login"); show("#page-main");

  await loadMasters();

  // si déjà connecté MQTT, (re)abonne les topics spécifiques
  if(S.mqttReady){
    for(const m of S.masters){
      const t = `hizaya/${m.master_id}/state`;
      if(!S.mqttSubs.has(t)){ S.mqtt.subscribe(t); S.mqttSubs.add(t); }
    }
  }
}

// ---------- MASTERS (Supabase) ----------
async function loadMasters(){
  if(!S.session) return;
  const { data, error } = await window.supabase
    .from("masters")
    .select("master_id, name, created_at")
    .order("created_at", { ascending: false });

  if(error){ log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();

  // si MQTT actif, abonne (en plus du wildcard)
  if(S.mqttReady){
    for(const m of S.masters){
      const t = `hizaya/${m.master_id}/state`;
      if(!S.mqttSubs.has(t)){ S.mqtt.subscribe(t); S.mqttSubs.add(t); }
    }
  }
}

function renderMasters(){
  const cont = $("#masters");
  if(!cont) return;
  cont.innerHTML = "";

  if(!S.masters.length){
    cont.innerHTML = `<div class="text-sm text-slate-600">Aucun master. Clique “Lier un Master”.</div>`;
    return;
  }

  for(const m of S.masters){
    const card = document.createElement("div");
    card.className = "bg-white border border-slate-200 rounded-2xl shadow-sm p-4";
    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="min-w-0">
          <div class="text-[17px] font-semibold text-slate-900 flex items-center gap-2">
            <input class="rename input px-3 py-1.5 rounded-xl border border-slate-300 text-[15px]" value="${escapeHtml(m.name||"Master")}">
            <span class="mono text-xs text-slate-500">ID: ${m.master_id}</span>
            <span class="badge inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">offline</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-scan px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200">Scan</button>
          <button class="btn-del px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700">Supprimer</button>
        </div>
      </div>
      <div class="text-sm text-slate-600">Mes appareils (via MQTT/evt)… (à implémenter avec tes messages)</div>
    `;

    // rename autosave
    const input = card.querySelector(".rename");
    input.addEventListener("input", debounce(async (ev)=>{
      const name = (ev.target.value || "Master").trim();
      const { error } = await window.supabase.from("masters").update({ name }).eq("master_id", m.master_id);
      if(error) log("[DB] rename error:", error.message);
      else log("[DB] rename ->", m.master_id, name);
    }, 500));

    // delete
    card.querySelector(".btn-del").onclick = async ()=>{
      if(!confirm("Supprimer ce master de ton compte ?")) return;
      const { error } = await window.supabase.from("masters").delete().eq("master_id", m.master_id);
      if(error) return alert("Supabase error: "+error.message);
      await loadMasters();
    };

    // scan → publish /cmd
    card.querySelector(".btn-scan").onclick = ()=>{
      if(!S.mqttReady) return alert("Connecte MQTT d'abord");
      const t = `hizaya/${m.master_id}/cmd`;
      const msg = JSON.stringify({ cmd:"scan_start" });
      try{
        S.mqtt.publish(t, msg);
        log("[MQTT] ->", t, msg);
      }catch(e){
        log("[MQTT] publish err", e?.message||e);
      }
    };

    cont.appendChild(card);
  }
}

// met à jour le badge online/offline
function setOnline(master_id, online){
  const cards = $$("#masters > div");
  for(const el of cards){
    const idText = el.querySelector(".mono")?.textContent || "";
    if(idText.includes(master_id)){
      const b = el.querySelector(".badge");
      if(!b) return;
      if(online){
        b.textContent="online";
        b.className="badge inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700";
      }else{
        b.textContent="offline";
        b.className="badge inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700";
      }
    }
  }
}

// -------- Appairage par code (6 chiffres) --------
let countdownTimer = null;

async function createPairingCode(){
  const { data:{ session } } = await window.supabase.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  const res = await fetch(FN_CREATE_CLAIM, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if(!res.ok){
    const t = await res.text();
    log("[CLAIM] create_claim error:", t);
    return alert("Erreur create_claim: "+t);
  }
  const { code, expires_at } = await res.json();
  showClaimModal(code, expires_at);
}

function showClaimModal(code, expiresAt){
  $("#claimCode").textContent = code;
  show("#modalClaim");
  clearInterval(countdownTimer);
  function refreshTimer(){
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now())/1000));
    $("#claimTimer").textContent = s+"s";
    if(s<=0) clearInterval(countdownTimer);
  }
  refreshTimer();
  countdownTimer = setInterval(refreshTimer, 1000);
}
function closeClaimModal(){ hide("#modalClaim"); clearInterval(countdownTimer); }

$("#btnPairMaster")?.addEventListener("click", createPairingCode);
$("#btnClaimDone")?.addEventListener("click", async ()=>{ closeClaimModal(); await loadMasters(); });
$("#btnClaimClose")?.addEventListener("click", closeClaimModal);
$("#btnRefreshMasters")?.addEventListener("click", loadMasters);

// --------------- MQTT (front) ---------------
async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; S.mqttSubs.clear(); }

  const { data:{ session } } = await window.supabase.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  // récupère les creds pour le FRONT (fonction renvoie {url, username, password})
  const r = await fetch(FN_MQTT_CREDS, { method:"POST", headers:{ Authorization:`Bearer ${session.access_token}` } });
  if(!r.ok){ return alert("MQTT creds error: "+ await r.text()); }
  const { url, username, password } = await r.json();

  if(!window.mqtt || !window.mqtt.connect){
    return alert("Bibliothèque MQTT (mqtt.min.js) introuvable");
  }

  const clientId = "pwa-"+Math.random().toString(16).slice(2);
  const opts = {
    clientId,
    username,
    password,
    keepalive: 30,
    clean: true,
    reconnectPeriod: 3000,
  };

  S.mqtt = window.mqtt.connect(url, opts);

  S.mqtt.on("connect", async ()=>{
    S.mqttReady = true;
    log("[MQTT] connected", url, "as", username);

    // 🔸 wildcard: reçoit l’état de tous les masters
    S.mqtt.subscribe("hizaya/+/state");

    // et on (ré)abonne explicitement les masters connus (pour capturer les retained)
    for(const m of S.masters){
      const t = `hizaya/${m.master_id}/state`;
      if(!S.mqttSubs.has(t)){ S.mqtt.subscribe(t); S.mqttSubs.add(t); }
    }
  });

  S.mqtt.on("message", (topic, payload)=>{
    const txt = payload?.toString?.() ?? "";
    log("[MQTT] <-", topic, txt);

    // état online/offline
    const m = topic.match(/^hizaya\/([^/]+)\/state$/);
    if(m){ setOnline(m[1], txt==="online"); }

    // (plus tard) traite /evt, etc.
  });

  S.mqtt.on("error", err=> log("[MQTT] error", err?.message||err));
  S.mqtt.on("close", ()=>{ S.mqttReady=false; log("[MQTT] closed"); });
}

function disconnectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; S.mqttSubs.clear(); log("[MQTT] disconnected"); }
}

$("#btnConnect")?.addEventListener("click", connectMQTT);
$("#btnDisconnect")?.addEventListener("click", disconnectMQTT);

// --------------- Boot ---------------
document.addEventListener("DOMContentLoaded", initAuth);

// expose pour debug console
window.S = S;
