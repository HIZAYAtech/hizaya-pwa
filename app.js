// app.js — UI minimale: bascule login/main et hooks de base

const $  = (s) => document.querySelector(s);
const log = (...a) => { const el=$("#log"); if(!el) return; el.textContent += a.join(" ")+"\n"; el.scrollTop = el.scrollHeight; };

// Attendre que supabase (injecté par supabase-auth.js) soit prêt
async function waitSupabase(maxMs = 3000) {
  const t0 = Date.now();
  while (!window.supabase && (Date.now() - t0) < maxMs) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (!window.supabase) throw new Error("Supabase non initialisé (supabase-auth.js manquant ?)");
}

// UI helpers
function show(sel){ $(sel).classList.remove("hidden"); }
function hide(sel){ $(sel).classList.add("hidden"); }

function applySession(session){
  if (!session) {
    $("#who").textContent = "Hors ligne";
    show("#page-login"); hide("#page-main");
  } else {
    $("#who").textContent = session.user?.email || "Connecté";
    hide("#page-login"); show("#page-main");
  }
}

// Init général
async function initApp(){
  await waitSupabase();

  // Écoute les changements d’auth (événement dispatché par supabase-auth.js)
  window.addEventListener("supabase-auth", (e)=>{
    const session = e.detail?.session || null;
    applySession(session);
  });

  // État initial (au cas où)
  const { data:{ session } } = await window.supabase.auth.getSession();
  applySession(session);

  // Bouton Déconnexion
  $("#btnLogout")?.addEventListener("click", async ()=>{
    try { await window.hzAuth?.logout?.(); } catch(e){ console.error(e); }
  });

  // Boutons modale “Lier un Master” (UI seulement)
  $("#btnPairMaster")?.addEventListener("click", ()=>{
    $("#claimCode").textContent = "------";
    $("#claimTimer").textContent = "…";
    $("#modalClaim").classList.remove("hidden");
    // ici tu peux appeler ton Edge Function create_claim si tu veux
    log("[UI] Ouverture modale d’appairage");
  });
  $("#btnClaimClose")?.addEventListener("click", ()=> $("#modalClaim").classList.add("hidden"));
  $("#btnClaimDone")?.addEventListener("click", ()=>{
    $("#modalClaim").classList.add("hidden");
    log("[UI] Appairage confirmé (côté UI)");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initApp().catch(e=>{
    console.error(e);
    alert("Erreur d'initialisation: " + e.message);
  });
});
