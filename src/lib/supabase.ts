import { createClient } from '@supabase/supabase-js';

// These MUST start with NEXT_PUBLIC_ to be seen by the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase Environment Variables!");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');