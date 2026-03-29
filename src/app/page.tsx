"use client";
import { useAuth } from "@/context/AuthContext";
import StudyView from "@/components/StudyView"; // Your big flashcard UI
import WelcomeView from "@/components/WelcomeView"; // Your new landing UI
import LoadingScreen from "@/components/LoadingScreen";

export default function Home() {
  const { user, loading } = useAuth();

  // Show a clean loading state while checking Supabase
  if (loading) {
    return <LoadingScreen />;
  }

  return user ? <StudyView /> : <WelcomeView />;
}
