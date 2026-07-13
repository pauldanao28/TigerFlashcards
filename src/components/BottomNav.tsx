"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BookOpen, ScrollText, BarChart2 } from "lucide-react";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { useAppAlert } from "@/context/AlertContext";

type Tab = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
  kanji?: string;
};

const TABS: Tab[] = [
  { href: "/",        label: "Home",    icon: Home },
  { href: "/study",   label: "Study",   icon: BookOpen },
  { href: "/quizzes", label: "Quizzes", icon: ScrollText },
  { href: "/sensei",  label: "Sensei",  kanji: "先生" },
  { href: "/stats",   label: "Profile", icon: BarChart2 },
];

const SHOW_ON = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const { isBusy } = useUploadGuard();
  const { showConfirm } = useAppAlert();
  if (!SHOW_ON.has(path)) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[200] bg-white/95 backdrop-blur-sm border-t border-slate-100 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-14">
        {TABS.map((tab) => {
          const active = path === tab.href;
          const color = active ? "text-indigo-600" : "text-slate-400";
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={(e) => {
                if (tab.href === path) return;
                if (isBusy) {
                  // Native confirm() blocks synchronously so preventDefault can act on its
                  // result right away; our custom confirm is async, so we always cancel the
                  // Link's default navigation first and re-navigate manually if confirmed.
                  e.preventDefault();
                  showConfirm(
                    "A batch upload is still running — leave anyway? It won't be cancelled, but you won't see the result.",
                    { title: "Leave this page?", confirmLabel: "Leave", cancelLabel: "Stay" }
                  ).then((ok) => { if (ok) router.push(tab.href); });
                }
              }}
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
        })}
      </div>
    </nav>
  );
}
