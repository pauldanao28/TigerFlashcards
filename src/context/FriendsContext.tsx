"use client";
import { createContext, useContext, ReactNode } from "react";
import { useFriends } from "@/hooks/useFriends";
import { useAuth } from "@/context/AuthContext";

// useFriends() itself was already written to be "shared by every page that
// renders SocialDock... so realtime subscriptions aren't duplicated per
// page", but Dashboard.tsx and StudyView.tsx each called the hook directly —
// so every navigation between Home and Study tore down and resubscribed its
// 3 Realtime channels (profiles, user_review_counts, friendships), not just
// once per session. Mounting the hook here, once, at the root layout, and
// having pages read from context instead, is what actually makes the
// subscriptions session-lived.
type FriendsContextType = ReturnType<typeof useFriends>;

const EMPTY_FRIENDS_CONTEXT: FriendsContextType = {
  friends: [],
  fetchFriends: async () => [],
  socialToast: null,
  dismissSocialToast: () => {},
};

const FriendsContext = createContext<FriendsContextType>(EMPTY_FRIENDS_CONTEXT);

function LiveFriendsProvider({ children }: { children: ReactNode }) {
  const value = useFriends();
  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // This sits in the root layout, above every route — signed-out visitors on
  // public pages (/login, /jlpt/[level], /join/[code], …) never read this
  // context, so useFriends()'s realtime subscriptions only mount once a user
  // is actually signed in, not for every anonymous page view.
  if (!user) return <FriendsContext.Provider value={EMPTY_FRIENDS_CONTEXT}>{children}</FriendsContext.Provider>;
  return <LiveFriendsProvider>{children}</LiveFriendsProvider>;
}

export function useFriendsContext() {
  return useContext(FriendsContext);
}
