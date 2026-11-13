"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";
import FriendDashboard from "@/components/FriendDashboard";

export default function FriendPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user || !params?.id) return <LoadingScreen />;
  return <FriendDashboard friendId={params.id} />;
}
