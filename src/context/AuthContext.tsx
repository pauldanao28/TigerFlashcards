"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase, PW_RECOVERY_KEY } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active sessions on load
    const getSession = async () => {
      const timeout = setTimeout(() => setLoading(false), 5000);
      try {
        // A brand-new signup's email confirmation link redirects here (no
        // emailRedirectTo override is passed to signUp, so it lands on the
        // project's default Site URL) carrying ?code=... if the project's
        // auth flow is PKCE — same as Google/Facebook sign-in needing an
        // explicit exchangeCodeForSession (/auth/callback) and password
        // recovery needing the same fix on /update-password. The plain
        // client's detectSessionInUrl only auto-handles the legacy implicit
        // flow's #access_token= hash, never a PKCE code — without this, a
        // freshly-confirmed account lands here with no session ever
        // established, sees the logged-out Welcome screen instead of the
        // app, and has no way in short of realizing they need to manually
        // log in again with the password they just set.
        // /update-password exchanges its own recovery ?code= — exchanging it here
        // too would race it for the same one-time code, and the loser fails.
        const code = new URLSearchParams(window.location.search).get("code");
        if (code && window.location.pathname !== "/update-password") {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setUser(data.session?.user ?? null);
            window.history.replaceState({}, "", window.location.pathname);
            return;
          }
          console.error("Email-confirmation code exchange failed:", error.message);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user ?? null);

        // A reset link whose redirect wasn't allowed lands on the Site URL instead
        // of /update-password — the user is signed in by the link but would never
        // see the form to actually set a new password. Send them there.
        let recovering = false;
        try {
          recovering = sessionStorage.getItem(PW_RECOVERY_KEY) === "1";
        } catch {}
        if (session && recovering && window.location.pathname !== "/update-password") {
          window.location.replace("/update-password");
          return;
        }
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    };

    getSession();

    // 2. Listen for changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
