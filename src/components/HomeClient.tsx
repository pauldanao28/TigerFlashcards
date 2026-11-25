"use client";
import { useAuth } from "@/context/AuthContext";
import Dashboard from "@/components/Dashboard";
import WelcomeView from "@/components/WelcomeView";

export default function HomeClient() {
  const { user, loading } = useAuth();

  if (loading && !user) {
    return <div className="mx-auto max-w-5xl px-5 pt-8" aria-busy="true"><h1 className="text-2xl font-black italic">Home</h1><div className="mt-5 h-24 rounded-2xl bg-slate-100 animate-pulse" /><div className="mt-4 h-32 rounded-2xl bg-slate-100 animate-pulse" /></div>;
  }

  return user ? <Dashboard key={user.id} /> : <WelcomeView />;
}
