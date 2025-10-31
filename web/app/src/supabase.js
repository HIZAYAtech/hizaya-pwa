import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Petit util pour nettoyer l’URL après OAuth (évite /?code=...&state=...)
export function stripOAuthParams() {
  try {
    const url = new URL(window.location.href);
    let changed = false;

    ["code", "state", "provider", "error", "error_description"].forEach((p) => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    });

    // Supabase peut aussi renvoyer dans le hash
    if (url.hash && /access_token|refresh_token|error/i.test(url.hash)) {
      url.hash = url.hash.split("?")[0] || "";
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch {
    /* noop */
  }
}
