"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fetchBestScore, updateBestScore } from "@/lib/minigameScores";

const BEST_SCORE_COLUMN = "minigame_kanji_rain_best";

type Card = { id: string; japanese: string; english: string };
type Side = "jp" | "en";
type Tile = {
  tileId: string;
  cardId: string;
  side: Side;
  text: string;
  duration: number;
  bornAt: number;
};

async function loadDeckCards(userId: string): Promise<Card[]> {
  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .single();
  if (!deck) return [];
  const { data } = await supabase
    .from("master_cards")
    .select("id, japanese, english, deck_cards!inner(deck_id)")
    .eq("deck_cards.deck_id", deck.id)
    .limit(500);
  return (data ?? []) as Card[];
}

const DURATION = 60;
const MAX_ACTIVE_WORDS = 3;
const SPAWN_INTERVAL_MS = 1000;
const OCCUPANCY_FRACTION = 0.35;
const BASE_FALL_SECONDS = 6.5;
const MIN_FALL_SECONDS = 3.2;
const FALL_STEP = 0.3;

function getFallDuration(score: number): number {
  return Math.max(MIN_FALL_SECONDS, BASE_FALL_SECONDS - Math.floor(score / 5) * FALL_STEP);
}

function laneIsFree(tiles: Tile[], side: Side, now: number): boolean {
  const laneTiles = tiles.filter((t) => t.side === side);
  if (laneTiles.length === 0) return true;
  const mostRecent = laneTiles.reduce((a, b) => (a.bornAt > b.bornAt ? a : b));
  const elapsedFrac = (now - mostRecent.bornAt) / (mostRecent.duration * 1000);
  return elapsedFrac > OCCUPANCY_FRACTION;
}

export default function KanjiRainGame() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, "correct" | "wrong">>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);

  const cardsRef = useRef<Card[]>([]);
  const tilesRef = useRef<Tile[]>([]);
  const scoreRef = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const gameStateRef = useRef<"idle" | "playing" | "over">("idle");

  useEffect(() => { tilesRef.current = tiles; }, [tiles]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { selectedRef.current = selectedTileId; }, [selectedTileId]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setUserId(session.user.id);
      const [loaded, best] = await Promise.all([
        loadDeckCards(session.user.id),
        fetchBestScore(session.user.id, BEST_SCORE_COLUMN),
      ]);
      setCards(loaded);
      cardsRef.current = loaded;
      setBestScore(best);
      setLoading(false);
    });
  }, []);

  const trySpawn = useCallback(() => {
    const current = tilesRef.current;
    const activeCardIds = new Set(current.map((t) => t.cardId));
    if (activeCardIds.size >= MAX_ACTIVE_WORDS) return;
    const now = Date.now();
    if (!laneIsFree(current, "jp", now) || !laneIsFree(current, "en", now)) return;
    const pool = cardsRef.current.filter((c) => !activeCardIds.has(c.id));
    if (pool.length === 0) return;
    const card = pool[Math.floor(Math.random() * pool.length)];
    const duration = getFallDuration(scoreRef.current);
    setTiles((prev) => [
      ...prev,
      { tileId: crypto.randomUUID(), cardId: card.id, side: "jp", text: card.japanese, duration, bornAt: now },
      { tileId: crypto.randomUUID(), cardId: card.id, side: "en", text: card.english, duration, bornAt: now },
    ]);
  }, []);

  const handleMiss = useCallback((tileId: string) => {
    setTiles((prev) => prev.filter((t) => t.tileId !== tileId));
    setSelectedTileId((prev) => (prev === tileId ? null : prev));
    setCombo(0);
  }, []);

  const handleTap = useCallback((tileId: string) => {
    if (gameStateRef.current !== "playing") return;
    const tile = tilesRef.current.find((t) => t.tileId === tileId);
    if (!tile) return;

    const selId = selectedRef.current;
    if (!selId) {
      selectedRef.current = tileId;
      setSelectedTileId(tileId);
      return;
    }
    if (selId === tileId) {
      selectedRef.current = null;
      setSelectedTileId(null);
      return;
    }

    const selTile = tilesRef.current.find((t) => t.tileId === selId);
    if (!selTile) {
      // Previously selected tile already fell off — treat this tap as a fresh first pick.
      selectedRef.current = tileId;
      setSelectedTileId(tileId);
      return;
    }

    selectedRef.current = null;
    setSelectedTileId(null);

    if (selTile.cardId === tile.cardId) {
      setFlash((f) => ({ ...f, [tileId]: "correct", [selId]: "correct" }));
      setScore((s) => s + 1);
      setCombo((c) => c + 1);
      setTimeout(() => {
        setTiles((prev) => prev.filter((t) => t.tileId !== tileId && t.tileId !== selId));
        setFlash((f) => {
          const next = { ...f };
          delete next[tileId];
          delete next[selId];
          return next;
        });
      }, 220);
    } else {
      setFlash((f) => ({ ...f, [tileId]: "wrong", [selId]: "wrong" }));
      setCombo(0);
      setTimeout(() => {
        setFlash((f) => {
          const next = { ...f };
          delete next[tileId];
          delete next[selId];
          return next;
        });
      }, 350);
    }
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setCombo(0);
    setTimeLeft(DURATION);
    setTiles([]);
    setFlash({});
    setSelectedTileId(null);
    setIsNewBest(false);
    setGameState("playing");
  }, []);

  // Spawn loop
  useEffect(() => {
    if (gameState !== "playing") return;
    trySpawn();
    const id = setInterval(trySpawn, SPAWN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [gameState, trySpawn]);

  // Countdown
  useEffect(() => {
    if (gameState !== "playing") return;
    if (timeLeft <= 0) { setGameState("over"); return; }
    const t = setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, timeLeft]);

  // Game over cleanup + best score
  useEffect(() => {
    if (gameState !== "over") return;
    setTiles([]);
    setSelectedTileId(null);
    if (!userId) return;
    if (score > bestScore) {
      setIsNewBest(true);
      updateBestScore(userId, BEST_SCORE_COLUMN, score).then(() => setBestScore(score));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const timerPct = (timeLeft / DURATION) * 100;
  const jpTiles = tiles.filter((t) => t.side === "jp");
  const enTiles = tiles.filter((t) => t.side === "en");

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading your deck…</p>
      </div>
    );
  }

  const tileClass = (tile: Tile) => {
    const state = flash[tile.tileId];
    if (state === "correct") return "bg-emerald-500 border-emerald-400 text-white";
    if (state === "wrong") return "bg-rose-500 border-rose-400 text-white";
    if (selectedTileId === tile.tileId) return "bg-sky-500 border-sky-300 text-white scale-[1.04]";
    return "bg-slate-800 border-slate-700 text-white hover:border-sky-500";
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0 relative z-10">
        <Link href="/minigames" className="text-slate-400 hover:text-white transition-colors">
          ←
        </Link>
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-400">
          🌧️ Kanji Rain
        </span>
        <span className="font-black text-sm text-sky-400 tabular-nums w-12 text-right">
          {gameState === "playing" ? `${score}` : ""}
        </span>
      </div>

      <div className="flex-1 flex flex-col p-5 max-w-sm mx-auto w-full">
        {gameState === "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="text-7xl mb-5">🌧️</div>
              <h1 className="text-white font-black text-2xl mb-2">Kanji Rain</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
                Japanese words fall on the left, their English meanings fall on the right. Tap a word, then tap its match — before either one hits the ground. 60 seconds.
              </p>
              {bestScore > 0 && (
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-5">
                  Best <span className="text-sky-400">{bestScore}</span>
                </p>
              )}
              {cards.length < 4 ? (
                <p className="text-rose-400 text-sm">Add at least 4 cards to your deck to play.</p>
              ) : (
                <button
                  onClick={startGame}
                  className="bg-sky-500 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-sky-400 active:scale-95 transition-all"
                >
                  Start
                </button>
              )}
            </motion.div>
          </div>
        )}

        {gameState === "playing" && (
          <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 65px)" }}>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3 shrink-0">
              <motion.div
                className="h-full rounded-full bg-sky-500"
                animate={{ width: `${timerPct}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="flex items-center justify-between w-full mb-3 shrink-0">
              <span className="text-slate-500 text-xs font-bold tabular-nums">{timeLeft}s</span>
              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {combo >= 3 && (
                    <motion.span
                      key={combo}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sky-400 text-xs font-black"
                    >
                      🔥 ×{combo}
                    </motion.span>
                  )}
                </AnimatePresence>
                <span className="text-white font-black text-lg tabular-nums">{score}</span>
              </div>
            </div>

            <div className="flex-1 flex gap-3 relative" style={{ maxHeight: "60vh" }}>
              <div className="relative flex-1 overflow-hidden rounded-2xl bg-slate-950/40 border border-slate-800">
                {jpTiles.map((tile) => (
                  <motion.div
                    key={tile.tileId}
                    initial={{ top: "-14%" }}
                    animate={{ top: "100%" }}
                    transition={{ duration: tile.duration, ease: "linear" }}
                    onAnimationComplete={() => handleMiss(tile.tileId)}
                    className="absolute left-0 right-0 px-2"
                  >
                    <button
                      onClick={() => handleTap(tile.tileId)}
                      className={`w-full rounded-xl px-3 py-3 text-center font-black text-base border-2 transition-colors ${tileClass(tile)}`}
                    >
                      {tile.text}
                    </button>
                  </motion.div>
                ))}
              </div>
              <div className="relative flex-1 overflow-hidden rounded-2xl bg-slate-950/40 border border-slate-800">
                {enTiles.map((tile) => (
                  <motion.div
                    key={tile.tileId}
                    initial={{ top: "-14%" }}
                    animate={{ top: "100%" }}
                    transition={{ duration: tile.duration, ease: "linear" }}
                    onAnimationComplete={() => handleMiss(tile.tileId)}
                    className="absolute left-0 right-0 px-2"
                  >
                    <button
                      onClick={() => handleTap(tile.tileId)}
                      className={`w-full rounded-xl px-3 py-3 text-center font-bold text-xs leading-snug border-2 transition-colors ${tileClass(tile)}`}
                    >
                      {tile.text}
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}

        {gameState === "over" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center w-full"
          >
            <div className="text-7xl mb-4">🌧️</div>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Score</p>
            <p className="text-white font-black text-5xl mb-2 tabular-nums">{score}</p>
            {isNewBest ? (
              <p className="text-sky-400 text-sm font-black mb-10">✨ New Personal Best!</p>
            ) : (
              <p className="text-slate-500 text-sm mb-10">
                matches in 60 seconds · best <span className="text-sky-400 font-bold">{bestScore}</span>
              </p>
            )}
            <div className="flex gap-3 w-full">
              <button
                onClick={startGame}
                className="flex-1 bg-sky-500 text-white py-4 rounded-2xl font-black text-sm hover:bg-sky-400 active:scale-95 transition-all"
              >
                Play Again
              </button>
              <Link
                href="/minigames"
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 py-4 rounded-2xl font-black text-sm flex items-center justify-center hover:border-slate-500 active:scale-95 transition-all"
              >
                Menu
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
