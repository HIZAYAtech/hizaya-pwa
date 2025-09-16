import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// Construit une URL de redirection qui conserve le sous-dossier GitHub Pages
export function computeRedirectUrl() {
const { origin, pathname } = window.location;
const base = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]+$/, '/');
return origin + base; // ex: https://user.github.io/ton-repo/
}


export async function signInWithGoogle() {
const redirectTo = computeRedirectUrl();
const { error } = await supabase.auth.signInWithOAuth({
provider: 'google',
options: {
redirectTo,
queryParams: { access_type: 'offline', prompt: 'consent' }
}
});
if (error) throw error;
}


export async function signOut() {
await supabase.auth.signOut();
}
