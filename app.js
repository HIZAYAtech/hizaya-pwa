/* HIZAYA – PWA sans MQTT : Realtime Supabase
   Tables lues: masters, master_states, peer_states
*/

const $ = (s)=>document.querySelector(s);
function log(...a){ const el=$("#log"); if(!el) return; el.textContent += a.join(" ")+"\n"; el.scrollTop = el.scrollHeight; }
function show(sel){ $(sel).classList.remove("hidden"); }
function hide(sel){ $(sel).classList.add("hidden"); }

const S = {
  session: null,
  masters: [],
  peersByMaster: new Map(), // master_id -> Map(mac, peer)
  channel: null,
  claimTimer: null
};

async function waitSupabase(maxMs = 3000) {
  const t0 = Date.now();
  while (!window.supabase && (Date.now() - t0) < maxMs) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (!window.supabase) throw new Error("Supabase non initialisé (supabase-auth.js manquant ?)");
}

// ---------- AUTH ----------
function initAuth(){
  window.addEventListener("supabase-auth", (e)=> updateSession(e.detail.session));

  $("#btnLogout")?.addEventListener("click", async ()=>{
    await window.hzAuth?.logout?.();
  });

  $("#btnPairMaster")?.addEventListener("click", createPairingCode);

  $("#btnClaimClose")?.addEventListener("click", closeClaimModal);
  $("#btnClaimDone")?.addEventListener("click", async ()=>{ closeClaimModal(); await loadMasters(); });

  // Session initiale
  window.supabase.auth.getSession().then(({data:{session}})=> updateSession(session));
}

async function updateSession(session){
  S.session = session || null;
  if(!S.session){
    $("#who").textContent = "Hors ligne";
    show("#page-login"); hide("#page-main");
    teardownRealtime();
    return;
  }
  $("#who").textContent = S.session.user.email || "Connecté";
  hide("#page-login"); show("#page-main");
  await loadMasters();
  setupRealtime(); // (ré)abonne après chargement
}

// ---------- DATA ----------
async function loadMasters(){
  const { data, error } = await supabase
    .from("masters")
    .select("master_id, name, created_at")
    .order("created_at", { ascending: false });
  if(error){ log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();
}

// ---------- REALTIME ----------
function teardownRealtime(){
  if(S.channel){ supabase.removeChannel(S.channel); S.channel=null; }
}
function setupRealtime(){
  teardownRealtime();
  S.channel = supabase.channel("realtime:states")
    .on("postgres_changes", { event: "*", schema: "public", table: "master_states" }, payload=>{
      const row = payload.new || payload.old;
      const mid = row.master_id;
      const online = payload.new ? !!payload.new.online : false;
      setOnline(mid, online);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "peer_states" }, payload=>{
      const r = payload.new || payload.old;
      upsertPeer(r.master_id, r);
    })
    .subscribe((status)=> log("[RT] status:", status));
}

// ---------- RENDER ----------
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

    const badge = `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700" data-badge="${m.master_id}"><span class="inline-block h-1.5 w-1.5 rounded-full bg-slate-400"></span>offline</span>`;

    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-[17px] font-semibold text-slate-900 flex items-center gap-2">
            <input class="rename px-3 py-1.5 rounded-xl border border-slate-300 text-[15px] text-slate-900" value="${m.name}">
            <span class="mono text-xs text-slate-500">ID: ${m.master_id}</span>
            ${badge}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-scan px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200">Scan</button>
          <button class="btn-del px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700">Supprimer</button>
        </div>
      </div>
      <div class="text-sm text-slate-600 mb-2">Mes appareils</div>
      <div class="divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden" data-peers="${m.master_id}">
        <div class="text-sm text-slate-500 p-3 empty-msg">Aucun peer pour l’instant…</div>
      </div>
    `;

    // rename master (autosave)
    card.querySelector(".rename").addEventListener("input", debounce(async ev=>{
      const name = ev.target.value.trim() || "Master";
      const { error } = await supabase.from("masters").update({ name }).eq("master_id", m.master_id);
      if(error) log("[DB] rename error:", error.message);
      else log("[DB] rename ->", m.master_id, name);
    }, 500));

    // delete master
    card.querySelector(".btn-del").onclick = async ()=>{
      if(!confirm("Supprimer ce master de ton compte ?")) return;
      await supabase.from("masters").delete().eq("master_id", m.master_id);
      await loadMasters();
    };

    // scan (placeholder; sera câblé via 'commands' étape 2)
    card.querySelector(".btn-scan").onclick = ()=>{
      alert("Scan sera géré par la file de commandes (étape 2).");
    };

    cont.appendChild(card);
  }
  // réinjecte les peers connus (si push_state a déjà tourné)
  for(const m of S.masters){
    const peers = S.peersByMaster.get(m.master_id);
    if(peers) renderPeers(m.master_id, [...peers.values()]);
  }
}

function setOnline(master_id, online){
  const b = document.querySelector(`[data-badge="${master_id}"]`);
  if(!b) return;
  b.className = `inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${online?"bg-green-100 text-green-700":"bg-slate-100 text-slate-700"}`;
  b.innerHTML = `<span class="inline-block h-1.5 w-1.5 rounded-full ${online?"bg-green-500":"bg-slate-400"}"></span>${online?"online":"offline"}`;
}

function upsertPeer(master_id, row){
  // row: {master_id, mac, name, link, pc_on, last_seen}
  const map = S.peersByMaster.get(master_id) || new Map();
  map.set(row.mac, row);
  S.peersByMaster.set(master_id, map);
  renderPeers(master_id, [...map.values()]);
}

function renderPeers(master_id, peers){
  const box = document.querySelector(`[data-peers="${master_id}"]`);
  if(!box) return;
  box.innerHTML = "";
  if(!peers.length){
    box.innerHTML = `<div class="text-sm text-slate-500 p-3 empty-msg">Aucun peer…</div>`;
    return;
  }
  for(const p of peers){
    const row = document.createElement("div");
    row.className = "p-3 sm:p-4 bg-white";
    row.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0">
          <input value="${p.name||"Device"}" class="peer-rename font-medium text-[15px] px-3 py-1.5 rounded-xl border border-slate-300 text-slate-900"/>
          <div class="text-xs text-slate-500 mono mt-1">${p.mac}</div>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-xs text-slate-600">Lien</span>
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${p.link?"bg-green-100 text-green-700":"bg-slate-100 text-slate-700"}">
            <span class="inline-block h-1.5 w-1.5 rounded-full ${p.link?"bg-green-500":"bg-slate-400"}"></span>
            ${p.link?"OK":"—"}
          </span>
          <span class="text-xs text-slate-600">PC</span>
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${p.pc_on?"bg-blue-100 text-blue-700":"bg-slate-100 text-slate-700"}">
            <span class="inline-block h-1.5 w-1.5 rounded-full ${p.pc_on?"bg-blue-500":"bg-slate-400"}"></span>
            ${p.pc_on?"ON":"OFF"}
          </span>
          <button class="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 peer-del">Supprimer</button>
        </div>
      </div>
    `;
    // rename peer (étape 2: via commands + push_state)
    row.querySelector(".peer-rename").addEventListener("change",(ev)=>{
      const name = ev.target.value.trim() || "Device";
      const m = S.peersByMaster.get(master_id); const cur = m?.get(p.mac);
      if(cur){ cur.name = name; m.set(p.mac, cur); }
      renderPeers(master_id, [...(S.peersByMaster.get(master_id)||new Map()).values()]);
      alert("Renommage final sera câblé via 'commands' + push_state (étape 2).");
    });
    row.querySelector(".peer-del").onclick = ()=>{
      alert("Suppression peer passera par 'commands' (étape 2).");
    };

    box.appendChild(row);
  }
}

// ---------- Pairing (code 6 chiffres) ----------
const FN_CREATE_CLAIM = "https://ctjljqmxjnfykskfgral.supabase.co/functions/v1/create_claim"; // si dispo

async function createPairingCode(){
  if(!S.session) return alert("Connecte-toi d'abord.");
  try{
    const res = await fetch(FN_CREATE_CLAIM, { method:"POST", headers:{ Authorization:`Bearer ${S.session.access_token}` }});
    if(!res.ok) throw new Error(await res.text());
    const { code, expires_at } = await res.json();
    showClaimModal(code, expires_at);
  }catch(e){
    console.warn("create_claim indisponible:", e.message);
    alert("Pour l’instant, saisis le code directement dans le portail du Master.");
  }
}

function showClaimModal(code, expiresAt){
  $("#claimCode").textContent = code;
  $("#modalClaim").classList.remove("hidden");
  clearInterval(S.claimTimer);
  const refresh=()=>{
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now())/1000));
    $("#claimTimer").textContent = s+"s";
    if(s<=0) clearInterval(S.claimTimer);
  };
  refresh(); S.claimTimer = setInterval(refresh, 1000);
}
function closeClaimModal(){
  $("#modalClaim").classList.add("hidden");
  clearInterval(S.claimTimer);
}

// ---------- Utils ----------
function debounce(fn, d=300){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), d); }; }

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async ()=>{
  try{
    await waitSupabase();
    initAuth();
  }catch(e){
    console.error(e);
    alert("Erreur d'initialisation: "+e.message);
  }
});
