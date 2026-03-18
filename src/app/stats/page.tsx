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
const [userBlocklist, setUserBlocklist] = useState<string[]>([]);
const [showSettings, setShowSettings] = useState(false);
const [newBlockWord, setNewBlockWord] = useState("");
const [autoPlayJp, setAutoPlayJp] = useState(true);
const [autoPlayEn, setAutoPlayEn] = useState(false);

const BLOCKLIST = [
  '私', '僕', '俺', '君', 'あなた', 'これ', 'それ', 'あれ', 'どの',
  'です', 'ます', 'した', 'から', 'まで', 'の', 'に', 'は', 'を', 'が', 'と', 'も', 'だ', 'な'
];

// Inside StatsPage component:
const [searchQuery, setSearchQuery] = useState("");
const [displayLimit, setDisplayLimit] = useState(50); // Pagination limit
// 1. Add this state at the top of StatsPage component
const [streak, setStreak] = useState(0);

// 2. Update the existing useEffect (or add this one)
useEffect(() => {
  if (user) {
    fetchProfile();
  }
}, [user]);

const fetchProfile = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('streak_count, blocked_words, auto_play_jp, auto_play_en')
    .eq('id', user?.id)
    .single();

  if (data) {
    setStreak(data.streak_count);
    setUserBlocklist(data.blocked_words || []);
    setAutoPlayJp(data.auto_play_jp);
    setAutoPlayEn(data.auto_play_en);
  }
};

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
  const processWords = async (inputList: string[]) => {
  if (!user) return alert("Please log in");

  const rawInput = inputList.join('\n').trim();
  if (!rawInput) return;

  let wordsToProcess: string[] = [];

  // 1. Check if the input is primarily English/Latin characters
  const isEnglishInput = /^[A-Za-z0-9\s.,!?-]+$/.test(rawInput);

  if (isEnglishInput) {
    // If English, treat the lines as the words themselves
    wordsToProcess = inputList.map(w => w.trim()).filter(w => w.length > 0);
  } else if (rawInput.includes(',') || rawInput.includes('-')) {
    // Handle comma-separated lists (e.g., "Neko, Cat")
    wordsToProcess = inputList.map(line => line.split(/[,-]/)[0].trim());
  } else {
    // 2. USE THE JAPANESE SEGMENTER (Original Logic)
    const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'word' });
    const segments = segmenter.segment(rawInput);

    wordsToProcess = Array.from(segments)
      .map(s => s.segment.trim())
      .filter(w => {
        const isJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(w);
        const isNotBlocked = !userBlocklist.includes(w); 
        const isMeaningful = w.length > 1 || /[\u4e00-\u9faf]/.test(w);
        return isJapanese && isNotBlocked && isMeaningful;
      });
  }

  // 3. Final cleanup and duplicate check
  const finalWords = [...new Set(wordsToProcess)].filter(w => {
    const existingWords = new Set(cards.map(c => c.japanese.toLowerCase()));
    const existingEnglish = new Set(cards.map(c => c.english.toLowerCase()));
    return w && !existingWords.has(w.toLowerCase()) && !existingEnglish.has(w.toLowerCase());
  });

  if (finalWords.length === 0) {
    alert("No new words to add!");
    return;
  }

  setLoading(true);
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({ words: finalWords }), 
    });

    if (!res.ok) throw new Error("AI Generation failed.");
  
    const items = await res.json();
    const dataToInsert = (Array.isArray(items) ? items : [items]).map((item) => ({
      japanese: String(item.japanese).trim(),
      reading: String(item.reading || "").replace(/[a-zA-Z\s\(\)]/g, ""),
      english: String(item.english || "").trim(),
      partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(),
      user_id: String(user.id), 
      exampleSentence: item.exampleSentence || { jp: "", en: "" },
      scores: {
        jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
        en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 }
      },
      score: 0 
    }));

    const { error } = await supabase.from('flashcards').upsert(dataToInsert, { onConflict: 'user_id,japanese' });
    if (error) throw error;

    alert(`🎉 Success! Added ${dataToInsert.length} new cards.`);
    fetchCards();
    setInput(""); // Clear the input field
    setBatchInput("");
    setShowBatch(false);
  } catch (e: any) {
    alert(`Error: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  const processWords2 = async (wordList: string[]) => {
  if (!user) return alert("Please log in");

  // Filter out words already in your local 'cards' state to save AI calls
  const existingWords = new Set(cards.map(c => c.japanese.toLowerCase()));
  const wordsToProcess = wordList
    .map(w => w.trim())
    .filter(w => w && !existingWords.has(w.toLowerCase()));

  if (wordsToProcess.length === 0) {
    alert("These words are already in your list!");
    return;
  }

  setLoading(true);
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({ words: wordsToProcess }), 
    });

    // CHECK FOR QUOTA ERROR FIRST
  if (res.status === 429) {
    throw new Error("AI Limit Reached: Please wait about 30 seconds and try again.");
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to generate cards.");
  }
  
    const items = await res.json();
   const dataToInsert = (Array.isArray(items) ? items : [items]).map((item) => {
  if (!item.japanese) throw new Error("AI missed a Japanese word.");

  return {
    // String Columns
    japanese: String(item.japanese).trim(),
    reading: String(item.reading || "").trim(),
    english: String(item.english || "").trim(),
    partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(),
    
    // UUID Column (The Pattern Culprit)
    user_id: String(user.id), 

    // JSONB Columns
    exampleSentence: item.exampleSentence || { jp: "", en: "" },
    scores: {
      jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
      en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 }
    },

    // Numeric Column (Integer/SmallInt pattern)
    score: 0 
  };
});

// Use the EXACT column names in onConflict
const { error } = await supabase
  .from('flashcards')
  .upsert(dataToInsert, { 
    onConflict: 'user_id,japanese' // No spaces after the comma
  });
    
    if (error) throw error;

    fetchCards();
    setInput("");
    setBatchInput("");
  } catch (e: any) {
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

const getPosColor = (pos: string) => {
  const p = pos?.toLowerCase() || '';
  if (p.includes('noun')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (p.includes('verb')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (p.includes('adj')) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const updateBlocklist = async (newList: string[]) => {
  const { error } = await supabase
    .from('profiles')
    .update({ blocked_words: newList })
    .eq('id', user?.id);

  if (!error) {
    setUserBlocklist(newList);
    alert("Blocklist updated!");
  }
};

const updateAudioSetting = async (column: string, value: boolean) => {
  const { error } = await supabase
    .from('profiles')
    .update({ [column]: value })
    .eq('id', user?.id);

  if (!error) {
    if (column === 'auto_play_jp') setAutoPlayJp(value);
    if (column === 'auto_play_en') setAutoPlayEn(value);
  }
};

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
              onClick={() => {
              // Split by new lines and remove empty lines
              if (!input.trim()) return;
              const lines = input.split('\n').filter(l => l.trim());
              processWords(lines);
            }}
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
      className="w-full h-48 p-4 rounded-xl border-none outline-none mb-3 text-sm font-mono shadow-inner"
      placeholder={`FORMAT OPTIONS:
1. List: word, meaning (one per line)
2. Lyrics: Paste a whole song or text. I'll pick out the new words for you!`}
    />
    <button 
      onClick={() => processWords([batchInput])} // Pass as one string block
      disabled={loading}
      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
    >
      {loading ? "AI is Extracting & Translating..." : "Process Text"}
    </button>
  </div>
)}

{/* Settings Toggle Button */}
<div className="flex justify-end mb-4">
  <button 
    onClick={() => setShowSettings(!showSettings)}
    className="text-xs font-bold text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1"
  >
    {showSettings ? "✕ Close Settings" : "⚙️ Settings"}
  </button>
</div>

{/* Settings Panel */}
{showSettings && (
  <div className="mb-8 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
    
    {/* SECTION 1: AUDIO SETTINGS */}
    <div className="mb-8">
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
        <span>🔊</span> Audio Preferences
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Japanese Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-700">Auto-play Japanese</p>
            <p className="text-[10px] text-slate-400 font-medium">Hear the kanji when card appears</p>
          </div>
          <button 
            onClick={() => updateAudioSetting('auto_play_jp', !autoPlayJp)}
            className={`w-12 h-6 rounded-full transition-all relative ${autoPlayJp ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoPlayJp ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {/* English Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-700">Auto-play English</p>
            <p className="text-[10px] text-slate-400 font-medium">Hear translation when flipping</p>
          </div>
          <button 
            onClick={() => updateAudioSetting('auto_play_en', !autoPlayEn)}
            className={`w-12 h-6 rounded-full transition-all relative ${autoPlayEn ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoPlayEn ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
      </div>
    </div>

    {/* HORIZONTAL DIVIDER */}
    <div className="h-px bg-slate-100 w-full mb-8" />

    {/* SECTION 2: BLOCKLIST SETTINGS */}
    <div>
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2 flex items-center gap-2">
        <span>🚫</span> Word Filters
      </h3>
      <p className="text-xs text-slate-500 mb-4">Words in this list will be ignored during Batch Uploads and AI processing.</p>
      
      <div className="flex flex-wrap gap-2 mb-6 p-4 bg-slate-50 rounded-2xl min-h-[60px] border border-slate-100">
        {userBlocklist.map((word) => (
          <span key={word} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-rose-200">
            {word}
            <button 
              onClick={() => updateBlocklist(userBlocklist.filter(w => w !== word))}
              className="text-rose-400 hover:text-rose-600 ml-1 px-1 font-bold"
            >
              ×
            </button>
          </span>
        ))}
        {userBlocklist.length === 0 && <span className="text-slate-400 text-xs italic">No words blocked yet.</span>}
      </div>

      <div className="flex gap-2">
        <input 
          type="text"
          value={newBlockWord}
          onChange={(e) => setNewBlockWord(e.target.value)}
          placeholder="Add word to block (e.g. です)..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newBlockWord.trim()) {
              updateBlocklist([...userBlocklist, newBlockWord.trim()]);
              setNewBlockWord("");
            }
          }}
        />
        <button 
          onClick={() => {
            if (newBlockWord.trim()) {
              updateBlocklist([...userBlocklist, newBlockWord.trim()]);
              setNewBlockWord("");
            }
          }}
          className="bg-slate-800 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-700 active:scale-95 transition-all shadow-md"
        >
          Add
        </button>
      </div>
    </div>

    {/* HORIZONTAL DIVIDER */}
    <div className="h-px bg-slate-100 w-full mb-8" />

    {/* SECTION 3: ACCOUNT SECURITY */}
    <div>
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
        <span>🔐</span> Account Security
      </h3>
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-700">Password</p>
          <p className="text-[10px] text-slate-400 font-medium">Update your login credentials</p>
        </div>
        <Link 
          href="/update-password" 
          className="bg-white px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 border border-indigo-100 shadow-sm hover:bg-indigo-50 transition-all"
        >
          Change Password
        </Link>
      </div>
    </div>
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

      {/* NEW STREAK CARD */}
  <div className="bg-gradient-to-br from-orange-500 to-red-600 p-6 rounded-3xl shadow-lg flex justify-between items-center text-white">
    <div>
      <p className="text-white/70 text-[10px] font-black uppercase tracking-tighter">Current Streak</p>
      <p className="text-4xl font-black">{streak} Days</p>
    </div>
    <span className="text-3xl">🔥</span>
  </div>

  <div className="col-span-2 md:col-span-3 grid grid-cols-4 bg-slate-800 rounded-3xl p-4 text-white">
  <div className="text-center border-r border-slate-700">
    <p className="text-[9px] uppercase font-bold text-slate-400">Total Tries</p>
    <p className="text-xl font-black">{globalStats.tries}</p>
  </div>
  
  {/* NEW: Percentage Column */}
  <div className="text-center border-r border-slate-700">
    <p className="text-[9px] uppercase font-bold text-indigo-400">Accuracy</p>
    <p className="text-xl font-black">
      {globalStats.tries > 0 ? Math.round((globalStats.pass / globalStats.tries) * 100) : 0}%
    </p>
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
            {card.partOfSpeech && (
        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}>
          {card.partOfSpeech}
        </span>
      )}
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
                    {card.partOfSpeech && (
        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-black uppercase tracking-tighter ${getPosColor(card.partOfSpeech)}`}>
          {card.partOfSpeech}
        </span>
      )}
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

  {loading && (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-white">
    <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-lg font-bold animate-pulse">AI is building your cards...</p>
    <p className="text-sm text-slate-300">This may take a few seconds</p>
  </div>
)}
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