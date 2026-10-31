import { supabase } from "@/lib/supabase";

// Saved Watch videos (watch_videos table) — see supabase/migrations/*_add_watch_videos.sql.
export interface SavedVideo {
  id: string;
  video_id: string;
  url: string;
  title: string | null;
  transcript: string;
  line_count: number;
  start_input: string;
  end_input: string;
  end_mode: "end" | "length";
  length_input: string;
  clip_manual: boolean;
  last_position: number | null;
  updated_at: string;
}

export type SavedVideoFields = Partial<Omit<SavedVideo, "id" | "updated_at">>;

// Everything but the transcript — the list doesn't need it, and transcripts can be long.
const LIST_COLUMNS =
  "id, video_id, url, title, line_count, start_input, end_input, end_mode, length_input, clip_manual, last_position, updated_at";

export const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

export async function listSavedVideos(userId: string, limit = 50): Promise<Omit<SavedVideo, "transcript">[]> {
  const { data, error } = await supabase
    .from("watch_videos")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Omit<SavedVideo, "transcript">[];
}

export async function getSavedVideo(id: string): Promise<SavedVideo | null> {
  const { data, error } = await supabase.from("watch_videos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SavedVideo | null;
}

/** Insert or update the user's row for this video (unique per user + video). Returns its id. */
export async function saveVideo(userId: string, videoId: string, fields: SavedVideoFields): Promise<string | null> {
  const { data, error } = await supabase
    .from("watch_videos")
    .upsert({ user_id: userId, video_id: videoId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_id,video_id" })
    .select("id")
    .single();
  if (error) { console.error("[watch] save failed:", error.message); return null; }
  return data?.id ?? null;
}

/** Small updates (resume position, title) — doesn't bump the list order. */
export async function updateVideo(id: string, fields: SavedVideoFields) {
  const { error } = await supabase.from("watch_videos").update(fields).eq("id", id);
  if (error) console.error("[watch] update failed:", error.message);
}

export async function deleteSavedVideo(id: string) {
  const { error } = await supabase.from("watch_videos").delete().eq("id", id);
  if (error) throw error;
}
