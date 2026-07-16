"use client";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";

const SIDEBAR_PATHS = new Set(["/", "/study", "/quizzes", "/sensei", "/stats"]);

export default function SidebarOffsetWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const path = usePathname();
  const hasSidebar = SIDEBAR_PATHS.has(path) && !loading && !!user;
  return (
    <div className={hasSidebar ? "md:pl-56" : ""}>
      {children}
    </div>
  );
}
