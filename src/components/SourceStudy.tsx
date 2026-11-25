"use client";
import { useState } from "react";
import Flashcard from "@/components/Flashcard";
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
 return <div className="fixed inset-0 z-[500] bg-slate-50 flex flex-col overflow-y-auto p-4">
  <div className="flex justify-between items-center mb-4"><h2 className="font-black text-slate-800">{type==="situation"?"Situations":"Review Vocabulary"}</h2><button onClick={onClose} className="p-2">Close ✕</button></div>
  <div className="max-w-lg w-full mx-auto flex flex-col gap-3">
   {type==="situation"&&<><input className="border rounded-xl p-3" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Custom topic"/><div className="flex flex-wrap gap-2">{["restaurant","train","rom-com","shopping","hotel","airport","daily life"].map(t=><button key={t} onClick={()=>setTopic(t)} className="rounded-xl border px-3 py-2 text-sm">{t}</button>)}</div></>}
   <select className="border rounded-xl p-3" value={level} onChange={e=>setLevel(e.target.value)}><option value="">All levels</option>{["N5","N4","N3","N2","N1"].map(l=><option key={l}>{l}</option>)}</select>
   <div className="flex gap-2"><button disabled={busy} onClick={()=>load()} className="flex-1 rounded-xl bg-indigo-600 text-white p-3">{busy?"Working…":"Start / Shuffle"}</button>{count>0&&<button disabled={busy} onClick={()=>load(true)} className="border rounded-xl p-3">Generate more</button>}</div>
   {error&&<p role="alert" className="text-red-600 text-sm">{error}</p>}
   {card&&<><p className="text-center text-sm text-slate-500">{index+1} / {cards.length} · {count} cached</p><div className="h-[360px] relative"><Flashcard key={card.id} card={card} userId={userId} language="jp" isFlipped={flipped} onFlip={setFlipped} onSwipe={()=>move(1)}/></div>{flipped&&(owned.includes(card.id)?<p className="text-center text-sm">In your deck</p>:<button disabled={busy} onClick={add} className="bg-indigo-600 text-white rounded-xl p-3">Add to Deck</button>)}<div className="flex justify-between"><button disabled={index===0||busy} onClick={()=>move(-1)}>Previous</button><button disabled={busy} onClick={()=>move(1)}>Next</button></div></>}
   {cards.length>0&&!card&&<div className="text-center p-6">Review complete. <button onClick={()=>{setIndex(0);setFlipped(false);}} className="underline">Review again</button></div>}
  </div>
 </div>;
}
