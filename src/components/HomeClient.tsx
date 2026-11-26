"use client";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/context/AuthContext";
import Dashboard from "@/components/Dashboard";
import WelcomeView from "@/components/WelcomeView";

export default function HomeClient() {
  const { user, loading } = useAuth();

  if (loading && !user) {
    return <LoadingScreen />;
  }

  return user ? <Dashboard key={user.id} /> : <WelcomeView />;
}
