"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { validateUsername, isUsernameTaken, type UsernameProblem } from "@/lib/username";

const MESSAGES: Record<UsernameProblem | "error", string> = {
  too_short: "Too short! (Min 2)",
  too_long: "Too long! (Max 10)",
  no_spaces: "No spaces allowed!",
  taken: "Already taken! Try another.",
  error: "Connection error. Try again.",
};

// Mounted once in the root layout. On the first load of each browser session for a
// signed-in user, calls ensure_user_setup to create a missing profile/default deck
// (reloading once if it had to, so pages pick up the new deck), and asks onboarded
// users who still have no real username to choose one.
export default function AccountSetupGuard() {
  const { user } = useAuth();
  const [needsUsername, setNeedsUsername] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = `account_setup_checked_${user.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}

    supabase.rpc("ensure_user_setup").then(({ data, error }) => {
      if (error) {
        console.error("ensure_user_setup failed:", error.message);
        return;
      }
      try {
        sessionStorage.setItem(key, "1");
      } catch {}
      if (data?.created_profile || data?.created_deck) {
        window.location.reload();
        return;
      }
      if (data?.needs_username) {
        setName((user.user_metadata?.full_name || user.user_metadata?.name || "").replace(/\s+/g, "").slice(0, 10));
        setNeedsUsername(true);
      }
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    const problem = validateUsername(name);
    if (problem) return setError(MESSAGES[problem]);
    setSaving(true);
    setError(null);
    try {
      if (await isUsernameTaken(name, user.id)) return setError(MESSAGES.taken);
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() })
        .eq("id", user.id);
      if (updateErr) return setError(updateErr.code === "23505" ? MESSAGES.taken : MESSAGES.error);
      setNeedsUsername(false);
      window.location.reload();
    } catch {
      setError(MESSAGES.error);
    } finally {
      setSaving(false);
    }
  };

  if (!needsUsername) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl flex flex-col gap-4">
        <div className="text-center">
          <p className="text-4xl mb-2">👋</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">One quick thing</p>
          <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter mt-1">Pick a username</h2>
          <p className="text-xs text-slate-500 mt-2">This is how friends find you and how you appear in the Study Circle.</p>
        </div>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && save()}
          maxLength={10}
          autoFocus
          placeholder="USERNAME"
          className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-4 text-center text-lg font-black uppercase tracking-widest focus:bg-white focus:border-black outline-none transition-all placeholder:text-slate-300"
        />
        {error && <p className="text-center text-xs font-bold text-red-500">{error}</p>}
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save →"}
        </button>
      </div>
    </div>
  );
}
