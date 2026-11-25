"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const PersistentCards = dynamic(() => import("@/app/stats/page"), { ssr: false, loading: () => <div className="px-5 pt-8"><h1 className="text-2xl font-black italic">Cards</h1></div> });
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";

const SIDEBAR_PATHS = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

export default function SidebarOffsetWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const path = usePathname();
  const cardsActive = path === "/stats";
  const [visitedAccount, setVisitedAccount] = useState<string | null>(null);
  useEffect(() => {
    if (!user) setVisitedAccount(null);
    else if (cardsActive) setVisitedAccount(user.id);
  }, [cardsActive, user?.id]);
  const keepCards = !!user && (cardsActive || visitedAccount === user.id);
  const hasSidebar = SIDEBAR_PATHS.has(path) && !loading && !!user;
  return (
    <div className={hasSidebar ? "md:pl-56" : ""}>
      {keepCards && <div key={user?.id} hidden={!cardsActive} style={{ display: cardsActive ? undefined : "none" }}><PersistentCards /></div>}
      {(!cardsActive || !user) && children}
    </div>
  );
}
