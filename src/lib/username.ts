import { supabase } from "@/lib/supabase";

// Username rules shared by OnboardingModal and the later "pick a username" prompt
// (UsernamePrompt). profiles.full_name is unique; the check here is a friendly
// pre-check — the final update can still hit the unique constraint in a race, so
// callers also handle a 23505 error from the update itself.
export type UsernameProblem = "too_short" | "too_long" | "no_spaces" | "taken";

export function validateUsername(raw: string): UsernameProblem | null {
  const name = raw.trim();
  if (name.length < 2) return "too_short";
  if (name.length > 10) return "too_long";
  if (raw.includes(" ")) return "no_spaces";
  return null;
}

export async function isUsernameTaken(name: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("full_name", name.trim())
    .maybeSingle();
  if (error) throw error;
  return !!data && data.id !== userId;
}
