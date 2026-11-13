import { supabase } from "@/lib/supabase";

// Drop-in replacement for fetch() against our own AI-cost API routes — those
// now require a valid Supabase session and reject anonymous calls, so every
// caller needs to attach the access token instead of just a JSON body.
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(url, { ...options, headers });
}
