"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import StudyView from "@/components/StudyView";
import LoadingScreen from "@/components/LoadingScreen";

function StudyPageInner() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const compact = searchParams.get("mini") === "1";

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <LoadingScreen />;
  return <StudyView compact={compact} />;
}

export default function StudyPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StudyPageInner />
    </Suspense>
  );
}
