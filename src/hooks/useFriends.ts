import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { jlptLevel } from "@/lib/scoring";

// Shared by every page that renders SocialDock (StudyView, Dashboard, …) so
// the friendship query, weakest-pillar N-level calc, and realtime
// subscriptions aren't duplicated per page.
export function useFriends() {
  const [friends, setFriends] = useState<any[]>([]);
  const [socialToast, setSocialToast] = useState<{ name: string; kind: "request" | "accepted" } | null>(null);
  const userIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissSocialToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSocialToast(null);
  }, []);

  const fetchFriends = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    userIdRef.current = user.id;

    const today = new Date().toISOString().split("T")[0];
    // Asia/Singapore calendar date — separate from `today` above, which is UTC and
    // only used for the daily-progress/quiz-today joins. streak_count is lazy: it's
    // only ever updated the next time someone completes their daily goal (see
    // update_streak), so a friend who stopped studying keeps showing their last
    // streak number forever instead of it ever resetting to 0 on its own. Treat a
    // streak as still "alive" only if its last_review_date is today or yesterday —
    // anything older means at least one full day was missed, so the stored number
    // is stale and shouldn't be displayed as if it's current.
    const todaySg = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

    const quizTodayPromise = supabase.rpc("get_friends_quiz_today", { p_today: today });

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

    if (!data) return [];

    // Best-effort — if the RPC fails, rows just render without quiz badges.
    const { data: quizToday } = await quizTodayPromise;
    type QuizToday = { reading: boolean; listening: boolean; grammar: boolean };
    const quizByFriend = new Map<string, QuizToday>(
      ((quizToday ?? []) as (QuizToday & { friend_id: string })[]).map(({ friend_id, ...q }) => [friend_id, q]),
    );

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
        // No activity yet defaults to N5, same as your own Dashboard's
        // overall-level badge (weakestScore falls back to 0 there too).
        const nLevel = jlptLevel(friendScores.length > 0 ? Math.min(...friendScores) : 0);

        const lastReview = friendProfile.last_review_date as string | null;
        const daysSinceReview = lastReview
          ? Math.round((Date.parse(todaySg) - Date.parse(lastReview)) / 86_400_000)
          : Infinity;
        const streakIsCurrent = daysSinceReview <= 1;

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
          streak: streakIsCurrent ? (friendProfile.streak_count || 0) : 0,
          isOnline: friendProfile.is_online,
          nLevel,
          quizToday: quizByFriend.get(friendProfile.id) ?? null,
        };
      })
      .filter((f): f is any => f !== null)
      // If there's a duplicate ID, keep only the one we need
      .filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.id === item.id),
      );

    setFriends(formatted);
    return formatted;
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
          // Same staleness check as fetchFriends' initial load — this event fires on
          // ANY profile update (avatar, scores, etc.), not just an actual streak
          // change, so blindly trusting streak_count here would un-hide a stale
          // number the next time the friend's profile changes for an unrelated
          // reason.
          const todaySg = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
          const lastReview = payload.new.last_review_date as string | null;
          const daysSinceReview = lastReview
            ? Math.round((Date.parse(todaySg) - Date.parse(lastReview)) / 86_400_000)
            : Infinity;
          const streakIsCurrent = daysSinceReview <= 1;

          setFriends((current) =>
            current.map((friend) =>
              friend.id === payload.new.id
                ? {
                    ...friend,
                    isOnline: payload.new.is_online,
                    streak: streakIsCurrent ? payload.new.streak_count : 0,
                  }
                : friend,
            ),
          );
        },
      )
      .subscribe((status, err) => {
        if (status !== "SUBSCRIBED") console.error("[useFriends] profile-updates channel:", status, err);
      });

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
      .subscribe((status, err) => {
        if (status !== "SUBSCRIBED") console.error("[useFriends] progress-updates channel:", status, err);
      });

    // REALTIME: Friendship Changes (New requests/Accepts) — also surfaces a toast for
    // the two events worth interrupting whatever you're doing for: someone else's
    // INSERT landing a new pending request addressed to us, or an UPDATE where a
    // request *we* sent just became accepted. Visible even if the social panel isn't
    // open. This is the in-app half of "notify me" — not a push notification (nothing
    // reaches you if the app/tab isn't open), just immediate feedback while using it.
    const friendshipChannel = supabase
      .channel("friendship-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        async (payload) => {
          const updated = await fetchFriends();
          const showToast = (id: string, kind: "request" | "accepted") => {
            const match = updated.find((f) => f.id === id);
            if (!match) return;
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            setSocialToast({ name: match.name, kind });
            toastTimerRef.current = setTimeout(() => setSocialToast(null), 5000);
          };

          if (
            payload.eventType === "INSERT" &&
            payload.new?.status === "pending" &&
            payload.new?.friend_id === userIdRef.current
          ) {
            showToast(payload.new.user_id, "request");
          } else if (
            payload.eventType === "UPDATE" &&
            payload.new?.status === "accepted" &&
            payload.new?.user_id === userIdRef.current
          ) {
            // We were the original sender (user_id) — friend_id just accepted.
            showToast(payload.new.friend_id, "accepted");
          }
        },
      )
      .subscribe((status, err) => {
        if (status !== "SUBSCRIBED") console.error("[useFriends] friendship-changes channel:", status, err);
      });

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(progressChannel);
      supabase.removeChannel(friendshipChannel);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [fetchFriends]);

  return { friends, fetchFriends, socialToast, dismissSocialToast };
}
