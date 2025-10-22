import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CONFIG SUPABASE (Vite)
   ========================= */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = createClient(SUPABASE_URL, SUPA_ANON_KEY);

/* =========================
   CONSTANTES UI / LOGIQUE
   ========================= */
const DEFAULT_IO_PIN = 26;             // pin par défaut pour l’impulsion IO du SLAVE
const LIVE_TTL_MS    = 25_000;         // seuil "en ligne" basé sur last_seen

/* =========================
   STYLES (simples et lisibles)
   ========================= */
const styles = `
:root{
  --bg:#0b101b; --panel:#141b29; --card:#1a2233; --chip:#263247; --muted:#9fb0c6;
  --fg:#e7eefb; --ok:#16a34a; --ko:#ef4444; --warn:#f59e0b; --accent:#2dd4bf;
  --stroke:#263247; --btn:#222b3d; --btn-h:#2a3550;
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Roboto,Arial}
a{color:var(--accent);text-decoration:none}
header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;background:var(--panel);border-bottom:1px solid var(--stroke)}
h1{margin:0;font-size:18px;letter-spacing:.5px}
.small{font-size:12px;color:var(--muted)}
.btn{background:var(--btn);border:1px solid var(--stroke);color:var(--fg);padding:8px 12px;border-radius:10px;cursor:pointer}
.btn:hover{background:var(--btn-h)}
.btn.primary{background:#2563eb;border-color:#1d4ed8}
.btn.danger{background:#7f1d1d;border-color:#991b1b}
.btn.ghost{background:transparent;border-color:var(--stroke)}
.badge{font-size:12px;border:1px solid var(--stroke);padding:3px 8px;border-radius:999px}
.badge.ok{background:#0b3b2e;color:#86efac;border-color:#14532d}
.badge.ko{background:#3b1a1a;color:#fecaca;border-color:#7f1d1d}

main{max-width:1200px;margin:24px auto;padding:0 16px;display:flex;gap:16px;flex-direction:column}
.master{background:var(--card);border:1px solid var(--stroke);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:14px}
.masterHead{display:flex;justify-content:space-between;align-items:center;gap:10px}
.masterTitle{display:flex;align-items:center;gap:10px}
.slaveGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.slaveCard{background:#202a3e;border:1px solid var(--stroke);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px}
.slaveHead{display:flex;justify-content:space-between;align-items:center}
.slaveKnob{width:96px;height:96px;border-radius:50%;border:4px solid #3a4a68;display:flex;align-items:center;justify-content:center;margin:6px auto 2px;position:relative;overflow:hidden;background:#111827}
.slaveKnob img{width:100%;height:100%;object-fit:cover}
.slaveLed{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;background:#1f2937;border:2px solid #0f172a}
.slaveActions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.pill{background:var(--chip);border:1px solid var(--stroke);border-radius:999px;padding:2px 8px;color:var(--fg);font-size:12px;display:inline-flex;align-items:center;gap:6px}
.pill .mac{font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; max-width:150px; overflow:hidden; text-overflow:ellipsis;}
.icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1e293b}
.tileAdd{background:#1f2739;border:1px dashed #334155;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#9fb0c6;min-height:160px}
.tileAdd:hover{background:#232f45}
.hr{height:1px;background:var(--stroke);margin:6px 0}
.cmdTitle{color:var(--muted);font-size:12px}
.cmdList{margin:0;padding-left:18px;max-height:160px;overflow:auto}
.log{white-space:pre-wrap;background:#0b1220;border:1px solid var(--stroke);border-radius:12px;padding:10px;height:160px;overflow:auto}
.row{display:flex;gap:10px;align-items:center}
.right{margin-left:auto}
.tiny{font-size:12px;padding:5px 8px;border-radius:8px}
`;

/* =========================
   HELPERS
   ========================= */
const fmtTS  = (s) => (s ? new Date(s).toLocaleString() : "—");
const isLive = (d) => d.last_seen && Date.now() - new Date(d.last_seen) < LIVE_TTL_MS;

/* Redimensionne l’image côté client pour upload rapide */
async function resizeImage(file, maxSize = 512, mime = "image/jpeg", quality = 0.85) {
  const img = await new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: mime });
}

/* Upload dans Storage (bucket public) et récup URL publique */
async function uploadSlavePhoto(masterId, slaveMac, file) {
  const resized = await resizeImage(file);
  const path = `master/${masterId}/${slaveMac}.jpg`;

  const { error: upErr } = await sb.storage
    .from("slave-photos")
    .upload(path, resized, {
      upsert: true,
      contentType: resized.type,
      cacheControl: "3600",
    });

  if (upErr) throw upErr;

  const { data } = sb.storage.from("slave-photos").getPublicUrl(path);
  return data.publicUrl; // pour bucket public
}

/* =========================
   APP
   ========================= */
export default function App() {
  /* ---- State ---- */
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [nodesByMaster, setNodesByMaster] = useState({});
  const [pair, setPair] = useState({ open: false, code: null, expires_at: null });

  // cache local des URLs photo : { [masterId]: { [mac]: url } }
  const [photoUrls, setPhotoUrls] = useState({});

  // log
  const [lines, setLines] = useState([]);
  const logRef = useRef(null);
  const log = (t) => setLines((ls) => [...ls, `${new Date().toLocaleTimeString()}  ${t}`]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  // refs listes de commandes par master
  const cmdLists = useRef(new Map());
  function upsertCmdRow(masterId, c) {
    const ul = cmdLists.current.get(masterId);
    if (!ul) return;
    const id = `cmd-${c.id}`;
    const html = `<code>${c.status}</code> · ${c.action}${
      c.target_mac ? " → " + c.target_mac : " (local)"
    } <span class="small">· ${fmtTS(c.created_at)}</span>`;
    let li = ul.querySelector(`#${CSS.escape(id)}`);
    if (!li) {
      li = document.createElement("li");
      li.id = id;
      li.innerHTML = html;
      ul.prepend(li);
      while (ul.children.length > 20) ul.removeChild(ul.lastChild);
    } else {
      li.innerHTML = html;
    }
  }

  /* ---- Auth bootstrap ---- */
  useEffect(() => {
    const sub = sb.auth.onAuthStateChange((ev, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        attachRealtime();
        loadAll();
      } else {
        cleanupRealtime();
        setDevices([]);
        setNodesByMaster({});
      }
    });
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) {
        attachRealtime();
        loadAll();
      }
    })();
    return () => sub.data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Realtime ---- */
  const chDevices = useRef(null), chNodes = useRef(null), chCmds = useRef(null);

  function cleanupRealtime() {
    if (chDevices.current) sb.removeChannel(chDevices.current);
    if (chNodes.current) sb.removeChannel(chNodes.current);
    if (chCmds.current) sb.removeChannel(chCmds.current);
    chDevices.current = chNodes.current = chCmds.current = null;
  }

  function attachRealtime() {
    cleanupRealtime();

    chDevices.current = sb
      .channel("rt:devices")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "devices" }, (p) => {
        log(`+ device ${p.new.id}`);
        setDevices((ds) => [p.new, ...ds]);
        refreshCommands(p.new.id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "devices" }, (p) => {
        const d = p.new;
        setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, ...d } : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "devices" }, (p) => {
        log(`- device ${p.old.id}`);
        setDevices((ds) => ds.filter((x) => x.id !== p.old.id));
      })
      .subscribe();

    chNodes.current = sb
      .channel("rt:nodes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nodes" }, (p) => {
        log(`+ node ${p.new.slave_mac} → ${p.new.master_id}`);
        refreshSlavesFor(p.new.master_id);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "nodes" }, (p) => {
        log(`- node ${p.old.slave_mac} ← ${p.old.master_id}`);
        refreshSlavesFor(p.old.master_id);
      })
      .subscribe();

    chCmds.current = sb
      .channel("rt:commands")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commands" }, (p) => {
        upsertCmdRow(p.new.master_id, p.new);
        log(`cmd + ${p.new.action} (${p.new.status}) → ${p.new.master_id}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "commands" }, (p) => {
        upsertCmdRow(p.new.master_id, p.new);
        log(`cmd ~ ${p.new.action} (${p.new.status}) → ${p.new.master_id}`);
      })
      .subscribe();
  }

  /* ---- Queries ---- */
  async function loadAll() {
    const { data: devs, error: ed } = await sb
      .from("devices")
      .select("id,name,master_mac,last_seen,online")
      .order("created_at", { ascending: false });
    if (ed) {
      log("Err devices: " + ed.message);
      return;
    }
    setDevices(devs || []);

    // Essaye de charger la colonne photo_url (si elle existe)
    let nodes = null;
    let withPhoto = true;
    let en = null;

    {
      const r = await sb.from("nodes").select("master_id,slave_mac,photo_url");
      nodes = r.data;
      en = r.error;
      if (en) {
        // la colonne n’existe probablement pas : on retente sans
        withPhoto = false;
        const r2 = await sb.from("nodes").select("master_id,slave_mac");
        nodes = r2.data || [];
        // pas de log d’erreur ici, on tolère
      }
    }

    const map = {};
    const photos = {};
    (nodes || []).forEach((n) => {
      (map[n.master_id] ??= []).push(n.slave_mac);
      if (withPhoto && n.photo_url) {
        (photos[n.master_id] ??= {})[n.slave_mac] = n.photo_url;
      }
    });
    setNodesByMaster(map);
    if (Object.keys(photos).length) setPhotoUrls((p) => ({ ...p, ...photos }));

    for (const d of devs || []) await refreshCommands(d.id);
  }

  async function refreshCommands(mid) {
    const { data, error } = await sb
      .from("commands")
      .select("id,action,target_mac,status,created_at")
      .eq("master_id", mid)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      log("Err cmds: " + error.message);
      return;
    }
    const ul = cmdLists.current.get(mid);
    if (!ul) return;
    ul.innerHTML = "";
    (data || []).forEach((c) => upsertCmdRow(mid, c));
  }

  async function refreshSlavesFor(mid) {
    // même stratégie : tente photo_url puis fallback
    let data = null;
    let withPhoto = true;
    {
      const r = await sb.from("nodes").select("slave_mac,photo_url").eq("master_id", mid);
      if (r.error) {
        withPhoto = false;
        const r2 = await sb.from("nodes").select("slave_mac").eq("master_id", mid);
        data = r2.data || [];
      } else {
        data = r.data || [];
      }
    }

    setNodesByMaster((m) => ({ ...m, [mid]: data.map((x) => x.slave_mac) }));
    if (withPhoto) {
      const photos = {};
      data.forEach((x) => {
        if (x.photo_url) (photos[mid] ??= {})[x.slave_mac] = x.photo_url;
      });
      if (Object.keys(photos).length) setPhotoUrls((p) => ({ ...p, ...photos }));
    }
  }

  /* ---- Commandes ---- */
  async function sendCmd(mid, mac, action, payload = {}) {
    const { error } = await sb
      .from("commands")
      .insert({ master_id: mid, target_mac: mac || null, action, payload });
    if (error) log("cmd err: " + error.message);
    else log(`[cmd] ${action} → ${mid}${mac ? " ▶ " + mac : ""}`);
  }

  async function renameMaster(id) {
    const name = prompt("Nouveau nom du master ?", "");
    if (!name) return;
    const { error } = await sb.from("devices").update({ name }).eq("id", id);
    if (error) alert(error.message);
    else log(`Renommé ${id} → ${name}`);
  }

  async function deleteDevice(id) {
    if (!confirm(`Supprimer ${id} ?`)) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      alert("Non connecté");
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/release_and_delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPA_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ master_id: id }),
    });
    log(r.ok ? `MASTER supprimé : ${id}` : `❌ Suppression : ${await r.text()}`);
  }

  async function openPairDialog() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      alert("Non connecté");
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create_pair_code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPA_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ttl_minutes: 10 }),
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    const { code, expires_at } = await r.json();
    setPair({ open: true, code, expires_at });
    log(`Pair-code ${code}`);
  }

  /* ---- Photo : handler de sélection / upload ---- */
  async function handlePickPhoto(masterId, slaveMac, file) {
    try {
      const url = await uploadSlavePhoto(masterId, slaveMac, file);
      // maj cache local
      setPhotoUrls((p) => ({
        ...p,
        [masterId]: { ...(p[masterId] || {}), [slaveMac]: url },
      }));
      // tente de persister en base si la colonne existe
      const r = await sb
        .from("nodes")
        .update({ photo_url: url })
        .eq("master_id", masterId)
        .eq("slave_mac", slaveMac);
      if (r.error && !/column.*photo_url/i.test(r.error.message)) {
        // s'il y a une autre erreur que "colonne inconnue", on la montre
        console.warn("update photo_url:", r.error.message);
      }
      log(`Photo mise à jour pour ${slaveMac}`);
    } catch (e) {
      console.error(e);
      alert("Upload photo : " + (e?.message || e));
    }
  }

  /* ---- UI : auth controls ---- */
  const UserControls = (
    <div className="row">
      <span className="small">{user?.email || "non connecté"}</span>
      {!user ? (
        <button
          className="btn primary"
          onClick={async () => {
            const { data, error } = await sb.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: location.href,
                queryParams: { prompt: "select_account" },
              },
            });
            if (error) alert(error.message);
            else if (data?.url) location.href = data.url;
          }}
        >
          CONNEXION GOOGLE
        </button>
      ) : (
        <button className="btn" onClick={() => sb.auth.signOut()}>
          DECONNEXION
        </button>
      )}
    </div>
  );

  /* ---- Rendu ---- */
  return (
    <>
      <style>{styles}</style>

      <header>
        <h1>REMOTE POWER</h1>
        {UserControls}
      </header>

      <main>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small">Compte : {user?.email || "—"}</span>
          <div className="row">
            <button className="btn primary" onClick={openPairDialog}>
              Ajouter un MASTER
            </button>
            <button className="btn" onClick={loadAll}>
              Rafraîchir
            </button>
          </div>
        </div>

        {devices.map((d) => {
          const live = isLive(d);
          const slaves = nodesByMaster[d.id] || [];
          const photos = photoUrls[d.id] || {};
          return (
            <section className="master" key={d.id}>
              <div className="masterHead">
                <div className="masterTitle">
                  <strong style={{ fontSize: 16 }}>MASTER</strong>
                  <span className={`badge ${live ? "ok" : "ko"}`}>
                    {live ? "EN LIGNE" : "HORS LIGNE"}
                  </span>
                </div>
                <div className="row">
                  <button className="btn tiny" onClick={() => renameMaster(d.id)}>
                    RENOMMER
                  </button>
                  <button className="btn tiny danger" onClick={() => deleteDevice(d.id)}>
                    SUPPRIMER
                  </button>
                </div>
              </div>

              <div className="small" style={{ opacity: 0.85 }}>
                ID : <code>{d.id}</code> &nbsp;•&nbsp; MAC :{" "}
                <code>{d.master_mac || "—"}</code> &nbsp;•&nbsp; Dernier contact :{" "}
                {fmtTS(d.last_seen) || "jamais"}
              </div>

              <div className="slaveGrid">
                {slaves.map((mac) => (
                  <article className="slaveCard" key={mac}>
                    <div className="slaveHead">
                      <div className="row" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>SLAVE</span>
                        <span className="pill">
                          <span className="icon">⚙️</span>
                          <span className="mac" title={mac}>{mac}</span>
                        </span>
                      </div>
                    </div>

                    {/* PHOTO + PICKER */}
                    <div className="slaveKnob">
                      {photos[mac] ? (
                        <img src={photos[mac]} alt="Slave" />
                      ) : (
                        <span style={{ fontSize: 11, opacity: 0.8 }}>PHOTO</span>
                      )}

                      <input
                        id={`pick-${d.id}-${mac}`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePickPhoto(d.id, mac, file);
                          e.target.value = "";
                        }}
                      />
                      <button
                        className="btn tiny"
                        style={{
                          position: "absolute",
                          bottom: -6,
                          left: "50%",
                          transform: "translateX(-50%)",
                        }}
                        onClick={() =>
                          document.getElementById(`pick-${d.id}-${mac}`).click()
                        }
                        title="Changer la photo"
                      >
                        Changer
                      </button>

                      {/* LED témoin clic IO */}
                      <span className="slaveLed" id={`led-${mac}`}></span>
                    </div>

                    {/* Commande impulsion IO */}
                    <div className="row" style={{ justifyContent: "center" }}>
                      <button
                        className="btn"
                        onClick={() => {
                          sendCmd(d.id, mac, "SLV_IO", {
                            pin: DEFAULT_IO_PIN,
                            mode: "OUT",
                            value: 1,
                          });
                          const led = document.getElementById(`led-${mac}`);
                          if (led) {
                            led.style.background = "#16a34a";
                            setTimeout(() => (led.style.background = "#1f2937"), 600);
                          }
                        }}
                        title="IO ON"
                      >
                        ⏻
                      </button>
                    </div>

                    {/* Actions SLAVE */}
                    <div className="slaveActions">
                      <button
                        className="btn tiny"
                        onClick={() => sendCmd(d.id, mac, "SLV_RESET", {})}
                      >
                        RESET
                      </button>
                      <button
                        className="btn tiny"
                        onClick={() =>
                          sendCmd(d.id, mac, "SLV_IO", {
                            pin: DEFAULT_IO_PIN,
                            mode: "OUT",
                            value: 0,
                          })
                        }
                      >
                        OFF
                      </button>
                      <button
                        className="btn tiny"
                        style={{ background: "#7c2d12" }}
                        onClick={() => sendCmd(d.id, mac, "SLV_FORCE_OFF", {})}
                      >
                        HARD STOP
                      </button>
                      <button
                        className="btn tiny"
                        style={{ background: "#7f1d1d" }}
                        onClick={() => sendCmd(d.id, mac, "SLV_HARD_RESET", { ms: 3000 })}
                      >
                        HARD RESET
                      </button>
                    </div>
                  </article>
                ))}

                {/* tuile d’ajout (visuelle) */}
                <div className="tileAdd" title="Ajouter un SLAVE">
                  <div style={{ fontSize: 36, lineHeight: 1 }}>＋</div>
                  <div className="small">Ajouter un SLAVE</div>
                </div>
              </div>

              <div className="hr" />

              {/* Actions Master */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn tiny" onClick={() => sendCmd(d.id, null, "PULSE", { ms: 500 })}>
                  Pulse 500 ms
                </button>
                <button className="btn tiny" onClick={() => sendCmd(d.id, null, "POWER_ON", {})}>
                  Power ON
                </button>
                <button className="btn tiny" onClick={() => sendCmd(d.id, null, "POWER_OFF", {})}>
                  Power OFF
                </button>
                <button className="btn tiny" onClick={() => sendCmd(d.id, null, "RESET", {})}>
                  Reset
                </button>
                <span className="right small">
                  Nom : <strong>{d.name || d.id}</strong>
                </span>
              </div>

              <div className="hr" />
              <div className="cmdTitle">Commandes (20 dernières)</div>
              <ul className="cmdList" ref={(el) => { if (el) cmdLists.current.set(d.id, el); }} />
            </section>
          );
        })}

        {/* Journal global */}
        <div>
          <h3 style={{ margin: "8px 0" }}>Journal</h3>
          <div className="log" ref={logRef}>{lines.join("\n")}</div>
        </div>
      </main>

      {/* Dialog pair-code */}
      {pair.open && (
        <dialog open onClose={() => setPair({ open: false, code: null, expires_at: null })}>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <h3>Appairer un MASTER</h3>
            <div>
              Code : <code>{String(pair.code).padStart(6, "0")}</code>
              {" "} (expire <span className="small">
                {(() => {
                  const end = pair.expires_at ? new Date(pair.expires_at).getTime() : 0;
                  const l = Math.max(0, Math.floor((end - Date.now()) / 1000));
                  return `${Math.floor(l / 60)}:${String(l % 60).padStart(2, "0")}`;
                })()}
              </span>)
            </div>
            <div className="small">Saisis ce code dans le portail Wi-Fi de l’ESP32.</div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setPair({ open: false, code: null, expires_at: null })}>
                Fermer
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
