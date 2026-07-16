"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, ScrollText, BarChart2 } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { href: "/",        label: "Home",    Icon: Home,       kanji: null },
  { href: "/study",   label: "Study",   Icon: BookOpen,   kanji: null },
  { href: "/quizzes", label: "Quizzes", Icon: ScrollText, kanji: null },
  { href: "/sensei",  label: "Sensei",  Icon: null,       kanji: "先生" },
  { href: "/stats",   label: "Profile", Icon: BarChart2,  kanji: null },
] as const;

const SHOW_ON = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

export default function Sidebar() {
  const path = usePathname();
  const { user, loading } = useAuth();

  if (!SHOW_ON.has(path) || loading || !user) return null;

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-slate-100 z-50">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[72px] border-b border-slate-50 shrink-0">
        <Logo className="w-7 h-9 shrink-0" />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-black text-slate-900 tracking-tight">FlashKado</span>
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-400 mt-0.5">日本語</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 flex flex-col gap-0.5">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 px-3 mb-2">Menu</p>
        {TABS.map(({ href, label, Icon, kanji }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                active
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {kanji ? (
                <span className={`text-[14px] font-black w-[18px] text-center leading-none shrink-0 ${active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`}>
                  {kanji}
                </span>
              ) : Icon ? (
                <Icon size={16} className="shrink-0" />
              ) : null}
              <span className="text-[13px] font-black tracking-wide">{label}</span>
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5 border-t border-slate-50">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">FlashKado · v1</p>
      </div>
    </aside>
  );
}
