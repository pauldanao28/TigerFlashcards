"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Auth() {
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
      // 1. Trigger Reset Email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/update-password`,
        },
      );
      error = resetError;
      if (!error) alert("Check your email for the reset link!");
    } else if (isRegistering) {
      // 2. Sign Up
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      error = signUpError;
      if (!error) alert("Check your email for the confirmation link!");
    } else {
      // 3. Login
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
    }

    if (error) alert(error.message);
    setLoading(false);
  };

  const handleFacebookLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: window.location.origin,
        // Explicitly define scopes to ensure they are valid
        scopes: "public_profile,email",
      },
    });

    if (error) alert(error.message);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <h1 className="text-2xl font-black text-slate-800 mb-6 text-center">
          {isResetting
            ? "Reset Password"
            : isRegistering
              ? "Create Account"
              : "Welcome to FlashKado!"}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {!isResetting && (
            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}

          <button
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {loading
              ? "Processing..."
              : isResetting
                ? "Send Reset Link"
                : isRegistering
                  ? "Register"
                  : "Login"}
          </button>
        </form>

        {/* --- ADD THIS: FACEBOOK LOGIN SECTION --- */}
        {!isResetting && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100"></span>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black">
                <span className="bg-white px-4 text-slate-300">
                  Or continue with
                </span>
              </div>
            </div>

            <button
              onClick={handleFacebookLogin}
              type="button"
              className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white py-3 rounded-xl font-bold shadow-md hover:bg-[#166fe5] active:scale-[0.98] transition-all"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </button>
          </>
        )}
        {/* --- END OF FACEBOOK SECTION --- */}

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-50 pt-6">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setIsResetting(false);
            }}
            className="text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors"
          >
            {isRegistering
              ? "Already have an account? Login"
              : "New here? Create an account"}
          </button>

          <button
            onClick={() => {
              setIsResetting(!isResetting);
              setIsRegistering(false);
            }}
            className="text-xs font-bold text-slate-300 hover:text-rose-500 transition-colors"
          >
            {isResetting ? "Back to Login" : "Forgot your password?"}
          </button>
        </div>
      </div>
    </div>
  );
}
