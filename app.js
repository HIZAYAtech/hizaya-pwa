import { supabase, signInWithGoogle, signOut } from './supabase-auth.js';
});
if (error) throw error;


$('dev-name').value = '';
$('dev-mac').value = '';
$('dev-channel').value = '';
await refreshDevices();
} catch (e) { alert('Échec: ' + e.message); }
});


async function refreshDevices() {
rowsEl.innerHTML = '<tr><td colspan="6" class="muted">Chargement…</td></tr>';
try {
const { data, error } = await supabase
.from('devices')
.select('*')
.order('created_at', { ascending: false });
if (error) throw error;


if (!data || data.length === 0) {
rowsEl.innerHTML = '<tr><td colspan="6" class="muted">Aucun device</td></tr>';
return;
}


rowsEl.innerHTML = data.map(d => `
<tr>
<td>${escapeHtml(d.name)}</td>
<td><code>${escapeHtml(d.mac)}</code></td>
<td>${escapeHtml(d.role)}</td>
<td>${d.channel ?? ''}</td>
<td>${new Date(d.created_at).toLocaleString()}</td>
<td><button data-id="${d.id}" class="secondary del">Supprimer</button></td>
</tr>
`).join('');


document.querySelectorAll('button.del').forEach(btn => {
btn.addEventListener('click', async (e) => {
const id = e.currentTarget.getAttribute('data-id');
if (!confirm('Supprimer ce device ?')) return;
const { error } = await supabase.from('devices').delete().eq('id', id);
if (error) return alert('Suppression impossible: ' + error.message);
await refreshDevices();
});
});
} catch (e) {
console.error(e);
rowsEl.innerHTML = '<tr><td colspan="6" class="muted">Erreur de chargement</td></tr>';
}
}


function escapeHtml(s) {
return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}
