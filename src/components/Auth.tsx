"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = isRegistering 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) alert(error.message);
    else if (isRegistering) alert("Check your email for the confirmation link!");
    
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <h1 className="text-2xl font-black text-slate-800 mb-6 text-center">
          {isRegistering ? "Create Account" : "Welcome Back"}
        </h1>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <input 
            type="email" placeholder="Email"
            className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={email} onChange={(e) => setEmail(e.target.value)} required
          />
          <input 
            type="password" placeholder="Password"
            className="w-full p-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={password} onChange={(e) => setPassword(e.target.value)} required
          />
          <button 
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {loading ? "Processing..." : isRegistering ? "Register" : "Login"}
          </button>
        </form>

        <button 
          onClick={() => setIsRegistering(!isRegistering)}
          className="w-full mt-6 text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors"
        >
          {isRegistering ? "Already have an account? Login" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}