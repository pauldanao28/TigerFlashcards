"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, BookOpen, ScrollText, BarChart2, X, Gamepad2, Languages, Headphones, PenTool, MonitorPlay, Plus } from "lucide-react";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { useAppAlert } from "@/context/AlertContext";
import { useAuth } from "@/context/AuthContext";
import { useIsMiniViewport } from "@/lib/useMiniViewport";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import AddWordsSheet from "@/components/AddWordsSheet";

type Tab = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
  kanji?: string;
};

// Sensei moved out of the primary tab bar into the Quick Actions sheet's Pages
// section (see QUICK_ACTION_PAGES below) — the middle slot it used to sit next to
// now opens that sheet instead.
const TABS_BEFORE: Tab[] = [
  { href: "/",        label: "Home",    icon: Home },
  { href: "/study",   label: "Study",   icon: BookOpen },
];
const TABS_AFTER: Tab[] = [
  { href: "/quizzes", label: "Practice", icon: ScrollText },
  { href: "/stats",   label: "Cards", icon: BarChart2 },
];

type QuickAction = {
  href?: string;
  action?: "addCards";
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  kanji?: string;
  bg: string;
  color: string;
};

// The 5 quiz/content modes (each opened via /quizzes?open=... same as every other
// entry point to them in the app) plus Kana Practice — the handful of actions that
// don't already have their own tab (Study/Cards already cover reviewing/browsing).
// Add Cards opens AddWordsSheet in place (via `action`, not `href`) rather than
// navigating to Cards — it must work the same from whichever page the user is on.
const QUICK_ACTIONS: QuickAction[] = [
  { action: "addCards", label: "Add Cards", icon: Plus, bg: "bg-fuchsia-50", color: "text-fuchsia-600" },
  { href: "/quizzes?open=sentence", label: "Reading Quiz", icon: ScrollText, bg: "bg-indigo-50", color: "text-indigo-600" },
  { href: "/quizzes?open=listening", label: "Listening Quiz", icon: Headphones, bg: "bg-sky-50", color: "text-sky-600" },
  { href: "/quizzes?open=grammar", label: "Grammar Quiz", icon: PenTool, bg: "bg-violet-50", color: "text-violet-600" },
  { href: "/quizzes?open=watch", label: "Watcher", icon: MonitorPlay, bg: "bg-orange-50", color: "text-orange-600" },
  { href: "/quizzes?open=reader", label: "Reader", icon: BookOpen, bg: "bg-teal-50", color: "text-teal-600" },
  { href: "/study/kana", label: "Kana Practice", icon: Languages, bg: "bg-emerald-50", color: "text-emerald-600" },
];

const QUICK_ACTION_PAGES: QuickAction[] = [
  { href: "/sensei", label: "Sensei", kanji: "先生", bg: "bg-rose-50", color: "text-rose-600" },
  { href: "/minigames", label: "Mini Games", icon: Gamepad2, bg: "bg-amber-50", color: "text-amber-600" },
];

const SHOW_ON = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

function BottomNavInner() {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoMiniViewport = useIsMiniViewport();
  const { isBusy } = useUploadGuard();
  const { showConfirm } = useAppAlert();
  const { user, loading } = useAuth();
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showAddCards, setShowAddCards] = useState(false);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [blocklist, setBlocklist] = useState<string[]>([]);

  // Fetched lazily (only once the Quick Actions sheet is opened) since most page
  // loads never touch Add Cards — no need to pay for this on every navigation.
  useEffect(() => {
    if (!showQuickActions || !user || defaultDeckId) return;
    (async () => {
      const [{ data: deck }, { data: profile }] = await Promise.all([
        supabase.from("decks").select("id").eq("user_id", user.id).eq("is_default", true).single(),
        supabase.from("profiles").select("is_admin, blocked_words").eq("id", user.id).single(),
      ]);
      if (deck) setDefaultDeckId(deck.id);
      if (profile) {
        setIsAdmin(!!profile.is_admin);
        setBlocklist(profile.blocked_words || []);
      }
    })();
  }, [showQuickActions, user, defaultDeckId]);

  if (!SHOW_ON.has(path)) return null;
  // Hidden in the mini popup player, and on Study specifically once a desktop
  // browser window has been resized down small enough to trigger its Mini Mode
  // layout — other pages have no compact layout to fall back on, so they keep
  // their normal nav even on a narrow desktop window.
  if (searchParams.get("mini") === "1") return null;
  if (path === "/study" && autoMiniViewport) return null;
  if (loading || !user) return null;

  const guardedNavigate = (e: React.MouseEvent, href: string) => {
    if (href === path) return;
    if (isBusy) {
      // Native confirm() blocks synchronously so preventDefault can act on its
      // result right away; our custom confirm is async, so we always cancel the
      // Link's default navigation first and re-navigate manually if confirmed.
      e.preventDefault();
      showConfirm(
        "A batch upload is still running — leave anyway? It won't be cancelled, but you won't see the result.",
        { title: "Leave this page?", confirmLabel: "Leave", cancelLabel: "Stay" }
      ).then((ok) => { if (ok) router.push(href); });
    }
  };

  const renderTab = (tab: Tab) => {
    const active = path === tab.href;
    const color = active ? "text-indigo-600" : "text-slate-400";
    return (
      <Link
        key={tab.href}
        href={tab.href}
        onClick={(e) => guardedNavigate(e, tab.href)}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:opacity-70 ${color}`}
      >
        {tab.kanji ? (
          <span className={`text-base font-black leading-none ${color}`}>{tab.kanji}</span>
        ) : tab.icon ? (
          <tab.icon size={18} />
        ) : null}
        <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
      </Link>
    );
  };

  const renderQuickActionTile = (item: QuickAction) => {
    const inner = (
      <>
        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
          {item.kanji ? (
            <span className={`text-base font-black ${item.color}`}>{item.kanji}</span>
          ) : item.icon ? (
            <item.icon size={20} className={item.color} />
          ) : null}
        </span>
        <span className="text-[11px] font-bold text-slate-700 text-center leading-tight">{item.label}</span>
      </>
    );
    const className = "flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-100 bg-slate-50 active:scale-95 transition-all";
    if (item.action === "addCards") {
      return (
        <button
          key={item.label}
          onClick={() => { setShowQuickActions(false); setShowAddCards(true); }}
          className={className}
        >
          {inner}
        </button>
      );
    }
    return (
      <Link key={item.href} href={item.href!} onClick={() => setShowQuickActions(false)} className={className}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[200] bg-white/95 backdrop-blur-sm border-t border-slate-100 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch h-14">
          {TABS_BEFORE.map(renderTab)}
          <button
            onClick={() => setShowQuickActions(true)}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <span className="relative -mt-8 active:scale-95 transition-all">
              <Logo className="w-11 h-14" />
            </span>
          </button>
          {TABS_AFTER.map(renderTab)}
        </div>
      </nav>

      {/* Quick Actions sheet — the 5 quiz/content modes + Kana Practice up top,
          Sensei and Mini Games (no longer their own tabs) under Pages below. */}
      {showQuickActions && (
        <>
          <div
            className="fixed inset-0 z-[240] bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setShowQuickActions(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[241] bg-white rounded-t-3xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto md:hidden"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-5">
              <p className="text-lg font-black text-slate-800">Quick Actions</p>
              <button onClick={() => setShowQuickActions(false)} className="text-slate-400 hover:text-slate-600 active:scale-90 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {QUICK_ACTIONS.map(renderQuickActionTile)}
            </div>

            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Pages</p>
            <div className="grid grid-cols-3 gap-3">
              {QUICK_ACTION_PAGES.map(renderQuickActionTile)}
            </div>
          </div>
        </>
      )}

      {user?.id && defaultDeckId && (
        <AddWordsSheet
          userId={user.id}
          deckId={defaultDeckId}
          isAdmin={isAdmin}
          blocklist={blocklist}
          open={showAddCards}
          onClose={() => setShowAddCards(false)}
        />
      )}
    </>
  );
}

export default function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
