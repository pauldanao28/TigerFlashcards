"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, RotateCcw } from "lucide-react";
import CustomSelect from "@/components/CustomSelect";

type Item = { text: string; reading: string; level: "N5" | "N4" | "N3" };
const BANK: Item[] = [
  {text:"今日",reading:"きょう",level:"N5"},{text:"明日",reading:"あした",level:"N5"},{text:"昨日",reading:"きのう",level:"N5"},
  {text:"学校",reading:"がっこう",level:"N5"},{text:"友達",reading:"ともだち",level:"N5"},{text:"日本語",reading:"にほんご",level:"N5"},
  {text:"ありがとうございます。",reading:"ありがとうございます",level:"N5"},{text:"おはようございます。",reading:"おはようございます",level:"N5"},
  {text:"水をください。",reading:"みずをください",level:"N5"},{text:"駅はどこですか？",reading:"えきはどこですか",level:"N5"},
  {text:"今日は暑いです。",reading:"きょうはあついです",level:"N5"},{text:"毎日勉強します。",reading:"まいにちべんきょうします",level:"N5"},
  {text:"何時に起きますか？",reading:"なんじにおきますか",level:"N5"},{text:"これはいくらですか？",reading:"これはいくらですか",level:"N5"},
  {text:"電車",reading:"でんしゃ",level:"N5"},{text:"図書館",reading:"としょかん",level:"N5"},
  {text:"約束",reading:"やくそく",level:"N4"},{text:"準備",reading:"じゅんび",level:"N4"},{text:"経験",reading:"けいけん",level:"N4"},
  {text:"予約",reading:"よやく",level:"N4"},{text:"説明",reading:"せつめい",level:"N4"},{text:"必要",reading:"ひつよう",level:"N4"},
  {text:"もう一度お願いします。",reading:"もういちどおねがいします",level:"N4"},
  {text:"明日は雨が降ると思います。",reading:"あしたはあめがふるとおもいます",level:"N4"},
  {text:"日本に行ったことがあります。",reading:"にほんにいったことがあります",level:"N4"},
  {text:"ここで写真を撮ってもいいですか？",reading:"ここでしゃしんをとってもいいですか",level:"N4"},
  {text:"時間があれば行きたいです。",reading:"じかんがあればいきたいです",level:"N4"},
  {text:"少しずつ上手になっています。",reading:"すこしずつじょうずになっています",level:"N4"},
  {text:"最近",reading:"さいきん",level:"N3"},{text:"習慣",reading:"しゅうかん",level:"N3"},
  {text:"環境",reading:"かんきょう",level:"N3"},{text:"関係",reading:"かんけい",level:"N3"},
  {text:"予定が変わるかもしれません。",reading:"よていがかわるかもしれません",level:"N3"},
  {text:"日本語を勉強し続けています。",reading:"にほんごをべんきょうしつづけています",level:"N3"},
  {text:"忙しくても毎日練習しています。",reading:"いそがしくてもまいにちれんしゅうしています",level:"N3"},
  {text:"電車が遅れているようです。",reading:"でんしゃがおくれているようです",level:"N3"},
  {text:"思ったより難しかったです。",reading:"おもったよりむずかしかったです",level:"N3"},
  {text:"忘れないようにメモしておきます。",reading:"わすれないようにメモしておきます",level:"N3"}
];
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort?: () => void };
type SpeechWindow = { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const normalize = (s: string) => s.normalize("NFKC").replace(/[\s、。！？!?.,・「」『』]/g,"").replace(/ヵ/g,"か").replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
const pick = (level: string) => {
  const pool = BANK.filter(x => level === "mixed" || x.level === level || (level === "N4" && x.level === "N5"));
  const source = pool.length >= 20 ? pool : [...pool, ...BANK.filter(x => !pool.includes(x))];
  return [...source].sort(()=>Math.random()-0.5).slice(0,20);
};
export default function ReadingAloudDrill({onClose}:{onClose:()=>void}) {
  const [level,setLevel] = useState("mixed");
  const [items,setItems] = useState<Item[]>([]);
  const [index,setIndex] = useState(0);
  const [correct,setCorrect] = useState(0);
  const [running,setRunning] = useState(false);
  const [heard,setHeard] = useState("");
  const [status,setStatus] = useState("Tap Start once to enable the microphone.");
  const [hint,setHint] = useState(false);
  const [supported,setSupported] = useState(true);
  const recognition = useRef<Recognition|null>(null);
  const active = useRef(false);
  const indexRef = useRef(0);
  const itemsRef = useRef<Item[]>([]);
  const nextTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const correctRef = useRef(0);
  const stop = useCallback(() => {
    active.current=false;
    if(nextTimer.current) clearTimeout(nextTimer.current);
    nextTimer.current=null;
    try { recognition.current?.abort?.(); } catch {}
    recognition.current=null;
    setRunning(false);
  },[]);
  useEffect(()=>()=>stop(),[stop]);
  const listenRef = useRef<(position:number,list:Item[])=>void>(()=>{});
  const listen = useCallback((position:number, list:Item[]):void => {
    if(!active.current) return;
    const Speech = (window as unknown as SpeechWindow).SpeechRecognition || (window as unknown as SpeechWindow).webkitSpeechRecognition;
    if(!Speech) { setSupported(false);stop();setStatus("Speech recognition is unavailable in this browser.");return; }
    const rec = new Speech();
    recognition.current=rec;
    rec.lang="ja-JP";rec.continuous=false;rec.interimResults=false;
    rec.onresult=e=>{
      if(!active.current || position!==indexRef.current) return;
      const transcript=Array.from(e.results).map(r=>r[0].transcript).join("");
      setHeard(transcript);
      const target=list[position];
      // The recognition engine may output kanji or kana. Compare both displayed
      // orthography and known kana reading; avoid fuzzy matches that hide mistakes.
      const received=normalize(transcript);
      const ok=received===normalize(target.text)||received===normalize(target.reading);
      if(ok) {
        correctRef.current+=1;setCorrect(correctRef.current);
        setStatus("Correct! Moving to the next item…");
        nextTimer.current=setTimeout(()=>{
          if(!active.current)return;
          const next=position+1;
          indexRef.current=next;setIndex(next);setHeard("");setHint(false);
          if(next>=list.length){stop();setStatus("Drill complete!");return;}
          setStatus("Listening…");listenRef.current(next,list);
        },850);
      } else {
        setStatus("Not matched — try reading it again.");
      }
    };
    rec.onerror=e=>{
      if(!active.current)return;
      if(e.error==="not-allowed"||e.error==="service-not-allowed"){stop();setStatus("Microphone permission denied. Allow microphone access and try again.");}
      else if(e.error!=="no-speech"&&e.error!=="aborted")setStatus("Recognition interrupted; retrying…");
    };
    rec.onend=()=>{
      if(!active.current||position!==indexRef.current||nextTimer.current)return;
      // Mobile recognition sessions end after a pause; restart automatically.
      nextTimer.current=setTimeout(()=>{nextTimer.current=null;if(active.current&&position===indexRef.current)listenRef.current(position,list);},350);
    };
    try{rec.start();}catch{setStatus("Unable to start microphone. Try again.");stop();}
  },[stop]);
  listenRef.current=listen;
  const start=()=>{
    stop();
    const list=pick(level);
    itemsRef.current=list;indexRef.current=0;correctRef.current=0;
    setItems(list);setIndex(0);setCorrect(0);setHeard("");setHint(false);
    const Speech=(window as unknown as SpeechWindow).SpeechRecognition||(window as unknown as SpeechWindow).webkitSpeechRecognition;
    if(!Speech){setSupported(false);setStatus("Speech recognition is unavailable in this browser.");return;}
    active.current=true;setRunning(true);setStatus("Listening…");
    listen(0,list);
  };
  const skip=()=>{
    if(!running)return;
    try{recognition.current?.abort?.();}catch{}
    if(nextTimer.current)clearTimeout(nextTimer.current);
    nextTimer.current=null;
    const next=indexRef.current+1;indexRef.current=next;setIndex(next);setHeard("");setHint(false);
    if(next>=itemsRef.current.length){stop();setStatus("Drill complete!");}
    else{setStatus("Listening…");listen(next,itemsRef.current);}
  };
  const item=items[index];
  return <div className="fixed inset-0 z-[250] overflow-y-auto bg-slate-50">
    <div className="mx-auto max-w-xl px-5 py-6 pb-16">
      <div className="flex items-center justify-between"><div><p className="text-xs font-black text-indigo-600">音読練習</p><h2 className="text-2xl font-black text-slate-900">Reading Aloud Drill</h2></div><button type="button" onClick={()=>{stop();onClose();}} aria-label="Close reading drill" className="rounded-xl border bg-white p-2"><X size={20}/></button></div>
      {!running && !item && <div className="mt-8 rounded-2xl bg-white p-5 border space-y-4">
        <p className="text-sm text-slate-600">Practice reading 20 Japanese words and phrases aloud. Tap Start once, then read each item when it appears.</p>
        <CustomSelect label="Difficulty" value={level} onChange={setLevel} options={[{value:"mixed",label:"Mixed N5–N3"},{value:"N5",label:"N5"},{value:"N4",label:"N4 (includes N5)"},{value:"N3",label:"N3 (plus other levels if needed)"}]} />
        <button onClick={start} className="w-full rounded-xl bg-indigo-600 p-4 font-bold text-white"><Mic className="mr-2 inline" size={18}/> Start 20-item drill</button>
      </div>}
      {item && <div className="mt-7 space-y-4">
        <div className="flex justify-between text-xs font-bold text-slate-500"><span>{Math.min(index+1,20)} / 20</span><span>{correct} correct</span></div>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-indigo-500" style={{width:`${Math.min(index,20)*5}%`}}/></div>
        {index<20 ? <div className="rounded-3xl bg-white border p-7 text-center space-y-5">
          <p className="text-xs font-black uppercase text-slate-400">Read aloud in Japanese</p>
          <p className="text-3xl font-black leading-relaxed text-slate-900">{item.text}</p>
          {hint&&<p className="text-indigo-600 text-lg">{item.reading}</p>}
          <button onClick={()=>setHint(v=>!v)} className="text-xs font-bold text-indigo-600">{hint?"Hide reading":"Show reading hint"}</button>
          <div className="flex items-center justify-center gap-2 text-sm font-bold"><Mic size={18} className={running?"text-emerald-600":"text-slate-400"}/><span>{status}</span></div>
          {heard&&<p className="text-sm text-slate-500">Recognized: {heard}</p>}
        </div>:<div className="rounded-3xl bg-white p-8 text-center"><h3 className="text-xl font-black">Drill complete!</h3><p className="mt-2">{correct}/20 recognized correctly</p></div>}
        <div className="flex gap-2">{running?<><button onClick={stop} className="flex-1 rounded-xl border bg-white p-3 font-bold"><MicOff className="mr-2 inline" size={16}/> Stop</button><button onClick={skip} className="flex-1 rounded-xl border bg-white p-3 font-bold">Skip</button></>:<button onClick={start} className="w-full rounded-xl bg-indigo-600 p-3 font-bold text-white"><RotateCcw className="mr-2 inline" size={16}/> New drill</button>}</div>
      </div>}
      {!supported&&<p className="mt-4 text-sm text-rose-600">Voice recognition isn't supported in this browser. Try Chrome or another supported browser.</p>}
      <p className="mt-6 text-xs text-slate-400">Tip: Speak clearly in a quiet place. If your answer isn't recognized, try again or use Skip.</p>
    </div>
  </div>;
}
