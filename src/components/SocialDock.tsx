/* --- SocialDock.tsx --- */
import { motion } from "framer-motion";
import { Fragment, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  addFriend,
  addFriendById,
  cancelFriendRequest,
  handleAcceptRequest,
  handleIgnoreRequest,
  type FriendCandidate,
} from "@/lib/social";
import { useAppAlert } from "@/context/AlertContext";
import { FriendProfileModal } from "@/components/FriendProfileModal";
import ShareButton from "@/components/ShareButton";
import { pickDailyQuests, questProgress } from "@/lib/dailyQuests";

export const SocialDock = ({
  userId, // Added your unique ID
  username,
  myStreak,
  myNLevel,
  myAvatar,
  referralCode,
  friends,
  onClose,
  fetchFriends,
}: {
  userId: string;
  username: string; // Add this prop
  myStreak?: number;
  // Overall weakest-pillar level (same definition as Dashboard's own banner and
  // useFriends.ts's per-friend nLevel) — optional since not every caller has the
  // vocab/grammar/reading/listening scores on hand to compute it; the Rank tab's
  // "You" row just shows no badge when it's not provided.
  myNLevel?: string | null;
  // Your own chosen avatar (profiles.avatar_url) — without this, the Rank tab's
  // "You" row fell back to a hardcoded seeded DiceBear URL instead of what you
  // actually picked, even though a friend's own row always shows their real one.
  myAvatar?: string | null;
  referralCode: string | null;
  friends: any[];
  onClose: () => void;
  fetchFriends?: () => Promise<unknown>;
}) => {
  const { showAlert } = useAppAlert();
  const [newFriend, setNewFriend] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [activeTab, setActiveTab] = useState<"friends" | "pending" | "leaderboard">("friends");
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<FriendCandidate[] | null>(null);
  const [showReferralShare, setShowReferralShare] = useState(false);

  // The dock sits on top of a normally-scrollable page (Dashboard/StudyView
  // aren't full-screen-locked like Auth/join are), so without this the page
  // underneath kept scrolling while the sheet was open — the backdrop only
  // blocks clicks, not scroll/touch. Lock body scroll for as long as this
  // component is mounted, restoring whatever the page's own overflow was.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("online-users", {
      config: {
        presence: { key: userId }, // 👈 You are now "User_123" in the room
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // This creates an array of IDs: ['id_1', 'id_2', 'id_3']
        const onlineIds = Object.keys(state);
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const status = await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  // Filter your friends array based on the tab
  const displayFriends = friends.filter((f) => {
    if (activeTab === "friends") return f.status === "accepted";
    if (activeTab === "pending") return f.status === "pending";
    return false;
  });

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriend.trim()) return;

    setCandidates(null);
    const result = await addFriend(newFriend);

    if (result.needsDisambiguation) {
      setCandidates(result.matches);
      return;
    }
    if (result.success) {
      showAlert(result.autoAccepted ? `You're now friends with ${result.name}! 🎉` : `Success! Request sent to ${result.name}`);
      if (typeof fetchFriends === "function") {
        await fetchFriends();
      }
      setNewFriend(""); // Clear input
      setShowAddInput(false);
    } else if (result.error) {
      // This will show "Already in your circle" or "User not found"
      showAlert(result.error);
    }
  };

  const handlePickCandidate = async (candidate: FriendCandidate) => {
    const result = await addFriendById(candidate);
    if (result.success) {
      showAlert(result.autoAccepted ? `You're now friends with ${result.name}! 🎉` : `Success! Request sent to ${result.name}`);
      if (typeof fetchFriends === "function") {
        await fetchFriends();
      }
      setNewFriend("");
      setCandidates(null);
      setShowAddInput(false);
    } else if (result.error) {
      showAlert(result.error);
    }
  };

  // The logic for sharing or connecting
  const handleSocialAction = async () => {
    // 1. Safety check: stop if we don't have a code yet
    if (!referralCode) {
      showAlert("Error getting your referral code. Please wait a moment.");
      return; // Stop the function here
    }

    const shareUrl = `${window.location.origin}/join/${referralCode}`;
    const shareText = `Join me on FlashKado! I'm learning Japanese with AI-powered flashcards 🇯🇵`;

    // Prefer the native share sheet (lets them pick Messages/WhatsApp/etc
    // directly) — fall back to clipboard copy where it's unavailable. The
    // share sheet gets text/url as separate fields and most targets (SMS,
    // WhatsApp, etc.) concatenate them themselves, so shareText must NOT
    // already contain the URL or it ends up duplicated in the composed
    // message. The clipboard fallback copies a single string, so it builds
    // its own combined message.
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
        return;
      } catch {
        // User cancelled the share sheet — not an error, just stop.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      showAlert("Invite message copied to clipboard!");
    } catch (err) {
      showAlert("Failed to copy link.");
    }
    //}
  };

  const acceptedCount = friends.filter((f) => f.status === "accepted").length;
  const pendingCount = friends.filter((f) => f.status === "pending").length;

  // Friends-only ranking by current streak, including yourself so you can see where
  // you stand — never shows anyone outside your own circle (no public leaderboard).
  const rankedFriends = [
    { id: userId, name: username, avatar: myAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`, streak: myStreak ?? 0, isMe: true, nLevel: myNLevel ?? null },
    ...friends
      .filter((f) => f.status === "accepted")
      .map((f) => ({ id: f.id, name: f.name, avatar: f.avatar, streak: f.streak ?? 0, isMe: false, nLevel: f.nLevel ?? null })),
  ]
    .sort((a, b) => b.streak - a.streak)
    .map((f, i) => ({ ...f, rank: i + 1 }));

  // Show the top 10; if you're ranked below that, your own row is appended after a
  // divider so you always see where you stand.
  const RANK_LIMIT = 10;
  const topRanked = rankedFriends.slice(0, RANK_LIMIT);
  const myRankedRow = rankedFriends.find((f) => f.isMe);
  const showMyRowBelow = !!myRankedRow && myRankedRow.rank > RANK_LIMIT;

  // Same quest set + progress rules Dashboard.tsx's Today's Quests card uses for
  // you, just run against a friend's own id/signals (quizToday, dailyProgress,
  // masteredToday, cardsAddedToday — the last two from get_friends_quest_progress_
  // today) instead of the signed-in user's own dashboard data.
  const todaySg = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const friendQuestsDone = (friend: {
    id: string;
    dailyProgress?: number;
    masteredToday?: number;
    cardsAddedToday?: number;
    quizToday?: { reading: boolean; listening: boolean; grammar: boolean } | null;
    doneTodayTranslate?: boolean;
    doneTodayReadWatch?: boolean;
  }): boolean => {
    const quests = pickDailyQuests(todaySg);
    return quests.every(
      (q) =>
        questProgress(q.key, {
          daily_count: friend.dailyProgress ?? 0,
          mastered_today: friend.masteredToday ?? 0,
          cards_added_today: friend.cardsAddedToday ?? 0,
          done_today_quizzes: friend.quizToday ?? { reading: false, listening: false, grammar: false },
          done_today_translate: friend.doneTodayTranslate ?? false,
          done_today_read_watch: friend.doneTodayReadWatch ?? false,
        }) >= q.target,
    );
  };

  return (
    <>
      {/* 1. BACKDROP (Dismiss Layer) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        // No backdrop-blur: animating anything over a blurred backdrop forces the
        // browser to re-composite that blur every single frame as the opaque sheet
        // covers more of the screen — a well-known source of jank on mobile,
        // independent of how clean the sheet's own easing curve is. Bumped the dim
        // from /20 to /30 to keep enough visual separation from the page behind
        // without needing the blur to do it.
        className="fixed inset-0 bg-black/30 z-[240] cursor-pointer touch-none overscroll-none"
      />

      {/* 2. THE DOCK (Responsive: Bottom Sheet on Mobile, Sidebar on Desktop) */}
      <motion.div
        initial={{ y: "100%", x: 0 }} // Start from bottom on mobile
        animate={{
          y: 0,
          x: 0,
          // A spring here (the original damping/stiffness combo) reads as a
          // slight bounce/overshoot on a sheet this size — a plain ease-out
          // tween lands cleanly in one motion instead, which feels crisper.
          transition: { type: "tween", ease: "easeOut", duration: 0.32 },
        }}
        exit={{ y: "100%", transition: { duration: 0.22, ease: "easeIn" } }}
        // Desktop Overrides:
        // Mobile sheet sizes to its own content (capped at 92vh for a long list)
        // instead of always claiming a fixed 70% of the screen — a short Circle
        // shouldn't leave a big empty gap above the Refer button. Slightly less
        // outer padding on mobile (p-5 vs p-6) buys back ~16px of width for the
        // tab row and friend rows on narrow phones, where they're tightest.
        className="fixed bottom-0 left-0 right-0 max-h-[92vh] w-full bg-white z-[241] p-5 rounded-t-[32px] shadow-2xl flex flex-col will-change-transform
                   md:top-0 md:right-0 md:left-auto md:bottom-auto md:h-full md:max-h-none md:w-80 md:rounded-none md:translate-y-0 md:p-6"
      >
        {/* Mobile "Handle" - Visual cue that you can swipe down */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5 md:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-black uppercase tracking-[0.4em] text-black">
            Study Circle
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <span className="text-xl text-black">✕</span>
          </button>
        </div>

        {/* Your code and Add Friend share one row (each flex-1) instead of
            stacking — saves a full row of height on mobile. Your code drops
            its label+code to a stacked layout to fit comfortably at half
            width; Add Friend only sits here while collapsed, so once tapped
            its slot in the row just disappears and the input takes the full
            row below on its own. */}
        <div className="flex gap-2 mb-3">
          {/* Shown plainly so it can be read aloud/texted/copied without going
              through the native share sheet — the input below already accepts
              a code typed in directly (addFriend auto-detects the 8-char
              pattern), this is just the other half: giving yours out. */}
          {referralCode && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(referralCode);
                  showAlert("Code copied!");
                } catch {
                  showAlert(`Your code: ${referralCode}`);
                }
              }}
              className="flex-1 min-w-0 flex flex-col items-start px-3.5 py-2.5 bg-slate-50 rounded-2xl active:scale-[0.98] transition-all"
            >
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Your code</span>
              <span className="text-[12px] font-black tracking-[0.1em] text-black truncate">{referralCode}</span>
            </button>
          )}
          {/* Collapsed behind a button rather than always showing the input —
              bought back real vertical room for the list below without losing
              the feature; it stays open for the rest of this sheet-open
              session once tapped, and collapses itself again after a
              successful add (see handleQuickAdd/handlePickCandidate). */}
          {!showAddInput && (
            <button
              onClick={() => setShowAddInput(true)}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-50 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 active:scale-[0.98] transition-all"
            >
              + Add Friend
            </button>
          )}
        </div>

        {showAddInput && (
          <form onSubmit={handleQuickAdd} className="mb-3 flex items-center gap-2 group">
            <div className="relative flex-1 min-w-0">
              <input
                autoFocus
                value={newFriend}
                onChange={(e) => { setNewFriend(e.target.value); setCandidates(null); }}
                placeholder="ADD BY NAME OR CODE..."
                className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-3.5 pr-14 text-[10px] font-black uppercase tracking-[0.2em] focus:bg-white focus:border-black outline-none transition-all placeholder:text-slate-300"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black text-white text-[10px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity"
              >
                ADD
              </button>
            </div>
            {/* No way back to the collapsed button once expanded, short of
                submitting something — this closes it without adding anyone. */}
            <button
              type="button"
              onClick={() => { setShowAddInput(false); setNewFriend(""); setCandidates(null); }}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all"
            >
              <span className="text-base text-slate-500">✕</span>
            </button>
          </form>
        )}

        {candidates && (
          <div className="mb-6 p-2 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-2 pt-1">
              Multiple people named &ldquo;{newFriend.trim()}&rdquo; — who did you mean?
            </p>
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => handlePickCandidate(c)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 transition-all active:scale-[0.98]"
              >
                <span className="text-[11px] font-black text-slate-700">{c.full_name}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Add</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 mb-4 p-1 bg-slate-50 rounded-2xl">
          <button
            onClick={() => setActiveTab("friends")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === "friends" ? "bg-white shadow-sm text-black" : "text-slate-400"}`}
          >
            <span>Circle</span>
            {/* 1. Friends Count Badge (Standardized) */}
            {acceptedCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold transition-colors ${
                  activeTab === "friends"
                    ? "bg-slate-900 text-white" // Active state
                    : "bg-slate-100 text-slate-500" // Inactive state
                }`}
              >
                {acceptedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all relative ${activeTab === "pending" ? "bg-white shadow-sm text-black" : "text-slate-400"}`}
          >
            <span>Pending</span>
            {/* 2. Pending Count Badge (Standardized) */}
            {pendingCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold transition-colors ${
                  activeTab === "pending"
                    ? "bg-orange-500 text-white" // Active state (Orange stands out)
                    : "bg-orange-100 text-orange-600" // Inactive state (Subtle tint)
                }`}
              >
                {pendingCount}
              </span>
            )}
            {/* Notification Dot for new requests */}
            {friends.some((f) => f.status === "pending" && !f.isSentByMe) && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-orange-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === "leaderboard" ? "bg-white shadow-sm text-black" : "text-slate-400"}`}
          >
            <span>🔥</span><span>Rank</span>
          </button>
        </div>

        {/* Friends List / Leaderboard */}
        {/* Sizes to its own content on mobile (min 140px so a near-empty list/empty
            state still has some presence, capped at 54vh — raised alongside the
            sheet's own 85vh->92vh bump so the taller sheet actually shows more
            rows instead of just more empty space — so a long list scrolls
            internally instead of growing the whole sheet) — the old flex-1 always
            filled the fixed-height sheet above even when there were only 2-3 rows to
            show, leaving a big empty gap before the Refer button. Desktop's sidebar
            keeps the original flex-1-fills-remaining-height behavior. */}
        <div className="min-h-[140px] max-h-[54vh] md:min-h-0 md:max-h-none md:flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
          {activeTab === "leaderboard" ? (
            rankedFriends.length > 1 ? (
              <div className="space-y-2">
                {[...topRanked, ...(showMyRowBelow ? [myRankedRow!] : [])].map((f) => {
                  const rank = f.rank;
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                  return (
                    <Fragment key={f.id}>
                    {f.isMe && showMyRowBelow && (
                      <div className="text-center text-xs font-black text-slate-300 leading-none py-1">⋯</div>
                    )}
                    <div
                      onClick={() => { if (!f.isMe) setSelectedFriendId(f.id); }}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl animate-in fade-in slide-in-from-bottom-2 ${f.isMe ? "bg-indigo-50" : ""} ${!f.isMe ? "cursor-pointer active:opacity-70" : ""}`}
                    >
                      <span className="w-7 text-center text-xs font-black text-slate-400 shrink-0">
                        {medal ?? `#${rank}`}
                      </span>
                      <div className="w-10 h-10 rounded-full border-2 border-slate-100 overflow-hidden bg-slate-50 shrink-0">
                        <img src={f.avatar} alt={f.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <p className="text-[12px] font-black uppercase text-black italic leading-none truncate">
                          {f.name}{f.isMe ? " (You)" : ""}
                        </p>
                        {f.nLevel && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600 shrink-0">
                            {f.nLevel}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] flex items-center gap-0.5 font-bold text-orange-500 shrink-0">
                        🔥 {f.streak}
                      </span>
                    </div>
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-40">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Circle Empty</p>
                <p className="text-[10px] text-slate-400 lowercase italic">Add friends to start a leaderboard</p>
              </div>
            )
          ) : displayFriends.length > 0 ? (
            displayFriends.map((friend) => (
              <div
                key={`${friend.id}-${friend.status}`}
                onClick={() => { if (activeTab === "friends") setSelectedFriendId(friend.id); }}
                className={`flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 ${activeTab === "friends" ? "cursor-pointer active:opacity-70" : ""}`}
              >
                <div className="relative shrink-0">
                  {/* 40px, matching the leaderboard tab's avatar size — was 48px,
                      the single biggest lever for a denser list on mobile without
                      shrinking text below CLAUDE.md's 9px caption floor. */}
                  <div className="w-10 h-10 rounded-full border-2 border-slate-100 overflow-hidden bg-slate-50">
                    <img
                      src={friend.avatar}
                      alt={friend.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* UI CHANGE: Check against the real-time presence array */}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full shadow-sm ${
                      onlineUsers.includes(friend.id)
                        ? "bg-emerald-500" // Online Color
                        : "bg-slate-300" // Offline Color
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name + badges get the full row to themselves on narrow phones —
                      the progress text used to share this line via justify-between,
                      which left very little room once a 10-char name, an N-level
                      badge, and a streak number were all competing for it. It now
                      sits under the bar instead (below), on its own line. */}
                  <div className="flex items-center gap-1.5 mb-1 min-w-0">
                    <p className="text-[12px] font-black uppercase text-black italic leading-none truncate">
                      {friend.name}
                    </p>
                    {friend.nLevel && activeTab === "friends" && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600 shrink-0">
                        {friend.nLevel}
                      </span>
                    )}
                    {friend.streak > 0 && activeTab === "friends" && (
                      <span className="text-[10px] flex items-center gap-0.5 font-bold text-orange-500 shrink-0">
                        🔥{friend.streak}
                      </span>
                    )}
                  </div>

                  {activeTab === "friends" ? (
                    /* --- CIRCLE TAB: Progress Bar --- */
                    <>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={false}
                          animate={{
                            width: `${Math.min((friend.dailyProgress / friend.goal) * 100, 100)}%`,
                            /* UI CHANGE: Bar turns Emerald when goal is met */
                            backgroundColor:
                              friend.dailyProgress >= friend.goal
                                ? "#10b981"
                                : "#000000",
                          }}
                          // framer-motion's `animate` already drives width/color — the
                          // Tailwind `transition-all duration-500` that used to sit here
                          // was a second, competing CSS transition on the same
                          // properties, which is what made the bar's motion stutter
                          // instead of gliding smoothly.
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="h-full"
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        {/* Today's quizzes — same 📖 🎧 📝 markers as the friend page */}
                        <div className="flex items-center gap-1">
                          {([
                            ["reading", "📖"],
                            ["listening", "🎧"],
                            ["grammar", "📝"],
                          ] as const).map(([key, emoji]) => (
                            <span
                              key={key}
                              className={`text-[9px] leading-none ${friend.quizToday?.[key] ? "" : "opacity-25 grayscale"}`}
                            >
                              {emoji}
                            </span>
                          ))}
                          {/* Quest-done indicator — additional to the 3 quiz markers
                              above, not a replacement. Each friend's quest set is
                              personalized (pickDailyQuests), so this is a plain done/
                              not-done badge rather than per-quest detail. Same grey-out-
                              until-done treatment as the quiz markers, not hidden. */}
                          <span
                            title={friendQuestsDone(friend) ? "Finished today's quests" : "Hasn't finished today's quests yet"}
                            className={`text-[9px] leading-none ${friendQuestsDone(friend) ? "" : "opacity-25 grayscale"}`}
                          >
                            🎯
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase tracking-tighter transition-colors ${
                            friend.dailyProgress >= friend.goal
                              ? "text-emerald-500"
                              : "text-slate-400"
                          }`}
                        >
                          {friend.dailyProgress >= friend.goal
                            ? `DONE: ${friend.dailyProgress} CARDS`
                            : `${friend.dailyProgress} / ${friend.goal}`}
                        </span>
                      </div>
                    </>
                  ) : (
                    /* --- PENDING TAB: Action Buttons --- */
                    <div className="flex gap-2">
                      {friend.isSentByMe ? (
                        /* SENDER VIEW: Show Cancel */
                        <button
                          className="flex-1 py-1.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase rounded-lg hover:bg-red-50 hover:text-red-500 transition-all active:scale-95 disabled:opacity-50"
                          onClick={async (e) => {
                            e.preventDefault();
                            const result = await cancelFriendRequest(friend.id);
                            if (result?.error)
                              showAlert("Failed to cancel: " + result.error);
                          }}
                        >
                          Cancel Request
                        </button>
                      ) : (
                        /* RECEIVER VIEW: Show Accept/Ignore */
                        <>
                          <button
                            onClick={async () => {
                              const { error } = await handleAcceptRequest(
                                friend.id,
                              );
                              if (error) showAlert("Could not accept");
                            }}
                            className="flex-1 py-1.5 bg-black text-white text-[9px] font-black uppercase rounded-lg hover:opacity-80 transition-opacity"
                          >
                            Accept
                          </button>
                          <button
                            onClick={async () => {
                              const { error } = await handleIgnoreRequest(
                                friend.id,
                              );
                              if (error) showAlert("Could not ignore");
                            }}
                            className="flex-1 py-1.5 bg-slate-100 text-slate-400 text-[9px] font-black uppercase rounded-lg hover:bg-red-50 hover:text-red-500 transition-all"
                          >
                            Ignore
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-40">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                {activeTab === "friends" ? "Circle Empty" : "No Requests"}
              </p>
              <p className="text-[10px] text-slate-400 lowercase italic">
                {activeTab === "friends"
                  ? "Add a username to start racing"
                  : "You're all caught up"}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons — Refer a Friend (link/share-sheet) and Share Invite
            Card (image, second mode of the same share-card generator used by
            streak/level-up cards elsewhere) side by side. An image with the
            code baked in survives a screenshot or a forward that strips the
            caption text, unlike the link-only button alone. ShareButton
            fetches its image as soon as IT mounts (needed elsewhere so
            navigator.share() still fires close enough to the tap on iOS) —
            gating that mount behind a plain button instead of rendering
            ShareButton directly means the image is only ever prepared once
            someone actually taps toward sharing it, not just from opening
            this sheet. */}
        <div className="mt-8 flex gap-2">
          <button
            onClick={handleSocialAction}
            className="flex-1 py-5 bg-black text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] active:scale-[0.98] transition-all shadow-xl shadow-black/10"
          >
            + Refer a Friend
          </button>
          {referralCode && (
            <div className="flex-1">
              {showReferralShare ? (
                <ShareButton
                  params={{ kind: "referral" }}
                  caption="Join me on FlashKado! I'm learning Japanese with AI-powered flashcards 🇯🇵"
                  className="bg-slate-50 text-slate-500"
                />
              ) : (
                <button
                  onClick={() => setShowReferralShare(true)}
                  className="w-full h-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all bg-slate-50 text-slate-500"
                >
                  Share Invite Card
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {selectedFriendId && (
        <FriendProfileModal friendId={selectedFriendId} onClose={() => setSelectedFriendId(null)} />
      )}
    </>
  );
};
