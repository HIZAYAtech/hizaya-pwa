/* HIZAYA – PWA stable (app.js)
 * - Auth Supabase via supabase-auth.js (window.sb & window.hzAuth)
 * - Liste & renommage Masters (autosave 500ms + badge Sauvegardé)
 * - MQTT via mqtt.js (WSS) + auto-reconnect après reload
 * - Abonnement double: "hizaya/+/state" + "hizaya/<id>/state"
 * - Ping initial: publie {"cmd":"get_state"} pour forcer le Master à reposter son état
 */

const CFG = window.__CFG__ || {}; // { SUPABASE_URL, FN_CREATE_CLAIM, FN_MQTT_CREDS }
const $  = (s) => document.querySelector(s);

const MQTT_REMEMBER_KEY = "mqtt_autoconnect";

const S = {
  session: null,
  masters: [],
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
  $("#btnLoginEmail") && ($("#btnLoginEmail").onclick = async ()=>{
    const email = ($("#email")?.value||"").trim();
    if(!email) return alert("Entre un email.");
    await window.hzAuth.loginWithEmail(email);
    alert("Lien envoyé (vérifie ta boîte mail).");
  });
  $("#btnLogout") && ($("#btnLogout").onclick = async ()=>{ await window.hzAuth.logout(); });

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

  // Auto-reconnect MQTT si l’utilisateur l’avait activé
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
  S.masters = data || [];
  renderMasters();

  // Si déjà connecté MQTT → (ré)abonne finement chaque master + wildcard
  if(S.mqttReady){
    subscribeAllState();
    // "coup de klaxon" pour demander l'état
    requestStateAll();
  }
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
    card.innerHTML = `
      <div class="row" style="align-items:center; gap:12px;">
        <div>
          <div class="row" style="gap:8px; align-items:center;">
            <input class="rename input px-3 py-1.5 rounded-xl border border-slate-300 text-[15px]" value="${escapeHTML(m.name||"Master")}">
            <span class="mono text-xs muted">ID: ${m.master_id}</span>
            <span class="badge" data-badge="${m.master_id}">offline</span>
            <span class="badge ok hidden" data-saved="${m.master_id}">Sauvegardé ✓</span>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" data-scan="${m.master_id}">Scan</button>
        <button class="btn d" data-del="${m.master_id}">Supprimer</button>
      </div>
      <div class="muted" style="margin-top:8px">Mes appareils (via MQTT/evt)…</div>
    `;
    cont.appendChild(card);

    // Renommage Master (autosave 500ms, trim + défaut "Master")
    const inp   = card.querySelector(".rename");
    const flash = card.querySelector(`[data-saved="${m.master_id}"]`);
    let tRen = null;

    const doSave = async (val) =>{
      const clean = (val||"").trim() || "Master";
      if(inp.value !== clean) inp.value = clean;
      try{
        const { error } = await window.sb.from("masters").update({ name: clean }).eq("master_id", m.master_id);
        if(error) throw error;
        flash.classList.remove("hidden");
        setTimeout(()=> flash.classList.add("hidden"), 900);
        log("[DB] rename ->", m.master_id, clean);
      }catch(e){
        alert("Erreur renommage: " + (e.message||e));
      }
    };

    inp.addEventListener("input", ()=>{
      clearTimeout(tRen);
      tRen = setTimeout(()=> doSave(inp.value), 500);
    });
    inp.addEventListener("blur", ()=>{
      clearTimeout(tRen);
      doSave(inp.value);
    });

    // Supprimer l’association user↔master
    card.querySelector(`[data-del="${m.master_id}"]`).onclick = async ()=>{
      if(!confirm("Retirer ce master de ton compte ?")) return;
      await window.sb.from("masters").delete().eq("master_id", m.master_id);
      await loadMasters();
    };

    // Scan (exemple: commande MQTT)
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
  b.textContent = online ? "online" : "offline";
  b.className = "badge" + (online ? " ok" : "");
}

function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])) }

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
  btnDone  && (btnDone.onclick  = async ()=>{ dlg.close(); await loadMasters(); if(S.mqttReady){ subscribeAllState(); requestStateAll(); } });
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
function subscribeAllState(){
  // wildcard (si ACL l’autorise)
  subscribe("hizaya/+/state");
  // spécifique par master (si wildcard refusé)
  for(const m of S.masters){ subscribe(`hizaya/${m.master_id}/state`); }
}
function requestStateAll(){
  for(const m of S.masters){
    const t = `hizaya/${m.master_id}/cmd`;
    const msg = JSON.stringify({ cmd:"get_state" }); // à supporter côté Master (réponse: republie "online")
    try{ S.mqtt.publish(t, msg); log("[MQTT] ->", t, msg); }catch(_){}
  }
}

async function connectMQTT(){
  if(S.mqtt){ try{ S.mqtt.end(true); }catch(e){} S.mqtt=null; S.mqttReady=false; S.subs.clear(); }

  const { data:{ session } } = await window.sb.auth.getSession();
  if(!session) return alert("Connecte-toi d'abord.");

  // Récupère des credentials front (user_mqtt_creds) via Edge Function
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
    subscribeAllState();     // s’abonner aux états
    requestStateAll();       // demander explicitement un repost de l’état
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
  if(S.mqtt){ S.mqtt.end(true); S.mqtt=null; S.mqttReady=false; S.subs.clear(); log("[MQTT] disconnected"); }
  try { localStorage.removeItem(MQTT_REMEMBER_KEY); } catch(_) {}
}

/* ------------------------------- BOOT ------------------------------- */
document.addEventListener("DOMContentLoaded", initAuthUI);
