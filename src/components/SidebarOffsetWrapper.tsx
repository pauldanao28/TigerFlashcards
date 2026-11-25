"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const PersistentCards = dynamic(() => import("@/app/stats/page"), { ssr: false, loading: () => <div className="px-5 pt-8"><h1 className="text-2xl font-black italic">Cards</h1></div> });
const PersistentHome = dynamic(() => import("@/components/HomeClient"), { ssr: false, loading: () => <div className="px-5 pt-8"><h1 className="text-2xl font-black italic">Home</h1></div> });
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";

const SIDEBAR_PATHS = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

export default function SidebarOffsetWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const path = usePathname();
  const cardsActive = path === "/stats";
  const homeActive = path === "/";
  const [homeAccount, setHomeAccount] = useState<string | null>(null);
  useEffect(() => {
    if (!user) setHomeAccount(null);
    else if (homeActive) setHomeAccount(user.id);
  }, [homeActive, user?.id]);
  const keepHome = !!user && (homeActive || homeAccount === user.id);
  const [visitedAccount, setVisitedAccount] = useState<string | null>(null);
  useEffect(() => {
    if (!user) setVisitedAccount(null);
    else if (cardsActive) setVisitedAccount(user.id);
  }, [cardsActive, user?.id]);
  const keepCards = !!user && (cardsActive || visitedAccount === user.id);
  const hasSidebar = SIDEBAR_PATHS.has(path) && !loading && !!user;
  return (
    <div className={hasSidebar ? "md:pl-56" : ""}>
      {keepCards && <div key={`cards-${user?.id}`} hidden={!cardsActive} style={{ display: cardsActive ? undefined : "none" }}><PersistentCards /></div>}
      {keepHome && <div key={`home-${user?.id}`} hidden={!homeActive} style={{ display: homeActive ? undefined : "none" }}><PersistentHome /></div>}
      {(!user || (!cardsActive && !homeActive)) && children}
    </div>
  );
}
