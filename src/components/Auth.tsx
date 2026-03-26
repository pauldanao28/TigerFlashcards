"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";

export default function Auth() {
  const { t, lang, setLang } = useLang();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let error;

    if (isResetting) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/update-password` },
      );
      error = resetError;
      if (!error) alert("Check your email for the reset link!");
    } else if (isRegistering) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      error = signUpError;
      if (!error) alert("Check your email for the confirmation link!");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
    }

    if (error) alert(error.message);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) alert(error.message);
  };

  const handleFacebookLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: window.location.origin,
        scopes: "public_profile,email",
      },
    });
    if (error) alert(error.message);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="mb-8 scale-90">
        <LanguageToggle language={lang} setLanguage={setLang} />
      </div>

      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
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
            className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {!isResetting && (
            <input
              type="password"
              placeholder={t.password_placeholder}
              className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50"
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
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 py-3 rounded-xl font-bold border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
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
                className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white py-3 rounded-xl font-bold shadow-sm hover:bg-[#166fe5] active:scale-[0.98] transition-all"
              >
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
    </div>
  );
}
