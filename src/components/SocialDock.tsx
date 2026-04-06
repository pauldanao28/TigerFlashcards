/* --- SocialDock.tsx --- */
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  addFriendByUsername,
  cancelFriendRequest,
  handleAcceptRequest,
  handleIgnoreRequest,
} from "@/lib/social";

export const SocialDock = ({
  userId, // Added your unique ID
  username,
  friends,
  onClose,
  fetchFriends,
}: {
  userId: string;
  username: string; // Add this prop
  friends: any[];
  onClose: () => void;
  fetchFriends?: () => Promise<void>;
}) => {
  const [newFriend, setNewFriend] = useState("");
  const [activeTab, setActiveTab] = useState<"friends" | "pending">("friends");
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

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

    const result = await addFriendByUsername(newFriend);

    if (result.success) {
      alert(`Success! Request sent to ${result.name}`);
      if (typeof fetchFriends === "function") {
        await fetchFriends();
      }
      setNewFriend(""); // Clear input
    } else if (result.error) {
      // This will show "Already in your circle" or "User not found"
      alert(result.error);
    }
  };

  // The logic for sharing or connecting
  const handleSocialAction = async () => {
    // 1. Safety check: stop if we don't have a name
    if (!username) {
      alert("Error getting username. Please wait a moment.");
      return; // Stop the function here
    }

    const shareUrl = `https://flashkado.app/join/${encodeURIComponent(username)}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
    } catch (err) {
      alert("Failed to copy link.");
    }
    //}
  };

  const acceptedCount = friends.filter((f) => f.status === "accepted").length;
  const pendingCount = friends.filter((f) => f.status === "pending").length;

  return (
    <>
      {/* 1. BACKDROP (Dismiss Layer) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[90] cursor-pointer"
      />

      {/* 2. THE DOCK (Responsive: Bottom Sheet on Mobile, Sidebar on Desktop) */}
      <motion.div
        initial={{ y: "100%", x: 0 }} // Start from bottom on mobile
        animate={{
          y: 0,
          x: 0,
          transition: { type: "spring", damping: 25, stiffness: 200 },
        }}
        exit={{ y: "100%" }} // Slide down on close
        // Desktop Overrides:
        className="fixed bottom-0 left-0 right-0 h-[70vh] w-full bg-white z-[100] p-6 rounded-t-[32px] shadow-2xl flex flex-col
                   md:top-0 md:right-0 md:left-auto md:bottom-auto md:h-full md:w-80 md:rounded-none md:translate-y-0"
      >
        {/* Mobile "Handle" - Visual cue that you can swipe down */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 md:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
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

        <form onSubmit={handleQuickAdd} className="mb-6 group">
          <div className="relative">
            <input
              value={newFriend}
              onChange={(e) => setNewFriend(e.target.value)}
              placeholder="ADD BY USERNAME..."
              className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-4 text-[10px] font-black uppercase tracking-[0.2em] focus:bg-white focus:border-black outline-none transition-all placeholder:text-slate-300"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black text-white text-[10px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity"
            >
              ADD
            </button>
          </div>
        </form>

        <div className="flex gap-2 mb-6 p-1 bg-slate-50 rounded-2xl">
          <button
            onClick={() => setActiveTab("friends")}
            className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === "friends" ? "bg-white shadow-sm text-black" : "text-slate-400"}`}
          >
            Circle
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
            className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all relative ${activeTab === "pending" ? "bg-white shadow-sm text-black" : "text-slate-400"}`}
          >
            Pending
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
        </div>

        {/* Friends List */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          {displayFriends.length > 0 ? (
            displayFriends.map((friend) => (
              <div
                key={`${friend.id}-${friend.status}`}
                className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-slate-100 overflow-hidden bg-slate-50">
                    <img
                      src={friend.avatar}
                      alt={friend.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* UI CHANGE: Check against the real-time presence array */}
                  <div
                    className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full shadow-sm ${
                      onlineUsers.includes(friend.id)
                        ? "bg-emerald-500" // Online Color
                        : "bg-slate-300" // Offline Color
                    }`}
                  />
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-end mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] font-black uppercase text-black italic leading-none">
                        {friend.name}
                      </p>
                      {friend.streak > 0 && activeTab === "friends" && (
                        <span className="text-[10px] flex items-center gap-0.5 font-bold text-orange-500">
                          🔥{friend.streak}
                        </span>
                      )}
                    </div>
                    {/* UI CHANGE: Conditional text and color for goal completion */}
                    {activeTab === "friends" && (
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
                    )}
                  </div>

                  {activeTab === "friends" ? (
                    /* --- CIRCLE TAB: Progress Bar --- */
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
                        className="h-full transition-all duration-500"
                      />
                    </div>
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
                              alert("Failed to cancel: " + result.error);
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
                              if (error) alert("Could not accept");
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
                              if (error) alert("Could not ignore");
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

        {/* Action Button */}
        <button
          onClick={handleSocialAction}
          className="mt-8 w-full py-5 bg-black text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] active:scale-[0.98] transition-all shadow-xl shadow-black/10"
        >
          + Refer a Friend
        </button>
      </motion.div>
    </>
  );
};
