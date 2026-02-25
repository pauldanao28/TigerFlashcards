"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FlashcardData } from '@/lib/types';
import { supabase } from '@/lib/supabase'; // Import Supabase

export default function StatsPage() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [input, setInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- 1. Fetch from Supabase instead of LocalStorage ---
  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setCards(data);
    if (error) console.error("Error fetching:", error);
  };

  // --- 2. Update processWords to save to Supabase ---
  const processWords = async (wordList: string[]) => {
  setLoading(true);
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({ words: wordList }), 
    });

    const items = await res.json();
    
    // Ensure items is always an array
    const dataToInsert = (Array.isArray(items) ? items : [items]).map((item) => ({
      ...item,
      // Manual fields for our logic
      score: 0,
      scores: {
        jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
        en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 }
      }
    }));

    const { error } = await supabase.from('flashcards').insert(dataToInsert);
    
    if (error) throw error; // This will now work if you did Step 1!

    fetchCards();
  } catch (e: any) {
    console.error("Insert failed:", e.message);
    alert(`Error: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  const deleteCard = async (id: string) => {
    if (!confirm("Delete this card?")) return;
    const { error } = await supabase.from('flashcards').delete().eq('id', id);
    if (!error) setCards(cards.filter(c => c.id !== id));
  };

  // --- 3. Mode-aware calculations ---
  // Calculate stats based on dual-mode average
const totalCards = cards.length;

// Mastered: Average score >= 80%
const masteredCards = cards.filter(c => {
  const avg = ((c.scores?.jp_to_en?.percent || 0) + (c.scores?.en_to_jp?.percent || 0)) / 2;
  return avg >= 80;
}).length;

// Struggling: Average score < 40% (Only counts if you've actually tried the card at least once)
const strugglingCards = cards.filter(c => {
  const hasTried = (c.scores?.jp_to_en?.total || 0) > 0 || (c.scores?.en_to_jp?.total || 0) > 0;
  const avg = ((c.scores?.jp_to_en?.percent || 0) + (c.scores?.en_to_jp?.percent || 0)) / 2;
  return hasTried && avg < 40;
}).length;

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Management Toolbar */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-2">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add new word..."
              className="flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button 
              onClick={() => processWords([input])}
              disabled={loading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "..." : "AI Add"}
            </button>
          </div>

          <button 
            onClick={() => setShowBatch(!showBatch)}
            className="px-6 py-2 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-colors"
          >
            {showBatch ? "Close" : "Batch Upload"}
          </button>
        </div>

        {/* Batch Area */}
        {showBatch && (
          <div className="mb-8 p-6 bg-indigo-50 rounded-3xl border-2 border-dashed border-indigo-200">
            <textarea 
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              className="w-full h-32 p-4 rounded-xl border-none outline-none mb-3"
              placeholder="Paste list here..."
            />
            <button 
              onClick={() => processWords(batchInput.split('\n').filter(l => l.trim()))}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold"
            >
              Process Words
            </button>
          </div>
        )}

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800">Learning Progress</h1>
          <Link href="/" className="bg-white px-4 py-2 rounded-xl shadow-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all">
            ← Back to Study
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
  <StatCard label="Total Vocabulary" value={totalCards} color="bg-indigo-500" />
  <StatCard label="Mastered (80%+)" value={masteredCards} color="bg-emerald-500" />
  <StatCard label="Struggling (<40%)" value={strugglingCards} color="bg-rose-500" />
</div>

        {/* Detailed Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Kanji / Reading</th>
                <th className="px-6 py-4">English</th>
                <th className="px-6 py-4">🇯🇵→🇺🇸 Score</th>
                <th className="px-6 py-4">🇺🇸→🇯🇵 Score</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cards.map((card) => (
                <tr key={card.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-lg text-slate-800">{card.japanese}</div>
                    <div className="text-xs text-indigo-500 font-medium">{card.reading}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{card.english}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">{card.scores?.jp_to_en?.percent || 0}%</div>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                       <div className="h-full bg-emerald-400" style={{ width: `${card.scores?.jp_to_en?.percent || 0}%` }} />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">{card.scores?.en_to_jp?.percent || 0}%</div>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                       <div className="h-full bg-orange-400" style={{ width: `${card.scores?.en_to_jp?.percent || 0}%` }} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => deleteCard(card.id)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition-all font-bold text-sm">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center">
      <div>
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-tighter">{label}</p>
        <p className="text-4xl font-black text-slate-800">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-2xl ${color} opacity-20`} />
    </div>
  );
}