import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { jlptLevel } from "@/lib/scoring";

// Shared by every page that renders SocialDock (StudyView, Dashboard, …) so
// the friendship query, weakest-pillar N-level calc, and realtime
// subscriptions aren't duplicated per page.
export function useFriends() {
  const [friends, setFriends] = useState<any[]>([]);

  const fetchFriends = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];

    const { data } = await supabase
      .from("friendships")
      .select(
        `
    id,
    status,
    user_id,
    friend_id,
    sender:profiles!friendships_user_id_fkey (
      *,
      stats:user_review_counts(count)
    ),
    receiver:profiles!friendships_friend_id_fkey (
      *,
      stats:user_review_counts(count)
    )
  `,
      )
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq("sender.stats.study_date", today)
      .eq("receiver.stats.study_date", today);

    if (data) {
      const formatted = data
        .map((row: any) => {
          // A row's 'user_id' is ALWAYS the person who clicked "Add Friend"
          const isSentByMe = row.user_id === user.id;
          const friendProfile = isSentByMe ? row.receiver : row.sender;
          if (!friendProfile) return null;

          // Same "weakest pillar" rule Dashboard.tsx uses for your own
          // overall level — mirrors real JLPT rules (a level requires all
          // skills, not just your best one).
          const friendScores = [
            friendProfile.vocab_score,
            friendProfile.grammar_score,
            friendProfile.reading_score,
            friendProfile.listening_score,
          ].filter((s): s is number => s != null);
          const nLevel = friendScores.length > 0 ? jlptLevel(Math.min(...friendScores)) : null;

          return {
            friendshipId: row.id,
            id: friendProfile.id,
            name: friendProfile.full_name,
            avatar:
              friendProfile.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendProfile.id}`,
            status: row.status,
            isSentByMe: isSentByMe,
            dailyProgress: friendProfile.stats?.[0]?.count || 0,
            goal: friendProfile.daily_goal || 10,
            streak: friendProfile.streak_count || 0,
            isOnline: friendProfile.is_online,
            nLevel,
          };
        })
        .filter((f): f is any => f !== null)
        // If there's a duplicate ID, keep only the one we need
        .filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.id === item.id),
        );

      setFriends(formatted);
    }
  }, []);

  useEffect(() => {
    fetchFriends();

    // REALTIME: Profile Updates (Online Status & Streaks)
    const profileChannel = supabase
      .channel("profile-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setFriends((current) =>
            current.map((friend) =>
              friend.id === payload.new.id
                ? {
                    ...friend,
                    isOnline: payload.new.is_online,
                    streak: payload.new.streak_count,
                  }
                : friend,
            ),
          );
        },
      )
      .subscribe();

    // REALTIME: Progress Updates
    const progressChannel = supabase
      .channel("progress-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_review_counts" },
        () => {
          fetchFriends();
        },
      )
      .subscribe();

    // REALTIME: Friendship Changes (New requests/Accepts)
    const friendshipChannel = supabase
      .channel("friendship-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          fetchFriends();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(progressChannel);
      supabase.removeChannel(friendshipChannel);
    };
  }, [fetchFriends]);

  return { friends, fetchFriends };
}
