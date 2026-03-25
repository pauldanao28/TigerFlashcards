"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";
import Link from "next/link";

export default function AdminDashboard() {
  const { t, lang } = useLang();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"cards" | "system">("cards");
  const [view, setView] = useState<"pending" | "resolved" | "ignored">(
    "pending",
  );
  const [systemFeedbacks, setSystemFeedbacks] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    english: "",
    reading: "",
    partOfSpeech: "",
    exampleJp: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);

    if (activeTab === "cards") {
      const { data } = await supabase
        .from("card_reports")
        .select(
          `*, master_cards (*), reporter:profiles!user_id (email), resolver:profiles!resolved_by (email)`,
        )
        .eq("status", view)
        .order(view === "pending" ? "created_at" : "resolved_at", {
          ascending: false,
        });
      setReports(data || []);
    } else {
      const { data } = await supabase
        .from("system_feedback")
        .select(
          `*, reporter:profiles!user_id (email), resolver:profiles!resolved_by (email)`,
        )
        .eq(
          "status",
          view === "pending"
            ? "open"
            : view === "resolved"
              ? "closed"
              : "ignored",
        )
        .order("created_at", { ascending: false });
      setSystemFeedbacks(data || []);
    }
    setLoading(false);
  }, [activeTab, view]);

  // 2. Update fetchReports to log errors
  const fetchReports = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Check Admin Status
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.is_admin) {
      console.error("Admin check failed:", profileErr);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    // 3. FETCH DATA WITH THE NEW EMAIL COLUMN
    const { data, error } = await supabase
      .from("card_reports")
      .select(
        `
      *,
      master_cards (*),
      reporter:profiles!user_id (email),
      resolver:profiles!resolved_by (email)
    `,
      )
      .eq("status", view) // Dynamically switch based on the 'view' state
      .order(view === "pending" ? "created_at" : "resolved_at", {
        ascending: false,
      });

    if (!error) setReports(data || []);
    setLoading(false);
  }, [view]); // Refetch whenever the view changes

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateFeedbackStatus = async (id: string, newStatus: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("No user found");
      return;
    }

    const { error } = await supabase
      .from("system_feedback")
      .update({
        status: newStatus.toLowerCase(), // Always force lowercase for the DB check
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Update failed:", error.message);
      alert(`Failed to update: ${error.message}`);
    } else {
      fetchData();
    }
  };

  // Starts the manual edit mode and pre-fills the form
  const startManualEdit = (report: any) => {
    setEditingId(report.id);
    setEditForm({
      english: report.suggested_meaning || report.master_cards.english,
      reading: report.master_cards.reading || "",
      partOfSpeech: report.master_cards.partOfSpeech || "noun",
      exampleJp: report.master_cards.exampleSentence?.jp || "",
    });
  };

  const handleManualSave = async (reportId: string, cardId: string) => {
    // 1. Get current admin ID
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: cardError } = await supabase
      .from("master_cards")
      .update({
        english: editForm.english,
        reading: editForm.reading,
        partOfSpeech: editForm.partOfSpeech,
        exampleSentence: { jp: editForm.exampleJp, en: "" }, // Keeps original structure
      })
      .eq("id", cardId);

    if (cardError) return alert("Update failed: " + cardError.message);

    // 3. Mark as resolved AND track WHO did it
    await supabase
      .from("card_reports")
      .update({
        status: "resolved",
        resolved_by: user.id, // Track the admin
        resolved_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    setReports((prev) => prev.filter((r) => r.id !== reportId));
    setEditingId(null);
  };

  const handleIgnore = async (reportId: string) => {
    const { error } = await supabase
      .from("card_reports")
      .update({ status: "ignored" })
      .eq("id", reportId);
    if (!error) setReports((prev) => prev.filter((r) => r.id !== reportId));
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <p className="font-black text-slate-300 animate-pulse tracking-widest uppercase">
          {t.securing_session}
        </p>
      </div>
    );

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* TOP LEVEL NAVIGATION (Cards vs System) */}
        <div className="flex bg-slate-200/50 p-1.5 rounded-2xl w-fit mb-8 border border-slate-200">
          <button
            onClick={() => setActiveTab("cards")}
            className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === "cards" ? "bg-slate-900 text-white shadow-lg" : "text-slate-500 hover:text-slate-700"}`}
          >
            📇 Card Reports
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === "system" ? "bg-slate-900 text-white shadow-lg" : "text-slate-500 hover:text-slate-700"}`}
          >
            💬 System Feedback
          </button>
        </div>

        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              🚩 {activeTab === "cards" ? t.admin_title : "General Feedback"}
              <span className="text-sm bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-bold">
                {activeTab === "cards"
                  ? reports.length
                  : systemFeedbacks.length}
              </span>
            </h1>

            {/* STATUS TOGGLE TABS */}
            <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl mt-4 w-fit border border-slate-200">
              <button
                onClick={() => setView("pending")}
                className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${view === "pending" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Pending
              </button>
              <button
                onClick={() => setView("resolved")}
                className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${view === "resolved" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Resolved
              </button>
              <button
                onClick={() => setView("ignored")}
                className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${view === "ignored" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Ignored
              </button>
            </div>
          </div>

          <Link
            href="/stats"
            className="bg-white px-5 py-2.5 rounded-xl shadow-sm font-bold text-indigo-600 border border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
          >
            ← {t.back}
          </Link>
        </div>

        {/* REPORTS LIST */}
        <div className="grid gap-6">
          {activeTab === "cards" ? (
            /* EXISTING CARD REPORTS MAPPING */
            reports.length === 0 ? (
              <div className="bg-white p-12 rounded-[2.5rem] text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold">
                  No {view} reports found.
                </p>
              </div>
            ) : (
              reports.map((report) => (
                <div
                  key={report.id}
                  className={`bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border transition-all ${view !== "pending" ? "opacity-80 border-slate-200" : "border-slate-100 hover:shadow-md"}`}
                >
                  {/* ... (Keep your existing Card Top Bar, Form, and Data View exactly as they are) ... */}
                  {/* TOP BAR */}
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
                    <div className="flex-1">
                      <p className="text-5xl font-black text-slate-800 tracking-tighter mb-2">
                        {report.master_cards?.japanese}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-black uppercase tracking-widest">
                            Reporter
                          </span>
                          <p className="text-xs font-bold text-slate-600">
                            {report.reporter?.email || "Anonymous"}
                          </p>
                        </div>

                        {/* NEW: Created Date Badge */}
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                          <span className="text-[9px] text-slate-300 font-black uppercase tracking-widest">
                            Created
                          </span>
                          <p className="text-xs font-bold text-slate-400">
                            {new Date(report.created_at).toLocaleDateString()}
                          </p>
                        </div>

                        {view !== "pending" && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest ${view === "resolved" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}
                            >
                              {view === "resolved"
                                ? "Resolved by"
                                : "Ignored by"}
                            </span>
                            <p className="text-xs font-bold text-slate-600">
                              {report.resolver?.email || "Admin"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-2xl w-full md:w-64 border ${view === "ignored" ? "bg-slate-50 border-slate-100" : "bg-rose-50 border-rose-100"}`}
                    >
                      <p
                        className={`text-[10px] font-black uppercase tracking-tighter mb-1 ${view === "ignored" ? "text-slate-400" : "text-rose-400"}`}
                      >
                        User Suggestion
                      </p>
                      <p
                        className={`font-bold text-sm leading-tight italic ${view === "ignored" ? "text-slate-500" : "text-rose-700"}`}
                      >
                        "{report.suggested_meaning}"
                      </p>
                    </div>
                  </div>

                  {editingId === report.id ? (
                    /* MANUAL EDIT FORM */
                    <div className="bg-slate-50 p-6 rounded-[2rem] grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                          Meaning (English)
                        </label>
                        <input
                          value={editForm.english}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              english: e.target.value,
                            })
                          }
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                          Reading (Hiragana)
                        </label>
                        <input
                          value={editForm.reading}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              reading: e.target.value,
                            })
                          }
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                          Part of Speech
                        </label>
                        <select
                          value={editForm.partOfSpeech}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              partOfSpeech: e.target.value,
                            })
                          }
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none"
                        >
                          <option value="noun">Noun</option>
                          <option value="verb">Verb</option>
                          <option value="adj">Adjective</option>
                          <option value="adv">Adverb</option>
                          <option value="phrase">Phrase</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                          Example (JP)
                        </label>
                        <input
                          value={editForm.exampleJp}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              exampleJp: e.target.value,
                            })
                          }
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="md:col-span-2 flex gap-3 pt-4">
                        <button
                          onClick={() =>
                            handleManualSave(report.id, report.master_cards.id)
                          }
                          className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all"
                        >
                          Save & Resolve
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-8 bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs hover:bg-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* DATA VIEW */
                    <div className="flex flex-col md:flex-row items-stretch gap-4">
                      <div className="flex-1 bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest block mb-1">
                            Current English
                          </span>
                          <p className="text-slate-700 font-bold leading-tight">
                            {report.master_cards.english}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest block mb-1">
                            Reading
                          </span>
                          <p className="text-slate-700 font-bold leading-tight">
                            {report.master_cards.reading || "—"}
                          </p>
                        </div>
                      </div>
                      {view === "pending" && (
                        <div className="flex gap-2 min-w-fit">
                          <button
                            onClick={() => startManualEdit(report)}
                            className="flex-1 md:px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                          >
                            Edit Manually
                          </button>
                          <button
                            onClick={() => handleIgnore(report.id)}
                            className="px-5 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                          >
                            Ignore
                          </button>
                        </div>
                      )}
                      {view !== "pending" && (
                        <div className="flex flex-col justify-center px-6 text-right border-l border-slate-100">
                          <span className="text-[9px] text-slate-300 font-black uppercase tracking-widest">
                            Completed At
                          </span>
                          <p className="text-xs font-bold text-slate-400">
                            {new Date(report.resolved_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )
          ) : /* NEW SYSTEM FEEDBACK MAPPING */
          systemFeedbacks.length === 0 ? (
            <div className="bg-white p-12 rounded-[2.5rem] text-center border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-bold">
                No {view} system feedback found.
              </p>
            </div>
          ) : (
            systemFeedbacks.map((fb) => (
              <div
                key={fb.id}
                className={`bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border transition-all ${view !== "pending" ? "opacity-80 border-slate-200" : "border-slate-100 hover:shadow-md"}`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${fb.type === "bug" ? "bg-rose-100 text-rose-600" : fb.type === "feature" ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}
                      >
                        {fb.type}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                      {fb.subject}
                    </h3>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-black uppercase tracking-widest">
                          Reporter
                        </span>
                        <p className="text-xs font-bold text-slate-600">
                          {fb.reporter?.email || "Anonymous"}
                        </p>
                      </div>

                      {/* NEW: Created Date Badge */}
                      <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                        <span className="text-[9px] text-slate-300 font-black uppercase tracking-widest">
                          Created
                        </span>
                        <p className="text-xs font-bold text-slate-400">
                          {new Date(fb.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {view !== "pending" && (
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest ${view === "resolved" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}
                          >
                            {view === "resolved" ? "Handled by" : "Ignored by"}
                          </span>
                          <p className="text-xs font-bold text-slate-600">
                            {fb.resolver?.email || "Admin"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-6 text-slate-600 font-medium leading-relaxed">
                  {fb.description}
                </div>

                {view === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateFeedbackStatus(fb.id, "closed")}
                      className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all active:scale-95"
                    >
                      Mark Resolved
                    </button>
                    <button
                      onClick={() => updateFeedbackStatus(fb.id, "ignored")}
                      className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-rose-500 transition-all"
                    >
                      Ignore
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center text-left">
                    <span className="text-[9px] text-slate-300 font-black uppercase tracking-widest">
                      Actioned On
                    </span>
                    <p className="text-xs font-bold text-slate-400">
                      {new Date(fb.resolved_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
