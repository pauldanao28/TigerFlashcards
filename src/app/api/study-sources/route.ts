import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";
import { generateCards } from "@/lib/generateCards";
import { createHash } from "node:crypto";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const presets = ["restaurant", "train", "rom-com", "shopping", "hotel", "airport", "daily life", "work", "school"];
const levels = ["N5", "N4", "N3", "N2", "N1"];
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({error:"Sign in required"}, {status:401});
  try {
    const body = await req.json();
    const type = body.type;
    const level = levels.includes(body.level) ? body.level : null;
    let title = "", material = "", key = "";
    let shared = false;
    let readerId: string | null = null, watchId: string | null = null;
    if (type === "situation") {
      title = String(body.topic || "").trim().slice(0,120);
      if (!title) return NextResponse.json({error:"Topic required"}, {status:400});
      key = title.toLowerCase();
      shared = presets.includes(key);
    } else if (type === "reader" || type === "watcher") {
      const table = type === "reader" ? "reader_passages" : "watch_videos";
      const {data, error} = await db.from(table).select("*").eq("id",String(body.materialId || "")).eq("user_id",user.id).maybeSingle();
      if (error || !data) return NextResponse.json({error:"Saved material not found"}, {status:404});
      material = String(type === "reader" ? data.passage : data.transcript);
      if (!material.trim()) return NextResponse.json({error:"No text or transcript available"}, {status:400});
      title = String(data.title || (type === "reader" ? "Reading vocabulary" : "Watching vocabulary"));
      if (type === "reader") readerId = data.id; else watchId = data.id;
      key = data.id + ":" + createHash("sha256").update(material).digest("hex");
    } else return NextResponse.json({error:"Invalid source"}, {status:400});
    let query = db.from("study_sources").select("id").eq("source_type",type).eq("source_key",key).eq("is_shared",shared);
    query = shared ? query.is("owner_id",null) : query.eq("owner_id",user.id);
    let {data: source, error: sourceError} = await query.maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) {
      const result = await db.from("study_sources").insert({source_type:type,source_key:key,title,is_shared:shared,owner_id:shared?null:user.id,reader_passage_id:readerId,watch_video_id:watchId,content_hash:material?createHash("sha256").update(material).digest("hex"):null}).select("id").single();
      if (result.error) throw result.error;
      source = result.data;
    }
    const sourceId = source!.id;
    const links = await db.from("study_source_cards").select("card_id").eq("source_id",sourceId);
    if (links.error) throw links.error;
    const ids = (links.data || []).map(r=>r.card_id);
    const cached = ids.length ? await db.from("master_cards").select("*").in("id",ids) : {data:[],error:null};
    if (cached.error) throw cached.error;
    let cards = cached.data || [];
    const eligible = () => cards.filter(c=>!level || c.jlpt_level===level);
    const count = body.more === true ? 20 : Math.max(0,20-eligible().length);
    if (count && (type === "situation" || cards.length === 0 || body.more === true || level)) {
      const usage = await checkAndRecordUsage(user.id,"generate",count);
      if (usage.allowed) {
        const model = ai.getGenerativeModel({model:"gemini-2.5-flash-lite"});
        const prompt = "Return only a JSON array of up to "+count+" distinct useful Japanese dictionary-form vocabulary strings. "+(level?"Target JLPT "+level+". ":"")+(material?"Extract only vocabulary actually present in this material (normalize inflections): "+JSON.stringify(material.slice(0,24000)):"Topic: "+JSON.stringify(title))+". Exclude these existing words: "+JSON.stringify(cards.map(c=>c.japanese));
        const response = await model.generateContent(prompt);
        const raw = response.response.text().match(/\[[\s\S]*\]/)?.[0] || "[]";
        const parsed: unknown = JSON.parse(raw);
        const words = Array.isArray(parsed) ? [...new Set(parsed.filter((w): w is string=>typeof w==="string" && w.length>0 && w.length<=80))].filter(w=>!cards.some(c=>c.japanese===w)).slice(0,count) : [];
        if (words.length) {
          const existing = await db.from("master_cards").select("*").in("japanese",words);
          if (existing.error) throw existing.error;
          const missing = words.filter(w=>!existing.data?.some(c=>c.japanese===w));
          const generated = missing.length ? (await generateCards(missing)).filter(c=>missing.includes(c.japanese)).slice(0,count) : [];
          if (generated.length) {
            const saved = await db.from("master_cards").upsert(generated.map(c=>({...c,creator_id:user.id})),{onConflict:"japanese",ignoreDuplicates:true});
            if (saved.error) throw saved.error;
          }
          const rows = await db.from("master_cards").select("*").in("japanese",words);
          if (rows.error) throw rows.error;
          if (rows.data?.length) {
            const linked = await db.from("study_source_cards").upsert(rows.data.map(c=>({source_id:sourceId,card_id:c.id})),{onConflict:"source_id,card_id",ignoreDuplicates:true});
            if (linked.error) throw linked.error;
            cards = [...new Map([...cards,...rows.data].map(c=>[c.id,c])).values()];
          }
        }
      }
    }
    const deck = await db.from("decks").select("id").eq("user_id",user.id).eq("is_default",true).maybeSingle();
    if (deck.error) throw deck.error;
    const pool = eligible();
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const selected = pool.slice(0,20);
    const owned = deck.data && selected.length ? await db.from("deck_cards").select("card_id").eq("deck_id",deck.data.id).in("card_id",selected.map(c=>c.id)) : {data:[],error:null};
    if (owned.error) throw owned.error;
    return NextResponse.json({cards:selected,ownedIds:(owned.data||[]).map(c=>c.card_id),cachedCount:pool.length});
  } catch (error) {
    console.error("Study source error",error);
    return NextResponse.json({error:"Unable to load vocabulary. Please retry."},{status:500});
  }
}
