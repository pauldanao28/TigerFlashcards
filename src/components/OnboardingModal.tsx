import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface OnboardingProps {
  userId: string;
  onComplete: (addedCards: boolean) => void;
}

export default function OnboardingModal({
  userId,
  onComplete,
}: OnboardingProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const CONST_DEFAULT_DECK_NAME = "My Deck";

  const startWithN5 = async () => {
    setLoading(true);

    try {
      // 1. Fetch the N5 Starter Pack template (Get the ID here!)
      const { data: pack, error: packErr } = await supabase
        .from("starter_packs")
        .select("id, card_data") // Added 'id' to the selection
        .eq("name", "JLPT N5 Kickstart")
        .single();

      if (packErr || !pack)
        throw new Error("Could not find the N5 Starter Pack.");

      // Store the real database ID
      const packId = pack.id;
      const n5Words = pack.card_data as any[];

      // 2. Upsert to master_cards
      const { data: uploadedCards, error: mErr } = await supabase
        .from("master_cards")
        .upsert(
          n5Words.map((w) => ({
            japanese: w.japanese,
            reading: w.reading,
            english: w.english,
            partOfSpeech: w.partOfSpeech,
            exampleSentence: w.exampleSentence,
            creator_id: userId,
          })),
          { onConflict: "japanese" },
        )
        .select("id");

      if (mErr || !uploadedCards) throw mErr;
      const cardIds = uploadedCards.map((c) => c.id);

      // 3. Find or Create Default Deck
      let { data: deck } = await supabase
        .from("decks")
        .select("id")
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle();

      if (!deck) {
        const { data: newDeck, error: createErr } = await supabase
          .from("decks")
          .insert([
            {
              user_id: userId,
              title: CONST_DEFAULT_DECK_NAME,
              is_default: true,
            },
          ])
          .select("id")
          .single();

        if (createErr) throw createErr;
        deck = newDeck;
      }
      const targetDeckId = deck.id;

      // 4. Batch link to deck_cards and user_scores
      await Promise.all([
        supabase.from("deck_cards").upsert(
          cardIds.map((id) => ({ deck_id: targetDeckId, card_id: id })),
          { onConflict: "deck_id,card_id" },
        ),
        supabase.from("user_scores").upsert(
          cardIds.map((id) => ({
            user_id: userId,
            card_id: id,
            scores_json: {
              jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
              en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
            },
          })),
          { onConflict: "user_id,card_id" },
        ),
      ]);

      // 5. Update profile flag with the REAL ID
      await supabase
        .from("profiles")
        .update({
          has_onboarded: true,
          // We save the UUID from the table, NOT a hardcoded string
          imported_packs: [packId],
        })
        .eq("id", userId);

      localStorage.setItem("show_first_timer_hint", "true");

      // 6. Trigger completion
      onComplete(true);
    } catch (error: any) {
      console.error("Onboarding Error:", error);
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const skipToManual = async () => {
    setLoading(true);
    try {
      // 1. Check if a default deck already exists (Safety Check)
      let { data: deck } = await supabase
        .from("decks")
        .select("id")
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle();

      // 2. If no deck exists, create one now
      if (!deck) {
        const { data: newDeck, error: createErr } = await supabase
          .from("decks")
          .insert([
            {
              user_id: userId,
              title: CONST_DEFAULT_DECK_NAME,
              is_default: true,
            },
          ])
          .select("id")
          .single();

        if (createErr) throw createErr;
        deck = newDeck;
      }

      // 3. Update profile to mark onboarding as finished
      await supabase
        .from("profiles")
        .update({ has_onboarded: true })
        .eq("id", userId);

      localStorage.setItem("show_first_timer_hint", "true");

      // 4. Complete the process
      onComplete(false); // No cards added, but deck is ready
      router.push("/stats");
    } catch (err) {
      console.error("Onboarding skip error:", err);
      alert("Could not initialize your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-3">
            Welcome to FlashKado!
          </h1>
          <p className="text-slate-400 text-lg">
            How would you like to start your journey?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={startWithN5}
            disabled={loading}
            className="group relative bg-white p-8 rounded-[2rem] shadow-2xl text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              🇯🇵
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">
              JLPT N5 Kickstart
            </h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Instantly add 30 essential N5 words with AI-generated readings and
              examples.
            </p>
            <div className="mt-6 flex items-center text-indigo-600 font-bold text-sm">
              Get Started →
            </div>
          </button>

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
              Start with a clean slate. Perfect for syncing your own lyrics or
              vocabulary lists.
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
