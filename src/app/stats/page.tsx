"use client";
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { FlashcardData } from '@/lib/types';
import { supabase } from '@/lib/supabase'; // Import Supabase
import { User } from '@supabase/supabase-js';

export default function StatsPage() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [input, setInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [loading, setLoading] = useState(false);
const [user, setUser] = useState<User | null>(null);
// Inside StatsPage component:
const [searchQuery, setSearchQuery] = useState("");
const [displayLimit, setDisplayLimit] = useState(50); // Pagination limit

useEffect(() => {
    // 1. Get initial user session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    fetchCards();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null);
    
    // If user logs out, send them to the Home page (where your Auth component lives)
    if (event === 'SIGNED_OUT') {
      window.location.href = "/"; 
    }
  });

  return () => subscription.unsubscribe();
}, []);

  const handleLogout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Error signing out:", error.message);
  // Optional: window.location.href = "/"; // Force redirect to home
};

  // --- 1. Fetch from Supabase ---
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
    if (!user) {
    alert("You must be logged in to add cards!");
    return;
  }

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
      user_id: user.id,
      score: 0,
      scores: {
        jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
        en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 }
      },
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

  // Aggregating global performance across all modes
const globalStats = cards.reduce((acc, card) => {
  const modes = ['jp_to_en', 'en_to_jp'] as const;
  modes.forEach(mode => {
    acc.tries += card.scores?.[mode]?.total || 0;
    acc.pass += card.scores?.[mode]?.pass || 0;
    acc.fail += card.scores?.[mode]?.fail || 0;
  });
  return acc;
}, { tries: 0, pass: 0, fail: 0 });

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

const filteredCards = useMemo(() => {
  const query = searchQuery.toLowerCase();
  return cards.filter(card => 
    card.japanese.toLowerCase().includes(query) ||
    card.reading.toLowerCase().includes(query) ||
    card.english.toLowerCase().includes(query)
  );
}, [cards, searchQuery]);

const visibleCards = filteredCards.slice(0, displayLimit);

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

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
  <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800">Learning Progress</h1>
  
  <div className="flex gap-2 w-full md:w-auto">
    <Link href="/" className="flex-1 md:flex-none bg-white px-4 py-2 rounded-xl shadow-sm font-bold text-indigo-600 border border-slate-100 text-center hover:bg-slate-50 transition-all">
      ← Back to Study
    </Link>
    
    <button 
      onClick={handleLogout}
      className="flex-1 md:flex-none bg-rose-50 px-4 py-2 rounded-xl shadow-sm font-bold text-rose-600 border border-rose-100 text-center hover:bg-rose-100 transition-all"
    >
      Sign Out
    </button>
  </div>
</div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8">
      <StatCard label="Vocabulary" value={totalCards} color="bg-indigo-500" />
      <StatCard label="Mastered" value={masteredCards} color="bg-emerald-500" />
      <StatCard label="Struggling" value={strugglingCards} color="bg-rose-500" />
  <div className="col-span-2 md:col-span-3 grid grid-cols-3 bg-slate-800 rounded-3xl p-4 text-white">
        <div className="text-center border-r border-slate-700">
          <p className="text-[9px] uppercase font-bold text-slate-400">Total Tries</p>
          <p className="text-xl font-black">{globalStats.tries}</p>
        </div>
        <div className="text-center border-r border-slate-700">
          <p className="text-[9px] uppercase font-bold text-emerald-400">Pass</p>
          <p className="text-xl font-black">{globalStats.pass}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase font-bold text-rose-400">Fail</p>
          <p className="text-xl font-black">{globalStats.fail}</p>
        </div>
      </div>
</div>

{/* --- SEARCH BAR (Placed above lists) --- */}
        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">🔍</div>
          <input
            type="text"
            placeholder="Search kanji, reading, or meaning..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDisplayLimit(20);
            }}
          />
        </div>

    {/* MOBILE LIST VIEW (Visible only on mobile) */}
    <div className="md:hidden space-y-4">
      {visibleCards.map((card) => (
        <div key={card.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative">
          <button 
            onClick={() => deleteCard(card.id)}
            className="absolute top-4 right-4 text-slate-300 hover:text-rose-500"
          >
            ✕
          </button>
          
          <div className="mb-4">
            <div className="text-2xl font-black text-slate-800">{card.japanese}</div>
            <div className="text-sm font-bold text-indigo-500">{card.reading}</div>
            <div className="text-slate-600 mt-1">{card.english}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">🇯🇵 → 🇺🇸</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{card.scores?.jp_to_en?.percent || 0}%</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${card.scores?.jp_to_en?.percent || 0}%` }} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">🇺🇸 → 🇯🇵</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{card.scores?.en_to_jp?.percent || 0}%</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400" style={{ width: `${card.scores?.en_to_jp?.percent || 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      
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
              {visibleCards.map((card) => (
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
        {/* --- LOAD MORE BUTTON --- */}
        {filteredCards.length > displayLimit ? (
          <div className="mt-8 mb-12 flex justify-center">
            <button 
              onClick={() => setDisplayLimit(prev => prev + 50)}
              className="bg-white border border-slate-200 px-8 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all active:scale-95"
            >
              Load More ({filteredCards.length - displayLimit} remaining)
            </button>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 mt-4">
            <p className="text-slate-400 font-medium">No cards match your search.</p>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-300 text-xs font-bold uppercase tracking-widest">
            End of List
          </div>
        )}
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