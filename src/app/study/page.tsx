"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyView from "@/components/StudyView";
import LoadingScreen from "@/components/LoadingScreen";

export default function StudyPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  if (!ready) return <LoadingScreen />;
  return <StudyView />;
}
