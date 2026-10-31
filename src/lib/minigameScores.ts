import { supabase } from "@/lib/supabase";

export async function fetchBestScore(userId: string, column: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select(column)
    .eq("id", userId)
    .single();
  return (data as Record<string, number> | null)?.[column] ?? 0;
}

export async function updateBestScore(userId: string, column: string, newScore: number): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ [column]: newScore })
    .eq("id", userId)
    .lt(column, newScore);
  if (error) console.error("Score update failed:", error.message);
}
