import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[ENV] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants.");
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default sb;
