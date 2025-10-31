import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Evite les crashes silencieux
  console.warn("[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants.");
}

const supabase = createClient(url, key);
export default supabase;
