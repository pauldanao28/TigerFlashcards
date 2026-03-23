"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";
import Link from "next/link"; // 1. Added Link import

export default function AdminDashboard() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLang();

  const ADMIN_EMAIL = "paul@a.com";

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("card_reports")
      .select(
        `
        *,
        master_cards (
          id,
          japanese,
          english
        )
      `,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error && data) setReports(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || user.email !== ADMIN_EMAIL) {
        window.location.href = "/";
      } else {
        await fetchReports();
      }
    };
    checkAdminAndFetch();
  }, [fetchReports]);

  const handleApplyFix = async (
    reportId: string,
    cardId: string | undefined,
    newMeaning: string,
  ) => {
    if (!cardId) return alert("Error: Card ID is missing.");

    // 1. Update the actual Flashcard
    const { error: cardError } = await supabase
      .from("master_cards")
      .update({ english: newMeaning })
      .eq("id", cardId);

    if (cardError) return alert(`Failed to update card: ${cardError.message}`);

    // 2. Mark the report as resolved in DB
    const { error: reportError } = await supabase
      .from("card_reports")
      .update({ status: "resolved" })
      .eq("id", reportId);

    if (!reportError) {
      // 3. UI FIX: Remove it from the local state list immediately
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } else {
      alert("Card updated, but failed to close the report.");
    }
  };

  const handleIgnore = async (reportId: string) => {
    const { error } = await supabase
      .from("card_reports")
      .update({ status: "ignored" })
      .eq("id", reportId);

    if (!error) {
      // REMOVE FROM UI IMMEDIATELY
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } else {
      alert("Failed to ignore report.");
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="font-black text-slate-400 animate-pulse uppercase tracking-widest">
          {t.processing}
        </div>
      </div>
    );

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* 2. Added Header with Back Button */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              🚩 {t.admin_title}
              <span className="text-sm bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-bold">
                {reports.length}
              </span>
            </h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">
              {t.system_management}
            </p>
          </div>

          <Link
            href="/stats" // Adjust this to your stats page path
            className="bg-white px-5 py-2.5 rounded-xl shadow-sm font-bold text-indigo-600 border border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
          >
            ← {t.back}
          </Link>
        </div>

        {reports.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] text-center border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-bold">{t.no_reports}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-6 hover:shadow-md transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex-1">
                    {/* BIG KANJI HERE */}
                    <p className="text-4xl font-black text-slate-800 mb-4 tracking-tighter">
                      {report.master_cards?.japanese}
                    </p>

                    <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex-1">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">
                          {t.current_meaning}
                        </span>
                        <p className="text-slate-600 font-medium italic">
                          {report.master_cards?.english}
                        </p>
                      </div>

                      <div className="text-indigo-300 font-bold text-xl">→</div>

                      <div className="flex-1 text-right md:text-left">
                        <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest block mb-1">
                          {t.suggested_fix}
                        </span>
                        <p className="text-emerald-700 font-black text-lg">
                          {report.suggested_meaning}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center">
                    <button
                      onClick={() => handleIgnore(report.id)}
                      className="px-6 py-3 text-slate-400 font-bold text-sm hover:text-rose-500 transition-colors"
                    >
                      {t.ignore_fix}
                    </button>
                    <button
                      onClick={() =>
                        handleApplyFix(
                          report.id,
                          report.master_cards?.id, // Ensure this ID is coming through
                          report.suggested_meaning,
                        )
                      }
                      className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 active:scale-95 transition-all hover:bg-emerald-600"
                    >
                      {t.approve_fix}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
