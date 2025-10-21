// app.js — Masters/Peers UI (lecture sécurisée + Realtime + Edge Functions)
// Prérequis:
// - Tables: masters(master_id, user_id, name, created_at), master_states, peer_states (RLS comme ton SQL)
// - Edge Functions: ms_upsert, ps_upsert, rotate_device_key (noms libres; adapte si besoin)
// - Auth Google via supabase-auth.js (computeRedirectUrl gère GitHub Pages)

import { supabase, signInWithGoogle, signOut } from './supabase-auth.js';

const $  = (id) => document.getElementById(id);
const qs = (sel, root=document) => root.querySelector(sel);

const authBox   = $('auth');
const authedBox = $('authed');
const statusEl  = $('status');
const whoEl     = $('who');

// Containers dynamiques (injection si absents)
let uiInjected = false;
function ensureUI() {
  if (uiInjected) return;
  if (!authedBox) return;
  const wrap = document.createElement('div');
  wrap.id = 'ui-mp';
  wrap.innerHTML = `
    <h2>Mes Masters</h2>
    <div class="row" style="grid-template-columns:1fr auto; align-items:end;">
      <div>
        <label for="master-select">Sélection</label>
        <select id="master-select"><option value="">— choisissez un master —</option></select>
      </div>
      <div>
        <button id="btn-refresh" class="secondary">Rafraîchir</button>
      </div>
    </div>

    <table id="masters-table" style="margin-top:12px">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Master ID</th>
          <th>Online</th>
          <th>Dernier contact</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="masters-rows"><tr><td colspan="5" class="muted">Chargement…</td></tr></tbody>
    </table>

    <h2 style="margin-top:24px">Peers du master sélectionné</h2>
    <table id="peers-table">
      <thead>
        <tr>
          <th>MAC</th>
          <th>Nom</th>
          <th>Liaison</th>
          <th>PC allumé</th>
          <th>Dernier contact</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="peers-rows"><tr><td colspan="6" class="muted">Aucun master sélectionné</td></tr></tbody>
    </table>
  `;
  authedBox.appendChild(wrap);
  uiInjected = true;
}

// State
const S = {
  user: null,
  masters: [],
  masterStates: new Map(),      // master_id -> {online,last_seen}
  peersByMaster: new Map(),     // master_id -> Array<peer_state>
  selectedMasterId: '',
  rtChannel: null,
};

// Auth
$('btn-login')?.addEventListener('click', async () => {
  try { await signInWithGoogle(); } catch (e) { alert('Login impossible: ' + e.message); }
});
$('btn-logout')?.addEventListener('click', async () => { await signOut(); });

supabase.auth.onAuthStateChange(async (_event, session) => {
  const user = session?.user || null;
  if (user) {
    S.user = user;
    statusEl && (statusEl.textContent = 'Connecté.');
    whoEl && (whoEl.textContent = user.email || user.user_metadata?.name || user.id);
    authBox?.classList.add('hidden');
    authedBox?.classList.remove('hidden');
    ensureUI();
    await refreshAll();
    subscribeRealtime();
  } else {
    S.user = null;
    statusEl && (statusEl.textContent = 'Déconnecté.');
    whoEl && (whoEl.textContent = '');
    authBox?.classList.remove('hidden');
    authedBox?.classList.add('hidden');
    unsubscribeRealtime();
  }
});

// Au chargement
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    S.user = session.user;
    statusEl && (statusEl.textContent = 'Connecté.');
    whoEl && (whoEl.textContent = session.user.email || session.user.id);
    authBox?.classList.add('hidden');
    authedBox?.classList.remove('hidden');
    ensureUI();
    await refreshAll();
    subscribeRealtime();
  }
})();

// Refresh global
$('btn-refresh')?.addEventListener('click', async () => {
  await refreshAll();
});

async function refreshAll() {
  if (!S.user) return;
  try {
    await fetchMasters();
    const ids = S.masters.map(m => m.master_id);
    await Promise.all([
      fetchMasterStates(ids),
      fetchPeerStates(ids)
    ]);
    renderMasters();
    renderPeers();
  } catch (e) {
    console.error(e);
  }
}

// Data fetchers
async function fetchMasters() {
  const { data, error } = await supabase
    .from('masters')
    .select('master_id, name, created_at')
    .eq('user_id', S.user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  S.masters = data || [];
  // Build select options
  const sel = $('master-select');
  if (sel) {
    const current = S.selectedMasterId;
    sel.innerHTML = '<option value="">— choisissez un master —</option>' +
      S.masters.map(m => `<option value="${escapeHtml(m.master_id)}">${escapeHtml(m.name || m.master_id)}</option>`).join('');
    if (current) sel.value = current;
    sel.onchange = () => {
      S.selectedMasterId = sel.value;
      renderPeers();
    };
  }
}

async function fetchMasterStates(masterIds) {
  S.masterStates.clear();
  if (!masterIds.length) return;
  const { data, error } = await supabase
    .from('master_states')
    .select('*')
    .in('master_id', masterIds);
  if (error) throw error;
  (data || []).forEach(st => {
    S.masterStates.set(st.master_id, st);
  });
}

async function fetchPeerStates(masterIds) {
  S.peersByMaster.clear();
  if (!masterIds.length) return;
  const { data, error } = await supabase
    .from('peer_states')
    .select('*')
    .in('master_id', masterIds);
  if (error) throw error;
  (data || []).forEach(p => {
    if (!S.peersByMaster.has(p.master_id)) S.peersByMaster.set(p.master_id, []);
    S.peersByMaster.get(p.master_id).push(p);
  });
}

// Renderers
function renderMasters() {
  const tbody = $('masters-rows');
  if (!tbody) return;
  if (!S.masters.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Aucun master</td></tr>';
    return;
  }
  tbody.innerHTML = S.masters.map(m => {
    const st = S.masterStates.get(m.master_id);
    const online = st?.online ? '✅' : '⛔';
    const seen = st?.last_seen ? formatTs(st.last_seen) : '';
    return `
      <tr data-mid="${escapeHtml(m.master_id)}">
        <td>${escapeHtml(m.name || '')}</td>
        <td><code>${escapeHtml(m.master_id)}</code></td>
        <td>${online}</td>
        <td>${escapeHtml(seen)}</td>
        <td>
          <button class="secondary act-rotate" title="Rotation de la clé">Rotate key</button>
          <button class="secondary act-online" title="Marquer en ligne">Online</button>
          <button class="secondary act-offline" title="Marquer hors ligne">Offline</button>
        </td>
      </tr>`;
  }).join('');

  // Bind actions
  tbody.querySelectorAll('tr').forEach(tr => {
    const mid = tr.getAttribute('data-mid');
    tr.addEventListener('click', (e) => {
      // Sélectionner une ligne sans cliquer sur boutons d'action
      if ((e.target instanceof HTMLElement) && e.target.tagName === 'BUTTON') return;
      S.selectedMasterId = mid;
      const sel = $('master-select');
      if (sel) sel.value = mid;
      renderPeers();
    });
    qs('.act-rotate', tr)?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Rotater la clé secrète de ce master ?')) return;
      await invokeRotateKey(mid);
    });
    qs('.act-online', tr)?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await invokeMsUpsert(mid, { online: true });
    });
    qs('.act-offline', tr)?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await invokeMsUpsert(mid, { online: false });
    });
  });
}

function renderPeers() {
  const tbody = $('peers-rows');
  if (!tbody) return;
  const mid = S.selectedMasterId;
  if (!mid) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Aucun master sélectionné</td></tr>';
    return;
  }
  const peers = S.peersByMaster.get(mid) || [];
  if (!peers.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Aucun peer</td></tr>';
    return;
  }
  tbody.innerHTML = peers.map(p => `
    <tr data-mac="${escapeHtml(p.mac)}">
      <td><code>${escapeHtml(p.mac)}</code></td>
      <td>${escapeHtml(p.name || 'Device')}</td>
      <td>${p.link ? '🔗' : '—'}</td>
      <td>${p.pc_on ? '🖥️' : '—'}</td>
      <td>${escapeHtml(p.last_seen ? formatTs(p.last_seen) : '')}</td>
      <td>
        <button class="secondary act-toggle-link">Toggle link</button>
        <button class="secondary act-toggle-pc">Toggle PC</button>
      </td>
    </tr>
  `).join('');

  // Bind actions
  tbody.querySelectorAll('tr').forEach(tr => {
    const mac = tr.getAttribute('data-mac');
    qs('.act-toggle-link', tr)?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const peer = (S.peersByMaster.get(mid) || []).find(x => x.mac === mac);
      if (!peer) return;
      await invokePsUpsert(mid, mac, { link: !peer.link, pc_on: peer.pc_on });
    });
    qs('.act-toggle-pc', tr)?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const peer = (S.peersByMaster.get(mid) || []).find(x => x.mac === mac);
      if (!peer) return;
      await invokePsUpsert(mid, mac, { link: peer.link, pc_on: !peer.pc_on });
    });
  });
}

// Edge Functions wrappers
async function invokeMsUpsert(master_id, { online }) {
  try {
    const payload = { master_id, online, last_seen: new Date().toISOString() };
    const { error } = await supabase.functions.invoke('ms_upsert', { body: payload });
    if (error) throw error;
  } catch (e) {
    alert('ms_upsert a échoué: ' + (e?.message || e));
  }
}

async function invokePsUpsert(master_id, mac, { link, pc_on }) {
  try {
    const payload = { master_id, mac, link, pc_on, last_seen: new Date().toISOString() };
    const { error } = await supabase.functions.invoke('ps_upsert', { body: payload });
    if (error) throw error;
  } catch (e) {
    alert('ps_upsert a échoué: ' + (e?.message || e));
  }
}

async function invokeRotateKey(master_id) {
  try {
    const { error } = await supabase.functions.invoke('rotate_device_key', { body: { master_id } });
    if (error) throw error;
    alert('Clé rotatée (la valeur n\'est pas renvoyée côté client)');
  } catch (e) {
    alert('rotate_device_key a échoué: ' + (e?.message || e));
  }
}

// Realtime
function subscribeRealtime() {
  unsubscribeRealtime();
  S.rtChannel = supabase.channel('realtime:states')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'master_states' }, async (_payload) => {
      const ids = S.masters.map(m => m.master_id);
      await fetchMasterStates(ids);
      renderMasters();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'peer_states' }, async (_payload) => {
      const ids = S.masters.map(m => m.master_id);
      await fetchPeerStates(ids);
      renderPeers();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // ok
      }
    });
}

function unsubscribeRealtime() {
  if (S.rtChannel) {
    supabase.removeChannel(S.rtChannel);
    S.rtChannel = null;
  }
}

// Utils
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}
function formatTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch { return ts; }
}
