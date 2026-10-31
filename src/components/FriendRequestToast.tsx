"use client";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus } from "lucide-react";

// In-app half of "notify me about friend requests" — shown the moment a new pending
// request lands via useFriends' realtime subscription, from wherever you're using the
// app. Doesn't reach you if the app/tab is closed; that's what push notifications are
// for (see src/lib/push.ts).
export default function FriendRequestToast({
  name,
  onTap,
  onDismiss,
}: {
  name: string | null;
  onTap: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {name && (
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={() => { onTap(); onDismiss(); }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[260] flex items-center gap-2.5 bg-slate-900 text-white pl-3.5 pr-4 py-3 rounded-2xl shadow-2xl active:scale-95 transition-transform max-w-[90vw]"
        >
          <UserPlus size={16} className="text-indigo-300 shrink-0" />
          <span className="text-xs font-bold text-left truncate">
            <span className="font-black">{name}</span> wants to be friends
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
