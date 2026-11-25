"use client";
import { useState } from "react";
import Flashcard from "@/components/Flashcard";
import CustomSelect from "@/components/CustomSelect";
import { X, SlidersHorizontal, Shuffle } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { supabase } from "@/lib/supabase";
import type { MasterCard, FlashcardData } from "@/lib/types";

export default function SourceStudy({userId,type,materialId,onClose}:{userId:string;type:"situation"|"reader"|"watcher";materialId?:string;onClose:()=>void}) {
 const [topic,setTopic]=useState("restaurant");
 const [level,setLevel]=useState("");
 const [cards,setCards]=useState<MasterCard[]>([]);
 const [owned,setOwned]=useState<string[]>([]);
 const [index,setIndex]=useState(0);
 const [flipped,setFlipped]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [count,setCount]=useState(0);
 const current=cards[index];
 const move=(delta:number)=>{setIndex(i=>Math.max(0,Math.min(cards.length,i+delta)));setFlipped(false);};
 async function load(more=false){
  setBusy(true);setError("");
  try {
   const res=await authedFetch("/api/study-sources",{method:"POST",body:JSON.stringify({type,topic,level,materialId,more})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error);
   setCards(data.cards||[]);setOwned(data.ownedIds||[]);setCount(data.cachedCount||0);setIndex(0);setFlipped(false);
   if(!data.cards?.length)setError("No matching vocabulary found. Try another level.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load vocabulary");}finally{setBusy(false);}
 }
 async function add(){
  if(!current||busy||owned.includes(current.id))return;
  setBusy(true);setError("");
  try{
   const deck=await supabase.from("decks").select("id").eq("user_id",userId).eq("is_default",true).single();
   if(deck.error)throw deck.error;
   const zero={pass:0,fail:0,total:0,percent:0};
   const score=await supabase.from("user_scores").upsert({user_id:userId,card_id:current.id,score:0,next_review_at:new Date().toISOString(),scores_json:{jp_to_en:zero,en_to_jp:zero}},{onConflict:"user_id,card_id",ignoreDuplicates:true});
   if(score.error)throw score.error;
   const link=await supabase.from("deck_cards").upsert({deck_id:deck.data.id,card_id:current.id},{onConflict:"deck_id,card_id",ignoreDuplicates:true});
   if(link.error)throw link.error;
   setOwned(prev=>[...prev,current.id]);
   try{localStorage.setItem("flashkado-cards-invalidated-"+userId,String(Date.now()));}catch{}
  }catch(e){setError(e instanceof Error?e.message:"Unable to add word. Please retry.");}finally{setBusy(false);}
 }
 const zero={pass:0,fail:0,total:0,percent:0};
 const card:FlashcardData|undefined=current?{...current,score:0,scores:{jp_to_en:zero,en_to_jp:zero},next_review_at:new Date().toISOString()}:undefined;
 return <div className="fixed inset-0 z-[500] bg-slate-50 flex flex-col overflow-y-auto">
  <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
   <div className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-indigo-600"/><h2 className="font-black text-sm uppercase tracking-tight text-slate-800">{type==="situation"?"Situations":"Review Vocabulary"}</h2></div>
   <button aria-label="Close review" onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100"><X size={18}/></button>
  </div>
  <div className="max-w-lg w-full mx-auto flex flex-col gap-4 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
   <section className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
   {type==="situation"&&<><div><h3 className="text-slate-800 font-black text-sm uppercase tracking-tight mb-1">Situation</h3><p className="text-[11px] font-bold text-slate-400 leading-relaxed">Choose a topic or enter your own to explore useful vocabulary.</p></div>
   <div className="flex flex-wrap gap-2">{["restaurant","train","rom-com","shopping","hotel","airport","daily life","work","school"].map(t=><button key={t} disabled={busy} aria-pressed={topic===t} onClick={()=>{setTopic(t);setCount(0);setCards([]);setIndex(0);setFlipped(false);}} className={`px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${topic===t?"bg-indigo-600 text-white border-indigo-600":"bg-slate-50 text-slate-500 border-slate-200"}`}>{t}</button>)}</div>
   <div><label htmlFor="source-topic" className="block text-xs font-bold text-slate-700 mb-2">Custom topic</label><input id="source-topic" disabled={busy} className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500" value={topic} onChange={e=>{setTopic(e.target.value);setCount(0);setCards([]);setIndex(0);setFlipped(false);}} placeholder="Enter any topic"/></div><div className="h-px bg-slate-100"/></>}
   <div className={busy?"pointer-events-none opacity-60":""}><CustomSelect label="JLPT level" value={level} options={[{value:"",label:"All levels"},...["N5","N4","N3","N2","N1"].map(l=>({value:l,label:l}))]} onChange={l=>{setLevel(l);setCount(0);setCards([]);setIndex(0);setFlipped(false);}}/></div>
   <p className="text-[11px] font-bold text-slate-400">Up to 20 words per session. Cached words are shuffled automatically.</p>
   <div className="flex gap-2"><button disabled={busy||(type==="situation"&&!topic.trim())} onClick={()=>load()} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-white py-3.5 text-xs font-black uppercase tracking-widest active:scale-95 disabled:opacity-50"><Shuffle size={15}/>{busy?"Working…":count>0?"Shuffle":"Start review"}</button>{count>0&&<button disabled={busy} onClick={()=>load(true)} className="border border-slate-200 rounded-2xl px-3 text-[10px] font-black uppercase tracking-widest text-indigo-600">Generate more</button>}</div>
   </section>
   {error&&<p role="alert" className="text-red-600 text-sm">{error}</p>}
   {card&&<><p className="text-center text-sm text-slate-500">{index+1} / {cards.length} · {count} cached</p><div className="h-[360px] relative"><Flashcard key={card.id} card={card} userId={userId} language="jp" isFlipped={flipped} onFlip={setFlipped} onSwipe={()=>move(1)}/></div>{flipped&&(owned.includes(card.id)?<p className="text-center text-sm">In your deck</p>:<button disabled={busy} onClick={add} className="bg-indigo-600 text-white rounded-xl p-3">Add to Deck</button>)}<div className="flex justify-between"><button disabled={index===0||busy} onClick={()=>move(-1)}>Previous</button><button disabled={busy} onClick={()=>move(1)}>Next</button></div></>}
   {cards.length>0&&!card&&<div className="text-center p-6">Review complete. <button onClick={()=>{setIndex(0);setFlipped(false);}} className="underline">Review again</button></div>}
  </div>
 </div>;
}
