import { createClient } from '@supabase/supabase-js';

// These MUST start with NEXT_PUBLIC_ to be seen by the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase Environment Variables!");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Password-reset links (implicit flow) arrive as #access_token=...&type=recovery.
// supabase-js reads that hash, clears it, and fires PASSWORD_RECOVERY during its own
// async startup — before /update-password has mounted and subscribed, so the page
// never sees the event and would ask for a "current password" the user doesn't know.
// Record it synchronously here, at module load, before the hash is cleared.
export const PW_RECOVERY_KEY = "pw_recovery";
if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
  try {
    sessionStorage.setItem(PW_RECOVERY_KEY, "1");
  } catch {}
}
