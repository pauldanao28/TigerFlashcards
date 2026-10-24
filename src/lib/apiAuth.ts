import { createClient } from "@supabase/supabase-js";

// Verifies the bearer token a client sends and returns the authenticated user,
// or null if missing/invalid. Used by API routes to require a real login before
// spending AI budget on a request — previously none of these routes checked
// identity at all, so any anonymous caller could hit them directly.
export async function getAuthedUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
