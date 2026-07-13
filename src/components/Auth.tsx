"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import { processReferral } from "@/lib/social";
import { useAppAlert } from "@/context/AlertContext";

export default function Auth() {
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { showAlert } = useAppAlert();

  // States
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const getURL = () => {
    let url =
      process?.env?.NEXT_PUBLIC_SITE_URL ??
      process?.env?.NEXT_PUBLIC_VERCEL_URL ??
      window.location.origin;
    url = url.includes("http") ? url : `https://${url}`;
    return url;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let error;

    if (isResetting) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${getURL()}/update-password` },
      );
      error = resetError;
      if (!error) await showAlert("Check your email for the reset link!");
    } else if (isRegistering) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        // Nest the metadata inside the options object
        options: {
          data: {
            full_name: "",
            has_onboarded: false,
          },
        },
      });
      error = signUpError;
      if (!error && data.user) {
        localStorage.setItem("show_first_timer_hint", "true");

        // --- REFERRAL LOGIC START ---
        const refName = localStorage.getItem("tg_referrer");
        if (refName) {
          await processReferral(data.user.id, refName);
        }
        // --- REFERRAL LOGIC END ---

        if (data.user?.identities?.length === 0) {
          await showAlert("This email is already registered. Try logging in!");
        } else {
          await showAlert("Check your email for the confirmation link!");
        }
        router.push("/");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
      if (!error) {
        router.push("/");
      }
    }

    if (error) await showAlert(error.message);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${getURL()}/auth/callback` },
    });
    if (error) await showAlert(error.message);
  };

  const handleFacebookLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${getURL()}/auth/callback`,
        scopes: "public_profile,email",
      },
    });
    if (error) await showAlert(error.message);
  };

  return (
    // Centering Wrapper: Uses h-[100dvh] and flex to center the card on any screen
    <div className="fixed inset-0 h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-4 overflow-hidden overscroll-none">
      {/* Language Toggle: Floating above the card */}
      <div className="mb-6 w-48 h-10 flex-shrink-0 z-10">
        <LanguageToggle language={lang} setLanguage={setLang} />
      </div>

      {/* Main Auth Card: Max width keeps it from stretching on Desktop */}
      <div className="w-full max-w-md bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 overflow-y-auto max-h-[85dvh] flex flex-col no-scrollbar animate-in fade-in zoom-in-95 duration-300">
        <h1 className="text-2xl font-black text-slate-800 mb-6 text-center italic uppercase tracking-tighter">
          {isResetting
            ? t.reset_password
            : isRegistering
              ? t.create_account
              : t.welcome_message}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
          <input
            type="email"
            placeholder={t.email_placeholder}
            className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {!isResetting && (
            <div className="relative w-full">
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t.password_placeholder}
                className="w-full p-4 pr-12 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
              >
                {showPassword ? (
                  <span className="text-lg">👁️</span>
                ) : (
                  <span className="text-lg">🔒</span>
                )}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading
              ? t.processing
              : isResetting
                ? t.send_reset_link
                : isRegistering
                  ? t.register_button
                  : t.login_button}
          </button>
        </form>

        {!isResetting && (
          <div className="w-full">
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100"></span>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-black">
                <span className="bg-white px-4 text-slate-300">
                  {t.or_continue_with}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 py-3 rounded-2xl font-bold border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
                {/* Google Icon SVG */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>

              <button
                type="button"
                onClick={handleFacebookLogin}
                className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white py-3 rounded-2xl font-bold shadow-sm hover:bg-[#166fe5] active:scale-[0.98] transition-all"
              >
                {/* Facebook Icon SVG */}
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-50 pt-6">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setIsResetting(false);
            }}
            className="text-sm font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
          >
            {isRegistering ? t.switch_to_login : t.switch_to_register}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsResetting(!isResetting);
              setIsRegistering(false);
            }}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-rose-500 transition-colors"
          >
            {isResetting ? t.back_to_login : t.forgot_password_link}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
