"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useLang } from "@/context/LanguageContext";
import { useAppAlert } from "@/context/AlertContext";

export default function UpdatePassword() {
  const router = useRouter();
  const { t } = useLang();
  const { showAlert } = useAppAlert();

  // States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [isSocialUser, setIsSocialUser] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // 1. Check if they are a social login user
      if (session?.user?.app_metadata?.provider !== "email" && session) {
        setIsSocialUser(true);
      }

      // 2. Listen for the recovery event or active sessions
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, currentSession) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsRecovery(true);
        }
        // If not in recovery mode AND no active session, boot to login
        if (event !== "PASSWORD_RECOVERY" && !currentSession) {
          router.push("/");
        }
        setCheckingAuth(false);
      });

      return () => subscription.unsubscribe();
    };

    initAuth();
  }, [router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Logic: If they are logged in normally (not via recovery link), verify current password
    if (!isRecovery && !isSocialUser) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        await showAlert(t.wrong_password);
        setLoading(false);
        return;
      }
    }

    // Update to the new password
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      await showAlert(error.message);
    } else {
      await showAlert(t.password_updated_success);
      router.push("/");
    }
    setLoading(false);
  };

  // Prevent flicker while checking session
  if (checkingAuth) return null;

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-4 overflow-hidden overscroll-none">
      {/* Main Card */}
      <div className="w-full max-w-md bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-300">
        <h1 className="text-2xl font-black text-slate-800 mb-2 text-center italic uppercase tracking-tighter">
          {isSocialUser
            ? t.account_security
            : isRecovery
              ? t.reset_password
              : t.change_password}
        </h1>

        <p className="text-slate-400 text-xs font-medium text-center mb-8 uppercase tracking-widest">
          {isSocialUser
            ? t.social_managed
            : isRecovery
              ? t.set_new_creds
              : t.confirm_to_update}
        </p>

        {isSocialUser ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-100 font-medium">
              You are signed in with a social provider. You can manage your
              password settings through their platform.
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg hover:bg-slate-900 transition-all active:scale-[0.98]"
            >
              {t.back_home}
            </button>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4">
            {/* Show Current Password field only if Logged In (Not Recovery) */}
            {!isRecovery && (
              <div className="relative w-full">
                <input
                  type={showPasswords ? "text" : "password"}
                  placeholder={t.current_password_placeholder}
                  className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {/* New Password Field */}
            <div className="relative w-full">
              <input
                type={showPasswords ? "text" : "password"}
                placeholder={t.new_password_placeholder}
                className="w-full p-4 pr-12 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
              >
                {showPasswords ? (
                  <span className="text-lg">👁️</span>
                ) : (
                  <span className="text-lg">🔒</span>
                )}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.processing}
                </>
              ) : (
                t.save_password
              )}
            </button>
          </form>
        )}

        <button
          onClick={() => router.push("/")}
          className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-slate-500 transition-colors text-center"
        >
          {t.cancel_btn}
        </button>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        body {
          overflow: hidden;
          overscroll-behavior: none;
        }
      `}</style>
    </div>
  );
}
