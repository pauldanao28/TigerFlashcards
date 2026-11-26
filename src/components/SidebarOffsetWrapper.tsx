"use client";
import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
const PersistentCards = dynamic(() => import("@/app/stats/page"), { ssr: false, loading: () => <div className="px-5 pt-8"><h1 className="text-2xl font-black italic">Cards</h1></div> });
const PersistentHome = dynamic(() => import("@/components/HomeClient"), { ssr: false, loading: () => <div className="px-5 pt-8"><h1 className="text-2xl font-black italic">Home</h1></div> });
import { useAuth } from "@/context/AuthContext";
import { usePathname, useSearchParams } from "next/navigation";

const SIDEBAR_PATHS = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

const PersistentStudy = dynamic(() => import("@/app/study/page"), { ssr: false });
const PersistentPractice = dynamic(() => import("@/app/quizzes/page"), { ssr: false });

export default function SidebarOffsetWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={children}><RetainedTabs>{children}</RetainedTabs></Suspense>;
}

function RetainedTabs({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const path = usePathname();
  useEffect(() => {
    if (!/Android/i.test(navigator.userAgent) || (path !== "/stats" && path !== "/study")) return;
    const roots = [document.documentElement, document.body];
    const previous = roots.map(el => ({ value: el.style.getPropertyValue("overscroll-behavior-y"), priority: el.style.getPropertyPriority("overscroll-behavior-y") }));
    roots.forEach(el => el.style.setProperty("overscroll-behavior-y", "none"));
    return () => roots.forEach((el, i) => {
      if (previous[i].value) el.style.setProperty("overscroll-behavior-y", previous[i].value, previous[i].priority);
      else el.style.removeProperty("overscroll-behavior-y");
    });
  }, [path]);
  const params = useSearchParams();
  const mini = path === "/study" && params.get("mini") === "1";
  const studyActive = path === "/study" && !mini;
  const practiceActive = path === "/quizzes";
  const [studyAccount, setStudyAccount] = useState<string | null>(null);
  const [practiceAccount, setPracticeAccount] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setStudyAccount(null); setPracticeAccount(null); }
    else {
      if (studyActive) setStudyAccount(user.id);
      if (practiceActive) setPracticeAccount(user.id);
    }
  }, [user?.id, studyActive, practiceActive]);
  const keepStudy = !!user && !mini && (studyActive || studyAccount === user.id);
  const keepPractice = !!user && (practiceActive || practiceAccount === user.id);
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
      {keepStudy && <div key={`study-${user?.id}`} hidden={!studyActive} style={{ display: studyActive ? undefined : "none" }}><PersistentStudy /></div>}
      {keepPractice && <div key={`practice-${user?.id}`} hidden={!practiceActive} style={{ display: practiceActive ? undefined : "none" }}><PersistentPractice /></div>}
      {(!user || (!cardsActive && !homeActive && !studyActive && !practiceActive)) && children}
    </div>
  );
}
