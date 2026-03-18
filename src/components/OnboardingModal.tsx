import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation'; // Add this at the top

interface OnboardingProps {
  userId: string;
  onComplete: (addedCards: boolean) => void;
}

export default function OnboardingModal({ userId, onComplete }: OnboardingProps) {
  const [loading, setLoading] = useState(false);

// Inside your OnboardingModal component:
const router = useRouter();

  const startWithN5 = async () => {
    setLoading(true);
    
    // 1. The Starter Pack Data
    const n5Pack = [
  // --- VERBS ---
  { japanese: "食べる", reading: "たべる", english: "to eat", partOfSpeech: "verb", exampleSentence: { jp: "りんごを食べる。", en: "I eat an apple." } },
  { japanese: "飲む", reading: "のむ", english: "to drink", partOfSpeech: "verb", exampleSentence: { jp: "水を飲む。", en: "I drink water." } },
  { japanese: "行く", reading: "いく", english: "to go", partOfSpeech: "verb", exampleSentence: { jp: "学校に行く。", en: "I go to school." } },
  { japanese: "見る", reading: "みる", english: "to see / watch", partOfSpeech: "verb", exampleSentence: { jp: "映画を見る。", en: "I watch a movie." } },
  { japanese: "する", reading: "する", english: "to do", partOfSpeech: "verb", exampleSentence: { jp: "勉強をする。", en: "I study (do study)." } },
  { japanese: "来る", reading: "くる", english: "to come", partOfSpeech: "verb", exampleSentence: { jp: "友達が来る。", en: "A friend is coming." } },
  
  // --- NOUNS (Daily Life) ---
  { japanese: "学校", reading: "がっこう", english: "school", partOfSpeech: "noun", exampleSentence: { jp: "学校は楽しいです。", en: "School is fun." } },
  { japanese: "先生", reading: "せんせい", english: "teacher", partOfSpeech: "noun", exampleSentence: { jp: "先生、おはようございます。", en: "Good morning, teacher." } },
  { japanese: "電話", reading: "でんわ", english: "telephone / phone", partOfSpeech: "noun", exampleSentence: { jp: "電話をかけます。", en: "I will make a phone call." } },
  { japanese: "水", reading: "みず", english: "water", partOfSpeech: "noun", exampleSentence: { jp: "水をください。", en: "Water, please." } },
  { japanese: "お茶", reading: "おちゃ", english: "tea", partOfSpeech: "noun", exampleSentence: { jp: "お茶を飲みますか？", en: "Would you like some tea?" } },
  { japanese: "ご飯", reading: "ごはん", english: "meal / cooked rice", partOfSpeech: "noun", exampleSentence: { jp: "朝ご飯を食べました。", en: "I ate breakfast." } },
  
  // --- NOUNS (Time & People) ---
  { japanese: "今日", reading: "きょう", english: "today", partOfSpeech: "noun", exampleSentence: { jp: "今日は暑いですね。", en: "It's hot today, isn't it?" } },
  { japanese: "明日", reading: "あした", english: "tomorrow", partOfSpeech: "noun", exampleSentence: { jp: "明日は休みです。", en: "Tomorrow is a holiday." } },
  { japanese: "今", reading: "いま", english: "now", partOfSpeech: "noun", exampleSentence: { jp: "今は三時です。", en: "It is 3 o'clock now." } },
  { japanese: "友達", reading: "ともだち", english: "friend", partOfSpeech: "noun", exampleSentence: { jp: "友達と遊びます。", en: "I will hang out with friends." } },
  { japanese: "人", reading: "ひと", english: "person", partOfSpeech: "noun", exampleSentence: { jp: "あの人は誰ですか？", en: "Who is that person?" } },
  
  // --- ADJECTIVES ---
  { japanese: "大きい", reading: "おおきい", english: "big", partOfSpeech: "adjective", exampleSentence: { jp: "大きい犬ですね。", en: "That's a big dog." } },
  { japanese: "小さい", reading: "ちいさい", english: "small", partOfSpeech: "adjective", exampleSentence: { jp: "小さい猫がいます。", en: "There is a small cat." } },
  { japanese: "美味しい", reading: "おいしい", english: "delicious", partOfSpeech: "adjective", exampleSentence: { jp: "この寿司は美味しい！", en: "This sushi is delicious!" } },
  { japanese: "高い", reading: "たかい", english: "expensive / tall", partOfSpeech: "adjective", exampleSentence: { jp: "この時計は高いです。", en: "This watch is expensive." } },
  { japanese: "安い", reading: "やすい", english: "cheap", partOfSpeech: "adjective", exampleSentence: { jp: "これは安いです。", en: "This is cheap." } },
  { japanese: "新しい", reading: "あたらしい", english: "new", partOfSpeech: "adjective", exampleSentence: { jp: "新しい靴を買いました。", en: "I bought new shoes." } },
  { japanese: "古い", reading: "ふるい", english: "old", partOfSpeech: "adjective", exampleSentence: { jp: "古い家です。", en: "It is an old house." } },
  
  // --- ADJECTIVES (Feelings/Weather) ---
  { japanese: "暑い", reading: "あつい", english: "hot (weather)", partOfSpeech: "adjective", exampleSentence: { jp: "今日はとても暑い。", en: "Today is very hot." } },
  { japanese: "寒い", reading: "さむい", english: "cold (weather)", partOfSpeech: "adjective", exampleSentence: { jp: "昨日は寒かった。", en: "Yesterday was cold." } },
  { japanese: "面白い", reading: "おもしろい", english: "interesting / funny", partOfSpeech: "adjective", exampleSentence: { jp: "この本は面白いです。", en: "This book is interesting." } },
  { japanese: "楽しい", reading: "たのしい", english: "fun / enjoyable", partOfSpeech: "adjective", exampleSentence: { jp: "旅行は楽しい！", en: "Traveling is fun!" } },
  
  // --- PLACES ---
  { japanese: "ここ", reading: "ここ", english: "here", partOfSpeech: "noun", exampleSentence: { jp: "ここに来てください。", en: "Please come here." } },
  { japanese: "日本", reading: "にほん", english: "Japan", partOfSpeech: "noun", exampleSentence: { jp: "日本に行きたいです。", en: "I want to go to Japan." } }
].map(card => ({
  ...card,
  user_id: userId,
  score: 0,
  scores: {
    jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
    en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 }
  }
}));

    try {
      // 2. Insert the cards
      await supabase.from('flashcards').insert(n5Pack);
      
      // 3. Update the profile flag
      await supabase.from('profiles').update({ has_onboarded: true }).eq('id', userId);
      
      onComplete(true);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const skipToManual = async () => {
  setLoading(true);
  try {
    // 1. Mark as onboarded in the database
    const { error } = await supabase
      .from('profiles')
      .update({ has_onboarded: true })
      .eq('id', userId);

    if (error) throw error;

    // 2. Trigger the local state update in Home.tsx (to hide the modal)
    onComplete(false);

    // 3. Redirect to the Stats page where they can add cards
    router.push('/stats');
  } catch (err) {
    console.error("Onboarding error:", err);
    alert("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-3">Welcome to KanjiSync</h1>
          <p className="text-slate-400 text-lg">How would you like to start your journey?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* OPTION 1: N5 PACK */}
          <button 
            onClick={startWithN5}
            disabled={loading}
            className="group relative bg-white p-8 rounded-[2rem] shadow-2xl text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              🇯🇵
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">JLPT N5 Kickstart</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Instantly add 30 essential N5 words with AI-generated readings and examples.
            </p>
            <div className="mt-6 flex items-center text-indigo-600 font-bold text-sm">
              Get Started →
            </div>
          </button>

          {/* OPTION 2: MANUAL */}
          <button 
            onClick={skipToManual}
            disabled={loading}
            className="group relative bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="w-14 h-14 bg-slate-700 rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:bg-white group-hover:text-slate-900 transition-colors">
              ✍️
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Add My Own</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Start with a clean slate. Perfect for syncing your own lyrics or vocabulary lists.
            </p>
            <div className="mt-6 flex items-center text-slate-300 font-bold text-sm">
              Start Empty →
            </div>
          </button>
        </div>

        {loading && (
          <p className="text-center mt-8 text-indigo-400 font-bold animate-pulse">
            Preparing your deck...
          </p>
        )}
      </div>
    </div>
  );
}