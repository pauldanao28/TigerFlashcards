"use client";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, UserCheck } from "lucide-react";

// In-app half of "notify me about friend activity" — shown the moment a new pending
// request lands, or a request you sent gets accepted, via useFriends' realtime
// subscription, from wherever you're using the app. Doesn't reach you if the app/tab
// is closed; that's what push notifications are for (see src/lib/push.ts).
export default function SocialToast({
  toast,
  onTap,
  onDismiss,
}: {
  toast: { name: string; kind: "request" | "accepted" } | null;
  onTap: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.button
          key={`${toast.name}-${toast.kind}`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={() => { onTap(); onDismiss(); }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[260] flex items-center gap-2.5 bg-slate-900 text-white pl-3.5 pr-4 py-3 rounded-2xl shadow-2xl active:scale-95 transition-transform max-w-[90vw]"
        >
          {toast.kind === "request" ? (
            <UserPlus size={16} className="text-indigo-300 shrink-0" />
          ) : (
            <UserCheck size={16} className="text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-bold text-left truncate">
            <span className="font-black">{toast.name}</span>{" "}
            {toast.kind === "request" ? "wants to be friends" : "accepted your friend request! 🎉"}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
