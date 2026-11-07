# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm run lint     # ESLint check
```

No test suite is configured. Verify changes with `npm run build` plus the dev server in a browser. `npm run lint` has some pre-existing errors (mostly `no-explicit-any` and `set-state-in-effect`), so compare against the baseline rather than expecting it to be clean.

## Environment Variables

Required in `.env.local` (and on Vercel for production):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; API routes that bypass RLS (`supabaseAdmin`)
- `GOOGLE_GEMINI_API_KEY` — server-only; AI card generation, quizzes, reader
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push
- `CRON_SECRET` — Vercel Cron auth for `/api/cron/*`
- `NEXT_PUBLIC_SITE_URL` — canonical URL for metadata (defaults to `https://flashkado.app`)
- `RESEND_API_KEY`, `SIGNUP_WEBHOOK_SECRET` — signup email webhook
- `ADMIN_MIGRATE_KEY` — admin one-off migration routes

## Deployment & Database

- Hosted on Vercel; `vercel.json` defines the daily cron (`/api/cron/streak-reminder` at 12:00 UTC = 8 PM SGT).
- Schema changes live in `supabase/migrations/`, but they are **applied by pasting into the Supabase SQL editor**, not `supabase db push` — the remote migration history is not in sync, so `db push` would try to re-run old migrations. Write migrations to be re-runnable where possible (`if not exists`, `create or replace`).
- Edge functions in `supabase/functions/` (`send-report-notification`, `welcome-email`).

## Architecture

**FlashKado** is a Japanese learning app (Next.js 16 App Router, React 19, Tailwind v4, Supabase, Framer Motion). Branding is FlashKado; the repo is still named tigercards.

### Auth & State

- `AuthContext` (`src/context/AuthContext.tsx`) — exposes `{ user, loading }` via `useAuth()`. Also exchanges a PKCE `?code=` on landing (email-confirmation links).
- `LanguageContext` (`src/context/LanguageContext.tsx`) — `{ lang, setLang, t }` via `useLang()`; `setLang` persists to `profiles.preferred_language`. Note: `LanguageProvider` is not currently mounted in the root layout.
- Root layout provider tree: `AuthProvider > AlertProvider > UploadGuardProvider`, plus `AccountSetupGuard`, which calls the `ensure_user_setup` RPC once per browser session (creates a missing profile/default deck, then reloads) and asks onboarded users with a blank/`G_` placeholder name to pick a username. Username rules: `src/lib/username.ts`.
- API routes that cost money or touch other users require a bearer token: client calls go through `authedFetch` (`src/lib/authedFetch.ts`), routes check it with `getAuthedUser` (`src/lib/apiAuth.ts`).

### Day Boundary

"Today" is the **Asia/Singapore** calendar date everywhere streaks and daily counts matter (`update_streak`, `daily_struggles`, the cron, `sgDate()` in `src/lib/notifyServer.ts`). Don't use device-local dates for streak/goal logic. Exception: `log_quiz_daily` stamps `quiz_daily_stats.study_date` with UTC `current_date`.

### Routing

- `/` — `HomeClient`: `<Dashboard>` when signed in, `<WelcomeView>` otherwise
- `/study` — `<StudyView>` flashcard review; `/study/kana` — kana practice
- `/quizzes` — Reading (`SentenceQuiz`), Listening, Grammar quizzes
- `/sensei` — AI chat tutor; `/stats` — "Cards" tab: deck management, stats, settings; `/stats/insights`
- `/friends/[id]` — read-only friend dashboard (`FriendDashboard`)
- `/minigames/*` — focus, kanji-rain, speed-match, survival, type-hear
- `/join/[code]` — referral landing (code = `profiles.referral_code`, stored in `localStorage` as `tg_referrer`); `layout.tsx` adds OG preview metadata
- `/jlpt/[level]`, `/learn/[level]` — public SEO pages
- `/admin`, `/admin/users`, `/admin/chat` — admin only
- `/login`, `/update-password`, `/auth/callback` — auth flows; `/share` — Web Share Target for adding words

Notable API routes: `/api/generate` (Gemini word enrichment), `/api/quiz/*`, `/api/reader/*`, `/api/tts`, `/api/push/{subscribe,notify}`, `/api/cron/streak-reminder`, `/api/og/{share,invite}` (share images).

### Data Model

Core tables:

- `master_cards` — shared card library (`MasterCard` in `src/lib/types.ts`)
- `decks` / `deck_cards` — each user has one default deck (`is_default`, enforced by a partial unique index), created by the `handle_new_user` signup trigger
- `user_scores` — per-user per-card progress (`scores_json: { jp_to_en, en_to_jp }` each `{ pass, fail, total, percent }`, plus reflex timing)

Supporting: `profiles`, `friendships`, `referrals`, `user_review_counts`, `user_mastery_counts`, `quiz_daily_stats`, `daily_struggles`, `daily_explained_lines`, `push_subscriptions`, `notifications`.

Dashboards load through RPCs: `get_dashboard_data`, `get_friend_dashboard_data`, `get_friends_quiz_today`. Social writes that affect another user go through `security definer` RPCs (`send_friend_request`, `process_referral`) because RLS blocks inserting rows on someone else's behalf.

The composite `FlashcardData` type (`MasterCard & { score, scores, next_review_at, ... }`) is what the study UI consumes.

### Study Flow (StudyView)

1. On mount: fetch `profiles` and the default `decks` row in parallel. Onboarding (`OnboardingModal`) shows while `profiles.has_onboarded` is false.
2. Once `defaultDeckId` is set: fetch `master_cards` joined with `deck_cards` and `user_scores`.
3. `getNextPriorityCard` — weighted pick: 70% from the bottom-10 hardest, 20% medium, 10% easy (≥85% accuracy, ≥15 tries); excludes the just-seen card.
4. `handleScore(isPass)` upserts `user_scores`, calls `increment_daily_review`, tracks the daily goal (10). Hitting the goal calls `update_streak`, shows the recap, and notifies friends.
5. Reflex Mode is a passive stopwatch (card shown → flip), not a timeout.
6. AI sync: cards with `english === "Pending AI Sync"` are enriched via `POST /api/generate`.

### Keyboard Controls (StudyView)

| Key               | Action |
| ----------------- | ------ |
| Space / ↑ / Enter | Flip   |
| →                 | Pass   |
| ←                 | Fail   |

### Social & Notifications

- `friendships` (`status: 'pending' | 'accepted'`); logic in `src/lib/social.ts`; `SocialDock` is the Study Circle sheet; `useFriends` loads the list and Realtime updates.
- `profiles.stats_visible_to_friends = false` hides detailed stats, quiz status, and goal/quiz notifications from friends (name, streak, level, daily progress stay visible).
- Every notification goes through `deliver()` in `src/lib/notifyServer.ts`: writes a `notifications` row (deduped by `dedupe_key`) and sends Web Push to `push_subscriptions`. Text comes from `src/lib/notificationText.ts` (shared by push and the Home bell, `NotificationBell`). `/api/push/notify` verifies each event against the DB before sending.
- Service worker: `public/sw.js` (push display + click).

### Sharing

`ShareButton` fetches a 1080×1920 card from `/api/og/share` (drawn by `src/lib/shareCard.tsx` with `next/og`, no AI) and opens the native share sheet with the user's referral link; desktop falls back to download + copy. The image is prefetched on mount because iOS only allows `navigator.share()` right after a tap. Fonts come from `src/lib/ogFont.ts` (Noto Sans JP subset, so Japanese names render).

### Styling Conventions

- Typeface is the system font everywhere; hierarchy comes from size/weight.
- Page titles: `font-black italic uppercase tracking-tighter`. Section labels: `text-[10px] font-black uppercase tracking-widest text-slate-500`. Small captions: `text-[9px]`.
- Use `text-slate-500` (not `-400`) for readable small text; `-300/-400` only for muted/inactive/decorative bits.
- Skill colors come from `src/lib/skillTheme.ts` (vocab rose, grammar violet, reading indigo, listening sky).
- Overlays stack by z-index: BottomNav `z-[200]`, Study Circle sheet `z-[240/241]`, friend profile modal `z-[250/251]`, recap `z-[300]`, LevelUp `z-[400]`. New modals opened from inside a sheet must sit above it.

### Internationalization

UI strings live in `src/lib/languages.ts` (`translations.en` / `translations.jp`), accessed via `useLang().t`; add new strings to both. Some newer screens (settings toggles, notifications, share captions) are still hard-coded English.

### Accuracy Display

The mastery percentage uses a diminishing buffer: `(pass / (tries + max(0, 200 - tries))) * 100`, capped at 100. This prevents early inflated scores.

# Claude Code Project Rules - Flashcards App

## Tech Stack & Architecture

- **Framework:** Next.js (App Router, `src/app` architecture)
- **Styling:** Tailwind CSS (Use arbitrary values sparingly; lean on standard utility classes)
- **State Management:** Keep state local to review sessions; use server actions for database persistence.

## Core Application Constraints

- **Client vs. Server:** All route pages are Server Components by default. Interactivity (cards flipping, timer, custom review input) must live inside explicit `'use client'` sub-components.
- **Card Flip Mechanics:** Do not use heavy external animation libraries unless specified. Use native Tailwind CSS 3D transforms (`transform-style: preserve-3d`, `rotate-y-180`, `backface-hidden`) for card flipping animations to ensure lightweight performance.
- **Keyboard Shortcuts:** Review sessions must support accessibility shortcuts. Always map spacebar/Enter to "Flip Card", `1` or `J` to "Forgot/Hard", and `2` or `K` to "Remembered/Easy". Do not let event listeners stack up or leak on component unmount.

## Code Style & Guardrails

- **No Hallucinated Types:** When adding new fields to a flashcard object (e.g., `interval`, `easeFactor`, `nextReview`), ensure they are strictly updated across the TypeScript interface/Prisma schema.
- **No Large File Rewrites:** When modifying a large component (like a review session component), do not rewrite the whole file. Modify code blocks incrementally using target edits.
