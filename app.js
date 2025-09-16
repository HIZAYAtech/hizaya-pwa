// app.js — PWA (UI + DB + Pairing)

const S = { session: null, masters: [] };
const log = (...a) => { const el = document.getElementById("log"); if (el) { el.textContent += a.join(" ") + "\n"; el.scrollTop = el.scrollHeight; } };
const $  = (s) => document.querySelector(s);
const show = (sel) => $(sel)?.classList.remove("hidden");
const hide = (sel) => $(sel)?.classList.add("hidden");

// --------------------- AUTH INIT ---------------------
async function initAuth() {
  // écouter les évènements envoyés par supabase-auth.js
  window.addEventListener("supabase-auth", (e) => {
    const { session } = e.detail || {};
    updateSession(session);
  });

  // Boutons
  $("#btnGoogle")?.addEventListener("click", () => window.hzAuth?.loginWithGoogle());
  $("#btnLogout")?.addEventListener("click", async () => { await window.hzAuth?.logout(); });

  // Si supabase est déjà prêt (il l’est car supabase-auth.js s’exécute avant), on récupère la session
  try {
    const { data: { session } } = await window.supabase.auth.getSession();
    updateSession(session);
  } catch (e) {
    console.error("Erreur d'initialisation: Supabase non initialisé (supabase-auth.js manquant ?)");
  }

  // Brancher les actions UI “masters”
  wireMasterUI();
}

// --------------------- SESSION -----------------------
async function updateSession(session) {
  S.session = session || null;
  if (!S.session) {
    $("#who").textContent = "Hors ligne";
    show("#page-login"); hide("#page-main");
    return;
  }
  $("#who").textContent = S.session.user.email || "Connecté";
  hide("#page-login"); show("#page-main");
  await loadMasters();
}

// --------------------- MASTERS -----------------------
async function loadMasters() {
  // Table: masters (master_id, name, created_at)
  const { data, error } = await window.supabase
    .from("masters")
    .select("master_id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) { log("[DB] masters error:", error.message); return; }
  S.masters = data || [];
  renderMasters();
}

function renderMasters() {
  const cont = $("#masters");
  cont.innerHTML = "";
  if (!S.masters.length) {
    cont.innerHTML = `<div class="text-sm text-slate-600">Aucun master. Clique “Lier un Master”.</div>`;
    return;
  }
  for (const m of S.masters) cont.appendChild(renderMasterCard(m));
}

function renderMasterCard(m) {
  const el = document.createElement("div");
  el.className = "bg-white border border-slate-200 rounded-3xl shadow-sm p-4";
  el.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[17px] font-semibold text-slate-900 flex items-center gap-2">
          <input class="rename input px-3 py-1.5 rounded-xl border border-slate-300 text-[15px]" value="${m.name}">
          <span class="mono text-xs text-slate-500">ID: ${m.master_id}</span>
          <span class="badge inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">offline</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-scan px-3 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200">Scan</button>
        <button class="btn-del px-3 py-2 rounded-2xl bg-red-600 text-white hover:bg-red-700">Supprimer</button>
      </div>
    </div>
    <div class="text-sm text-slate-600">Mes appareils (via EVT)… (à implémenter plus tard avec l’ESP).</div>
  `;

  // Rename (autosave 500 ms)
  let t = null;
  el.querySelector(".rename").addEventListener("input", (ev) => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const name = ev.target.value.trim() || "Master";
      await window.supabase.from("masters").update({ name }).eq("master_id", m.master_id);
      log("[DB] rename ->", m.master_id, name);
    }, 500);
  });

  // Delete
  el.querySelector(".btn-del").onclick = async () => {
    if (!confirm("Supprimer ce master de ton compte ?")) return;
    await window.supabase.from("masters").delete().eq("master_id", m.master_id);
    await loadMasters();
  };

  // Scan (pour l’instant: log seulement)
  el.querySelector(".btn-scan").onclick = () => {
    log("[SCAN] demandé pour", m.master_id);
  };

  return el;
}

// ------------------- PAIRING (claim) -------------------
let _claimCountdown = null;

function _showModal() { $("#modalClaim")?.classList.remove("hidden"); }
function _hideModal() { $("#modalClaim")?.classList.add("hidden"); }
function _setClaimCode(txt) { const el = $("#claimCode"); if (el) el.textContent = txt; }
function _setClaimTimer(txt) { const el = $("#claimTimer"); if (el) el.textContent = txt; }
function _setClaimError(msg) {
  let el = $("#claimErr");
  if (!el) {
    const host = document.querySelector("#modalClaim .p-5");
    el = document.createElement("div");
    el.id = "claimErr";
    el.className = "mt-2 text-sm text-red-600";
    host?.insertBefore(el, host.firstChild);
  }
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

async function createPairingCode() {
  _setClaimError(""); _setClaimCode("……"); _setClaimTimer("…"); _showModal();
  try {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) throw new Error("Non connecté");

    const base = window.__SUPABASE_URL__ || "https://ctjljqmxjnfykskfgral.supabase.co";
    const url  = `${base}/functions/v1/create_claim`;

    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    const raw = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${raw}`);

    const { code, expires_at } = JSON.parse(raw || "{}");
    if (!code || !expires_at) throw new Error("Réponse invalide de create_claim");

    _setClaimCode(String(code).padStart(6, "0"));
    _startClaimTimer(expires_at);
  } catch (e) {
    _setClaimCode("— — — — — —");
    _setClaimError(`Erreur create_claim : ${e.message}`);
    log("[claim] error:", e.message);
  }
}

function _startClaimTimer(expiresAt) {
  clearInterval(_claimCountdown);
  function tick() {
    const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    _setClaimTimer(`${s}s`);
    if (s <= 0) clearInterval(_claimCountdown);
  }
  tick();
  _claimCountdown = setInterval(tick, 1000);
}
function closeClaimModal() { clearInterval(_claimCountdown); _hideModal(); }

// Brancher les boutons (page principale)
function wireMasterUI() {
  $("#btnPairMaster")?.addEventListener("click", createPairingCode);
  $("#btnClaimClose")?.addEventListener("click", closeClaimModal);
  $("#btnClaimDone")?.addEventListener("click", async () => { closeClaimModal(); await loadMasters(); });
}

// ---------------------- BOOT -------------------------
document.addEventListener("DOMContentLoaded", initAuth);
