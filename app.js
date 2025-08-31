// ===== HIZAYA PWA — Appairage par code (6 chiffres) + MQTT =====

// ⚙️ URLs des Edge Functions (remplace <PROJECT-REF>)
const FN_CREATE_CLAIM = "https://ctjljqmxjnfykskfgral.functions.supabase.co/create_claim";
const FN_MQTT_CREDS   = "https://ctjljqmxjnfykskfgral.functions.supabase.co/get_or_create_mqtt_creds"; // si tu l’utilises pour connecter le front au broker

// État global
const S = {
  session: null,
  masters: [],
  mqtt: null,
  mqttReady: false,
  mqttSubs: new Set(),
};

// Helpers UI
const $ = (s) => document.querySelector(s);
function log(...a){ const el=$("#log"); if(!el) return; el.textContent += a.join(" ")+"\n"; el.scrollTop = el.scrollHeight; }
function show(id){ $(id).classList.remove("hidden"); }
function hide(id){ $(id).classList.add("hidden"); }

// ----------------------- AUTH -----------------------
async function initAuth(){
  // écoute les changements de session (déclenché par supabase-auth.js)
  window.addEventListener("supabase-auth", (e)=>updateSession(e.detail.session));
  const { data:{ session } } = await window.supabase.auth.getSession();
  updateSession(session);

  // boutons
  $("#btnGoogle")?.addEventListener("click", ()=>window.hzAuth.loginWithGoogle());
  $("#btnLogout")?.addEventListener("click", async ()=>{
    await window.hzAuth.logout();
  });
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

// -------------------- MASTERS (Supabase) --------------------
async function loadMasters(){
  const { data, error } = await window.supabase
    .from("masters")
    .select("master_id, name, created_at")
    .order("created_at", { ascending: false });
  if(error){ log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();
  // (Re)abonne les /state pour l’info online
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
    cont.innerHTML = `<div class="text-sm text-slate-600">Aucun master. Clique “Lier un Master”.</div>`;
    return;
  }
  for(const m of S.masters){
    const card = document.createElement("div");
    card.className = "bg-white border border-slate-200 rounded-2xl shadow-sm p-4";
    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-[17px] font-semibold text-slate-900 flex items-center gap-2">
            <input class="rename input px-3 py-1.5 rounded-xl border border-slate-300 text-[15px]" value="${m.name}">
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
    // Rename (autosave)
    card.querySelector(".rename").addEventListener("input", debounce(async (ev)=>{
      const name = ev.target.value.trim() || "Master";
      await window.supabase.from("masters").update({ name }).eq("master_id", m.master_id);
      log("[DB] rename ->", m.master_id, name);
    }, 500));

    // Delete
    card.querySelector(".btn-del").onclick = async ()=>{
      if(!confirm("Supprimer ce master de ton compte ?")) return;
      await window.supabase.from("masters").delete().eq("master_id", m.master_id);
      await loadMasters();
    };

    // Scan (publie un cmd MQTT)
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

// petite aide pour afficher “online/offline” en temps réel
function setOnline(master_id, online){
  const cards = [...document.querySelectorAll("#masters > div")];
  for(const el of cards){
    const idText = el.querySelector(".mono")?.textContent || "";
    if(idText.includes(master_id)){
      const b = el.querySelector(".badge");
      if(online){ b.textContent="online"; b.className="badge inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700"; }
      else      { b.textContent="offline"; b.className="badge inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700"; }
    }
  }
}

// ------------------- APPAIRAGE PAR CODE ---------------------
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
    return alert("Erreur create_claim: "+t);
  }
  const { code, expires_at } = await res.json();
  showClaimModal(code, expires_at);
}

function showClaimModal(code, expiresAt){
  $("#claimCode").textContent = code;
  show("#modalClaim");
  // compte à rebours
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

// ----------------------- MQTT (front) -----------------------
async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; S.mqttSubs.clear(); }
  const { data:{ session } } = await window.supabase.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  // Récupère des credentials pour le FRONT (user_mqtt_creds)
  const r = await fetch(FN_MQTT_CREDS, { method:"POST", headers:{ Authorization:`Bearer ${session.access_token}` } });
  if(!r.ok){ return alert("MQTT creds error: "+ await r.text()); }
  const { url, username, password } = await r.json();

  const clientId = "pwa-"+Math.random().toString(16).slice(2);
  const opts = { clientId, username, password, keepalive: 30, clean: true, reconnectPeriod: 3000 };

  S.mqtt = mqtt.connect(url, opts);

  S.mqtt.on("connect", async ()=>{
    S.mqttReady = true;
    log("[MQTT] connected", url);
    // s'abonner au state des masters
    for(const m of S.masters){
      const t = `hizaya/${m.master_id}/state`;
      if(!S.mqttSubs.has(t)){ S.mqtt.subscribe(t); S.mqttSubs.add(t); }
    }
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
function disconnectMQTT(){ if(S.mqtt){ S.mqtt.end(true); S.mqtt=null; S.mqttReady=false; S.mqttSubs.clear(); log("[MQTT] disconnected"); } }

$("#btnConnect")?.addEventListener("click", connectMQTT);
$("#btnDisconnect")?.addEventListener("click", disconnectMQTT);

// ----------------------- UTILS -----------------------
function debounce(fn, d=300){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), d); }; }

// ----------------------- BOOT ------------------------
document.addEventListener("DOMContentLoaded", initAuth);
