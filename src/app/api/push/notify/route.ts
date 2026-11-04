import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { acceptedFriendIds, deliver, sgDate, supabaseAdmin } from "@/lib/notifyServer";
import { STREAK_MILESTONES, type QuizKind } from "@/lib/notificationText";

// One send path for every client-triggered notification — called at the moment an
// action happens (not via a Supabase Database Webhook, which would need manual
// dashboard configuration). The scheduled streak reminder lives in
// /api/cron/streak-reminder instead.
//
// Nothing about the message comes from the request body except which event happened.
// Each event is checked against the database before anything is sent (the friendship
// exists, the goal was really hit today, the quiz was really just logged), and the
// text is built from the caller's own profile, so this can't be used to push arbitrary
// text to strangers or to spam friends with fake activity.
const QUIZ_KINDS: QuizKind[] = ["reading", "listening", "grammar"];

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { type, target_user_id, quiz } = await req.json();

  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("full_name, streak_count, last_review_date, stats_visible_to_friends")
    .eq("id", user.id)
    .maybeSingle();
  const name = me?.full_name || "Someone";

  switch (type) {
    case "friend_request":
    case "friend_accepted": {
      if (!target_user_id) return NextResponse.json({ error: "Missing target_user_id" }, { status: 400 });
      const { data: link } = await supabaseAdmin
        .from("friendships")
        .select("id")
        .or(`and(user_id.eq.${user.id},friend_id.eq.${target_user_id}),and(user_id.eq.${target_user_id},friend_id.eq.${user.id})`)
        .limit(1);
      if (!link?.length) return NextResponse.json({ error: "Not connected" }, { status: 403 });

      return NextResponse.json(
        await deliver([{ user_id: target_user_id, actor_id: user.id, type, data: { name }, dedupe_key: null }])
      );
    }

    case "friend_joined": {
      // The referrer comes from the caller's own referrals row (written by
      // process_referral), never from the request, so this can only ever notify the
      // person who actually invited you — and only once (dedupe_key).
      const { data: referral } = await supabaseAdmin
        .from("referrals")
        .select("referrer_id")
        .eq("referred_id", user.id)
        .maybeSingle();
      if (!referral?.referrer_id) return NextResponse.json({ error: "No referral" }, { status: 404 });

      // Referral links run right after signup, before the new user has picked a
      // username — don't show the 'G_' placeholder; the text falls back to a
      // nameless version and tapping opens their profile.
      const joinedName = me?.full_name && !me.full_name.startsWith("G_") ? me.full_name : undefined;
      return NextResponse.json(
        await deliver([{
          user_id: referral.referrer_id,
          actor_id: user.id,
          type: "friend_joined",
          data: joinedName ? { name: joinedName } : {},
          dedupe_key: `joined:${user.id}`,
        }])
      );
    }

    case "friend_goal": {
      // update_streak sets last_review_date to today (SGT) when the goal is hit.
      const today = sgDate();
      if (me?.last_review_date !== today) return NextResponse.json({ error: "Goal not met today" }, { status: 409 });
      // Friends who hid their stats don't broadcast activity either.
      if (me.stats_visible_to_friends === false) return NextResponse.json({ recorded: 0, pushed: 0 });

      const streak = me.streak_count ?? 1;
      const milestone = STREAK_MILESTONES.includes(streak);
      const friends = await acceptedFriendIds(user.id);
      return NextResponse.json(
        await deliver(
          friends.map((id) => ({
            user_id: id,
            actor_id: user.id,
            type: milestone ? "friend_milestone" : "friend_goal",
            data: { name, streak },
            // Same key for both types — at most one goal/milestone notification per
            // friend per day.
            dedupe_key: `goal:${user.id}:${today}`,
          }))
        )
      );
    }

    case "friend_quiz": {
      if (!QUIZ_KINDS.includes(quiz)) return NextResponse.json({ error: "Unknown quiz" }, { status: 400 });
      // log_quiz_daily stamps study_date in UTC, not SGT — check created_at instead so
      // the day boundary doesn't matter, only that it was logged just now.
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data: logged } = await supabaseAdmin
        .from("quiz_daily_stats")
        .select("id")
        .eq("user_id", user.id)
        .eq("quiz_type", quiz)
        .gte("created_at", since)
        .limit(1);
      if (!logged?.length) return NextResponse.json({ error: "Quiz not logged" }, { status: 409 });
      if (me?.stats_visible_to_friends === false) return NextResponse.json({ recorded: 0, pushed: 0 });

      const today = sgDate();
      const friends = await acceptedFriendIds(user.id);
      return NextResponse.json(
        await deliver(
          friends.map((id) => ({
            user_id: id,
            actor_id: user.id,
            type: "friend_quiz" as const,
            data: { name, quiz },
            dedupe_key: `quiz:${user.id}:${quiz}:${today}`,
          }))
        )
      );
    }

    default:
      return NextResponse.json({ error: "Unknown notification type" }, { status: 400 });
  }
}
