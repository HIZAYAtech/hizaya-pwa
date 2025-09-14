// app.js — bascule login/main et logs utiles

const $  = (s) => document.querySelector(s);
const log = (...a) => { const el=$("#log"); if(!el) return; el.textContent += a.join(" ")+"\n"; el.scrollTop = el.scrollHeight; };

async function waitSupabase(maxMs = 5000) {
  const t0 = Date.now();
  while (!window.supabase && (Date.now() - t0) < maxMs) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (!window.supabase) {
    const why = window.__SUPABASE_BOOT_ERROR__ ? ` (${window.__SUPABASE_BOOT_ERROR__})` : "";
    throw new Error("Supabase non initialisé (supabase-auth.js manquant ?)" + why);
  }
}

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

async function initApp(){
  console.log("[app] init…");
  await waitSupabase();
  console.log("[app] supabase OK");

  window.addEventListener("supabase-auth", (e)=>{
    const session = e.detail?.session || null;
    console.log("[app] event session:", !!session);
    applySession(session);
  });

  const { data:{ session } } = await window.supabase.auth.getSession();
  console.log("[app] initial session:", !!session);
  applySession(session);

  $("#btnLogout")?.addEventListener("click", async ()=>{
    try { await window.hzAuth?.logout?.(); } catch(e){ console.error(e); }
  });

  $("#btnPairMaster")?.addEventListener("click", ()=>{
    $("#claimCode").textContent = "------";
    $("#claimTimer").textContent = "…";
    $("#modalClaim").classList.remove("hidden");
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
