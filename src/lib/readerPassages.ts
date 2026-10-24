import { supabase } from "@/lib/supabase";

// Saved Reader passages (reader_passages table) — see
// supabase/migrations/*_add_reader_passages.sql.
export interface SavedPassage {
  id: string;
  passage: string;
  title: string | null; // user-set — falls back to gen_topic / a lead-in snippet when unset
  source: "pasted" | "generated";
  gen_level: string | null;
  gen_topic: string | null;
  grammar_notes: { pattern: string; explanation: string }[];
  read_idx: number | null;
  updated_at: string;
}

export type SavedPassageFields = Partial<Omit<SavedPassage, "id" | "updated_at">>;

// Passages are capped at 1500 chars, so the list can just include the full text —
// no need for Watch's separate "list columns vs full row" split.
export async function listSavedPassages(userId: string, limit = 50): Promise<SavedPassage[]> {
  const { data, error } = await supabase
    .from("reader_passages")
    .select("id, passage, title, source, gen_level, gen_topic, grammar_notes, read_idx, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SavedPassage[];
}

/** Creates a new saved passage row. Returns its id. */
export async function savePassage(userId: string, fields: SavedPassageFields): Promise<string | null> {
  const { data, error } = await supabase
    .from("reader_passages")
    .insert({ user_id: userId, ...fields, updated_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) { console.error("[reader] save failed:", error.message); return null; }
  return data?.id ?? null;
}

/** Small updates (resume position) — doesn't bump the list order. */
export async function updatePassage(id: string, fields: SavedPassageFields) {
  const { error } = await supabase.from("reader_passages").update(fields).eq("id", id);
  if (error) console.error("[reader] update failed:", error.message);
}

export async function deleteSavedPassage(id: string) {
  const { error } = await supabase.from("reader_passages").delete().eq("id", id);
  if (error) throw error;
}
