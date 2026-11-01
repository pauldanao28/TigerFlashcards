"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  notificationText,
  notificationUrl,
  type NotificationData,
  type NotificationType,
} from "@/lib/notificationText";

type NotificationItem = {
  id: string;
  actor_id: string | null;
  type: NotificationType;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Home header bell — notification history (rows written server-side by
// lib/notifyServer.ts, pruned after 30 days). Badge counts unread; opening the sheet
// marks everything read. New rows arrive live via Realtime.
export default function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () =>
      supabase
        .from("notifications")
        .select("id, actor_id, type, data, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => setItems((data as NotificationItem[]) ?? []));

    load();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unread = items.filter((n) => !n.read_at).length;

  const openSheet = async () => {
    setOpen(true);
    if (unread === 0) return;
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null);
  };

  return (
    <>
      <button
        onClick={openSheet}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-11 h-11 rounded-2xl border bg-slate-50 border-slate-100 shadow-sm active:scale-95 transition-all shrink-0"
      >
        <Bell size={18} className="text-slate-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-orange-500 text-white text-[9px] font-black rounded-full border-2 border-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/30 z-[60]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 md:left-auto md:right-6 md:bottom-6 md:w-96 md:rounded-3xl max-h-[75vh] bg-white rounded-t-3xl z-[61] flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Notifications</h2>
                <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-full hover:bg-slate-100">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <div className="overflow-y-auto px-3 py-2 pb-8">
                {items.length === 0 ? (
                  <p className="text-center text-xs font-bold text-slate-400 py-10">No notifications yet</p>
                ) : (
                  items.map((n) => {
                    const { emoji, title, body } = notificationText(n.type, n.data);
                    return (
                      <Link
                        key={n.id}
                        href={notificationUrl(n.type, n.actor_id)}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-2 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100"
                      >
                        <span className="text-xl leading-none mt-0.5">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-slate-800 leading-snug">{title}</p>
                          <p className="text-[11px] text-slate-500 leading-snug">{body}</p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0 mt-0.5">{timeAgo(n.created_at)}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
