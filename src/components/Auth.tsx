"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/languages";
import { processReferral } from "@/lib/social";
import { useAppAlert } from "@/context/AlertContext";
import Logo from "./Logo";
import { Eye, EyeOff } from "lucide-react";

export default function Auth() {
  const router = useRouter();
  const t = translations.en;
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
    <div className="fixed inset-0 h-[100dvh] w-full bg-white flex flex-col items-center justify-center px-6 overflow-hidden">

      {/* Logo + wordmark */}
      <div className="flex flex-col items-center mb-8">
        <Logo className="w-10 h-14 mb-4 opacity-90" />
        <h1 className="text-[2.2rem] font-black text-slate-900 uppercase tracking-tighter italic leading-none">
          FlashKado
        </h1>
        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-indigo-400 mt-1.5">
          {isResetting ? "Reset Password" : isRegistering ? "Create Account" : "Welcome back"}
        </p>
      </div>

      {/* Form */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          className="w-full px-4 py-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {!isResetting && (
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              className="w-full px-4 py-4 pr-12 rounded-2xl bg-slate-50 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-[1.1rem] rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.97] transition-all disabled:opacity-50 mt-1"
        >
          {loading
            ? "Processing..."
            : isResetting
              ? "Send Reset Link"
              : isRegistering
                ? "Create Account"
                : "Sign In"}
        </button>

        {!isResetting && (
          <>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                  or continue with
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-sm text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all shadow-sm"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleFacebookLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-sm text-white bg-[#1877F2] hover:bg-[#166fe5] active:scale-[0.98] transition-all shadow-sm"
            >
              <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Continue with Facebook
            </button>
          </>
        )}

        {/* Footer links */}
        <div className="flex flex-col items-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setIsResetting(false); }}
            className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
          >
            {isRegistering ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          <button
            type="button"
            onClick={() => { setIsResetting(!isResetting); setIsRegistering(false); }}
            className="text-[10px] font-bold text-slate-300 hover:text-rose-400 transition-colors"
          >
            {isResetting ? "Back to sign in" : "Forgot password?"}
          </button>
        </div>
      </div>
    </div>
  );
}
