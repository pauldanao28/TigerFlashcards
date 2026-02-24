"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FlashcardData } from '@/lib/types';

export default function StatsPage() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [input, setInput] = useState("");
const [batchInput, setBatchInput] = useState("");
const [showBatch, setShowBatch] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('tiger-cards');
    if (saved) setCards(JSON.parse(saved));
  }, []);

  const saveCards = (newCards: FlashcardData[]) => {
    setCards(newCards);
    localStorage.setItem('tiger-cards', JSON.stringify(newCards));
  };

  const generateCard = async () => {
    if (!input) return;
    setLoading(true);
    try {
      const res = await fetch("/api/generate", { 
        method: "POST", 
        body: JSON.stringify({ topic: input }) 
      });
      const data = await res.json();
      const newCard: FlashcardData = {
        ...data,
        id: Date.now().toString(),
        passCount: 0, failCount: 0, totalTries: 0, score: 0
      };
      saveCards([...cards, newCard]);
      setInput("");
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const clearPending = () => {
  if (confirm("Are you sure you want to delete all unsynced cards?")) {
    const filtered = cards.filter(c => c.english !== "Pending AI Sync");
    saveCards(filtered);
  }
};

  // For the single input field
const handleSingleAdd = () => {
  if (!input.trim()) return;
  processWords([input.trim()]);
  setInput("");
};

// For the batch textarea
const handleBatchUpload = () => {
  const words = batchInput.split('\n').filter(l => l.trim());
  if (words.length === 0) return;
  processWords(words);
  setBatchInput("");
  setShowBatch(false);
};

  const processWords = async (wordList: string[]) => {
  // 1. Filter out words that already exist in your 'cards' state
  const uniqueWords = wordList.filter(word => 
    !cards.some(c => c.japanese === word.trim())
  );

  if (uniqueWords.length === 0) {
    alert("All these words are already in your deck!");
    return;
  }

  setLoading(true);
  let newlyAddedCards: FlashcardData[] = [];
  const chunkSize = 10;

  for (let i = 0; i < uniqueWords.length; i += chunkSize) {
    const chunk = uniqueWords.slice(i, i + chunkSize);
    
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({ words: chunk }), 
      });

      const data = await res.json();
      const items = Array.isArray(data) ? data : [data];

      const formatted = items.map((item: any) => ({
        ...item,
        id: crypto.randomUUID(),
        passCount: 0,
        failCount: 0,
        totalTries: 0,
        score: 0
      }));

      newlyAddedCards = [...newlyAddedCards, ...formatted];
      
      setCards(prev => {
        const updated = [...prev, ...formatted];
        localStorage.setItem('tiger-cards', JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error("Processing error:", e);
    }
  }
  setLoading(false);
};


  const deleteCard = (id: string) => {
    saveCards(cards.filter(c => c.id !== id));
  };

  // Calculate some quick stats
  const totalCards = cards.length;
  const masteredCards = cards.filter(c => c.score >= 10).length;
  const strugglingCards = cards.filter(c => c.score < 0).length;

  // 1. Sort the cards: Lowest Score at the top
const sortedCards = [...cards].sort((a, b) => {
  return (a.score || 0) - (b.score || 0);
});

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* --- Management Toolbar --- */}
<div className="flex flex-col md:flex-row gap-4 mb-8">
  {/* Single AI Add */}
  <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-2">
    <input 
      type="text"
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => {
      if (e.key === 'Enter') handleSingleAdd();
    }}
      placeholder="Add new word..."
      className="flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
    />
    <button 
      onClick={handleSingleAdd}
      disabled={loading}
      className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
    >
      {loading ? "..." : "AI Add"}
    </button>
  </div>

  {/* Batch Toggle */}
  <button 
    onClick={() => setShowBatch(!showBatch)}
    className="px-6 py-2 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-colors"
  >
    {showBatch ? "Close Batch" : "Batch Upload"}
  </button>


<button 
  onClick={clearPending}
  className="px-4 py-2 text-rose-600 text-sm font-bold hover:bg-rose-50 rounded-xl transition-all"
>
  🗑️ Clear All Pending
</button>

</div>

{/* --- Conditional Batch Area --- */}
{showBatch && (
  <div className="mb-8 p-6 bg-indigo-50 rounded-3xl border-2 border-dashed border-indigo-200 animate-in slide-in-from-top duration-300">
    <textarea 
      value={batchInput}
      onChange={(e) => setBatchInput(e.target.value)}
      className="w-full h-32 p-4 rounded-xl border-none outline-none mb-3"
      placeholder="Paste list here (one per line)..."
    />
    <button 
      onClick={handleBatchUpload}
      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold"
    >
      Process {batchInput.split('\n').filter(l => l.trim()).length} Words
    </button>
  </div>
)}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800">Your Progress</h1>
          <Link href="/" className="text-indigo-600 font-bold hover:underline">
            ← Back to Study
          </Link>
        </div>

        {/* --- Stats Overview Cards --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard label="Total Cards" value={totalCards} color="bg-blue-500" />
          <StatCard label="Mastered (Score 10+)" value={masteredCards} color="bg-emerald-500" />
          <StatCard label="Struggling" value={strugglingCards} color="bg-rose-500" />
        </div>

        {/* --- Card List Table --- */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
              <tr>
                <th className="px-6 py-4">Kanji</th>
                <th className="px-6 py-4">English</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCards.map((card) => (
                <tr key={card.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-lg">{card.japanese}</td>
                  <td className="px-6 py-4 text-slate-600">{card.english}</td>
                  <td className="px-6 py-4 font-mono">{card.score || 0}</td>
                  <td className="px-6 py-4">
                    {card.score >= 10 ? (
                      <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded">MASTERED</span>
                    ) : card.score < 0 ? (
                      <span className="text-rose-600 text-xs font-bold bg-rose-50 px-2 py-1 rounded">RE-STUDY</span>
                    ) : (
                      <span className="text-slate-400 text-xs font-bold bg-slate-50 px-2 py-1 rounded">LEARNING</span>
                    )}
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

// Simple Helper Component
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
      <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-4xl font-black text-white inline-block px-4 py-1 rounded-2xl ${color}`}>
        {value}
      </p>
    </div>
  );
}