"use client";
import { useAuth } from "@/context/AuthContext";
import Dashboard from "@/components/Dashboard";
import WelcomeView from "@/components/WelcomeView";
import LoadingScreen from "@/components/LoadingScreen";

export default function HomeClient() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return user ? <Dashboard /> : <WelcomeView />;
}
