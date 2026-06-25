"use client";
import { useAuth } from "@/context/AuthContext";
import StudyView from "@/components/StudyView";
import WelcomeView from "@/components/WelcomeView";
import LoadingScreen from "@/components/LoadingScreen";

export default function HomeClient() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return user ? <StudyView /> : <WelcomeView />;
}
