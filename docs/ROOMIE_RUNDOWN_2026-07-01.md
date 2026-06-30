# Roomie App Rundown for ChatGPT

> Read-only archaeology report generated 2026-07-01 by cross-reading code + schema + docs.
> Purpose: give ChatGPT a complete, accurate mental model of Roomie to brainstorm from.
> Where docs and code conflict, trust the code and the 2026-06-24 audit.

## 1. Files Read

**Schema / config / infra**
- `instant.schema.ts` — the entire data model (12 InstantDB entities + all links). The backbone.
- `instant.perms.ts` — InstantDB permission/RLS rules; this file *is* the "T5 household scoping" security work.
- `src/lib/db.ts` — single InstantDB client init; public App ID.
- `package.json`, `app.json`, `tsconfig.json`, `eslint.config.js`, `.env.local`, `.gitignore`, `AGENTS.md`, `LICENSE`, `.github/workflows/ci.yml` — stack, scripts, CI, secrets surface.

**Cloudflare Worker ("Roomie Brain")**
- `workers/brain/src/index.ts` (router + rate cap), `prompt.ts`, `schema.ts` (zod), `groq.ts`, `cloudflare-ai.ts`, `clerk-verify.ts`, `wrangler.toml`, `.dev.vars` — the AI dump endpoint.

**App source (`src/`)**
- `app/_layout.tsx`, `app/index.tsx`, `app/kitchen.tsx`, `app/money.tsx`, `app/tasks.tsx` — routes (Expo Router).
- `features/auth/*`, `features/household/*`, `features/brain/*`, `features/tasks/*`, `features/kitchen/*`, `features/money/*`, `features/activity/*` — all feature logic + screens.
- `components/ui/kit.tsx` (the real design system), `app-tabs.tsx`, `constants/theme.ts` — UI/theme.
- Tests: `features/money/money-logic.test.ts`, `features/tasks/rotation.test.ts`.

**Docs**
- `docs/CHECKLIST.md` (team's single source of truth), `FOUNDATION_ROADMAP.md`, `ROADMAP_ELI5.md`, `PRODUCT_MARKETING_LAUNCH_BRIEF.md`, `GROCERY_SCAN_PRD.md`, `FEED_AND_TASKS_DESIGN.md`, `OLLIE_REUSE_AUDIT.md`, `E2E_STRANGER_TEST.md`, `audit/2026-06-24/FULL_AUDIT.md`, `research/STARTER_CHORES_2026-06-11.md`.

**Design**
- `design/redesign-2026-06-24/` (DIRECTION.md + 5 options: bento / editorial / cards / merge / vibrant), `design/grocery-scan-2026-06-30/mock.html`, `design/tasks-cleanup-2026-07-01/mock.html`.

**Found but only skimmed (boilerplate, low value):** `components/themed-text.tsx`, `themed-view.tsx`, `collapsible.tsx`, `web-badge.tsx`, `hint-row.tsx`, `external-link.tsx`, `app-tabs.web.tsx` — leftover Expo starter scaffolding (see §7-dead-code).

---

## 2. One-Sentence Description

Roomie is a phone app that helps roommates share a home fairly across **money and effort** — splitting expenses, rotating chores, and running a shared kitchen — without points, streaks, or shame.

---

## 3. Founder-Level Product Summary

- **What it is:** A "shared-house operating system" — one app where a flat tracks shared expenses (Splitwise-style), a rotating chore list, and a shared pantry/shopping list, all tied to the same household and the same people (`README.md`).
- **Who it's for:** Flats of 2–5 adults; the very first user is the founder's own Rotterdam flat on mixed iPhone/Android (`ROADMAP_ELI5.md`, `PRODUCT_MARKETING_LAUNCH_BRIEF.md`). Beyond that: students and young professionals who already use Splitwise.
- **The problem:** Roommates fight over money and chores, and existing tools each solve only half — Splitwise splits money but doesn't run the house; shared grocery lists have no identity or money; "all-in-one flat apps" are shallow and *gamify* chores in a shaming way.
- **Why open it daily:** It's the place you log "I bought milk," "I did the trash," "I'll grab dish soap" — the everyday running-the-house loop, plus a calm home feed showing what your housemates did.
- **What makes it different:** (1) money **and** kitchen handled together and *learning* over time (spoilage/cadence borrowed from the founder's other app, Ollie); (2) **form-free capture** — one sentence routed to many places via AI; (3) chores tracked with **no points/streaks/shame** — a deliberate anti-gamification stance baked into the schema (`choreEvents` is "history only, never counts — the no-shame rule").

---

## 4. Current App Status

**Status: a working, multi-feature MVP-in-progress that is NOT yet safe to hand to even one outside user.** The four modules work end-to-end on the founder's own device, but the multi-user security layer has not been verified on the live database.

- **Working end-to-end (single/trusted user):** Auth (Clerk), create/join a household, Money (expense split + settle), Kitchen (pantry/shopping list + "I'll get it" claim + Money bridge), Tasks (chore rotation + personal to-dos), Activity feed, and the AI Brain dump (depends on a deployed Cloudflare worker, which is live at `roomie-brain.ollieapp.workers.dev`).
- **Incomplete / partial:** Live database permissions push + the two-account "stranger" safety test are **pending** (the gating item). Kitchen's spoilage/aging engine is fully coded but only partially surfaced in the UI. Money payer/sharer chip scenarios marked "coded, not phone-verified" (🔶).
- **Only planned:** Grocery barcode Scan (Faz 6 — 0% built), the Activity feed's "BRAIN" (AI grouping/summary) layer, account deletion/data export, and dark mode for real screens.
- **Can it be run/tested?** Yes — it's an Expo app (`npm start` / `expo start`, with `ios`/`android`/`web` variants). It has CI (typecheck + lint + vitest on every push). Note: the Grocery Scan feature, when built, will need a dev build (barcode camera won't work in Expo Go).

**Important context:** The project **pivoted on 2026-06-09** from a Vite + React PWA + Supabase stack to **Expo / React Native + InstantDB**. Several older docs still describe the dead stack (see §9 conflicts).

---

## 5. Current Feature Map

**A. Authentication** — `src/features/auth/`
- Does: username/email + password sign-in; sign-up verified by an emailed 6-digit code. No social/OAuth.
- Backend: Clerk (`@clerk/expo`, legacy pure-JS hooks for Expo-Go compatibility). On success, `setActive` flips the app to signed-in.
- Status: **implemented** · Importance: **must-have** · Risk: no password reset / OAuth visible; minimal custom UI.

**B. Household (create / join / leave)** — `src/features/household/`
- Does: After sign-in, gate to "Create a home" or "Join with a code." Create seeds 5 starter chores + mints a short invite code (e.g. `RZ7K2P`). Join looks up the home by code then adds your membership. Leave logs the event then hard-deletes your membership (money survives via expense links).
- Backend: `households`, `memberships` entities; invite codes from an unambiguous alphabet (`invite-code.ts`); two-step create transaction (a permissions workaround).
- Status: **implemented** (happy path) · Importance: **must-have** · Risk: the join flow is the one most exposed to the live-perms gap (see §11); a stale code comment still says "invite code is just the household id."

**C. Money (expense splitting + settle)** — `src/features/money/`
- Does: Add an expense (pick payer + who shares; default = you + everyone), v1 **equal split**, see who-owes-whom (only debts you're in — a privacy choice), record a settle-up, list/delete past expenses.
- Backend: `expenses` (+ `paidBy`, `participants` links), `settlements` (+ `fromUser`/`toUser`); pure tested logic in `money-logic.ts` — `computeNetCents`, debt-minimizing `simplifyDebts`, deterministic penny-rounding, `parseAmountToCents` capped at `MAX_EXPENSE_CENTS = 1,000,000` (€10k). Departed roommates' balances are deliberately preserved.
- Status: **implemented** · Importance: **must-have** · Risk: OCR + unequal splits explicitly deferred. (The audit's "no amount cap" finding now appears fixed in code.)

**D. Kitchen (pantry + shopping list)** — `src/features/kitchen/`
- Does: One item, two states — `in` (pantry) / `out` (shopping list). Add by name with smart normalization ("süt" == "milk"); "I'll get it" claim prevents double-buying; "Got it ✓" restocks, logs a purchase, and offers a **Money bridge** ("Add to Money? €"). A quiet aging dot (never a count).
- Backend: `pantryItems`, `purchases` entities; `normalize.ts` (Turkish-aware fuzzy match, vendored from Ollie), `aging.ts` (spoilage state machine), `barcode-lookup.ts` (Open Food Facts), ~200-item EN/TR `alias-data.ts`.
- Status: **implemented (core)** / **partial (aging)** — `aging.ts` models `still_here_prompt` + `should_archive` but the UI shows only a binary fresh/aged dot · Importance: **must-have** · Risk: `purchases` log is written but never read yet (foundation for future "running low" predictions).

**E. Tasks (chores + personal to-dos)** — `src/features/tasks/`
- Does: Two lists by *who acts* — "Mine" (your chore turns + personal to-dos) and "House" (others'). Done/Pass, swipe actions, tap a chore for its history. **No counts/points/streaks.** Anyone can mark Done; only the turn-holder can Pass.
- Backend: `chores` (+ `turn` link, `events`), `choreEvents`, `personalTasks`; pure tested `rotation.ts` (`nextTurn` + self-healing `effectiveTurn` when a holder leaves); `starter.ts` (5 starter chores + a suggestions library).
- Status: **implemented** · Importance: **must-have** · Risk: minor doc inconsistency (comment says "four" classics, code has five).

**F. Activity Feed ("home diary")** — `src/features/activity/`
- Does: One calm line per real event (newest first, 50-row cap), e.g. "Kai added Trash."
- Backend: `activityEvents`; `logActivity` denormalizes actor name at write time; `describeEvent` maps ~16 event types to icon+text.
- Status: **implemented (the deterministic "Body" layer)**; the designed **"Brain" layer** (AI grouping/summary/ranking) is **planned, not built** · Importance: **should-have** · Risk: none structural.

**G. AI Brain Dump** — `src/features/brain/` + `workers/brain/`
- Does: Type one free-text note ("bought milk and did the trash") → AI returns draft fragments → you get an **editable draft card** → nothing saves until you **Confirm**. A one-time AI consent gate fires before any text leaves the device.
- Backend: POSTs to `roomie-brain.ollieapp.workers.dev/draft` with a Clerk Bearer token; worker classifies via **Groq `gpt-oss-120b` → Cloudflare Workers AI fallback**, zod-validated, **never persists**. `apply.ts` writes to the DB only after Confirm, using the same patterns as the manual screens.
- Status: **implemented** (pending real on-device dogfood, 🔶) · Importance: **should-have** (a differentiator, not the core loop) · Risk: Groq model id may be invalid → silent always-fallback; rate cap is global-per-isolate (200/day), not per-user.

**H. Grocery Scan (barcode)** — PRD only
- Does (planned): "Start shopping" → scan barcodes → Open Food Facts lookup → build a list → type total + pick payer → "Finish" writes pantry items + one split expense + purchase logs at once. Unknown barcode → "type the name" fallback.
- Status: **planned (0% built)** · Importance: **should-have / later** (PRD approved 2026-06-30; needs a dev build) · Risk: marketed historically as "the heart," but the original receipt-OCR version was dropped to v1.1.

---

## 6. User Journey As Implemented

1. **First open:** App loads fonts, then Clerk decides the screen. Signed-out → Auth screen.
2. **Sign up / in:** Username/email + password; sign-up confirmed by an emailed 6-digit code. (No onboarding wizard, no social login.)
3. **Bridge:** Behind the scenes, Clerk's token signs you into InstantDB (`instant-clerk-bridge.tsx`) — one shared identity.
4. **Household gate:** No active membership → a single screen toggling **Create a home** ("Name the place you share") or **Join** ("Paste the invite code your roommate shared"). Creating auto-seeds 5 chores and shows your invite code on the Home card.
5. **Add members:** You share the short invite code; a roommate enters it on the Join screen and becomes a member. *(This is the flow most exposed to the live-perms gap — see §11.)*
6. **Daily use (4 tabs):** **Home** (hero + brain box + invite card + activity feed), **Kitchen** (pantry/list), **Tasks** (your turns), **Money** (balances/settle). Add things by tapping in each module, or type a sentence into the Brain box and Confirm.
7. **Notifications/reminders:** **None implemented** in this repo (push was a future item; the feed is in-app only). *Assumed-absent — clearly unclear/not built.*
8. **Settings/profile:** **No real settings or profile screen.** The Home screen offers Leave-home and Sign-out. The `profiles` entity exists in the schema but is **never written or read** (avatars use membership display names). Account deletion/export does not exist.
9. **Empty states:** Warm, emoji, never shaming — "Quiet so far. 🌿", "You're all square. 🤍", "Nothing on your plate. 🤍".

*Marked unclear/assumed:* notifications, settings, any returning-user re-engagement loop — none are built.

---

## 7. Screens, UI, and Design Direction

- **Design style:** Warm, rounded, playful-but-calm editorial — described in code as **"Direction D: a bold forest-green editorial header over big, tactile, joyful cards."** Deliberately anti-fintech ("a sunlit kitchen corkboard, not a fintech dashboard"), anti-shame (no streaks/counts).
- **Colors (`theme.ts`):** Canvas `#F4F1EA` (warm paper), white cards, deep forest green accent `#1A6B43` (+ `#268A57`), sparing pops of coral `#FF6A3D` / pink / gold `#FFCB2E`. Each roommate gets a stable identity color ("identity, never a ranking").
- **Fonts:** **Baloo 2** (rounded display/numbers/names) + **Nunito** (body). *(Note: older top-level design doc still mentions "Fraunces" serif — that's stale; the live code and newest mocks use Baloo 2 + Nunito.)*
- **Components (`kit.tsx`):** Full-bleed green Hero (title + member faces + 3-up stat strip + house-switcher), white floating Cards, "ChunkyButton" (chunky drop-edge press animation), letter Avatars in identity colors. Money/Kitchen/Tasks all open with a Hero + stat strip.
- **Navigation:** Native bottom tabs — **Home · Kitchen · Tasks · Money**. Root layout is an auth gate, not a stack.
- **Mockups:** `design/redesign-2026-06-24/` (5 explored directions, **D — "Editorial Header × Joyful Cards" chosen**), plus newer mocks for grocery-scan and a tasks-cleanup pass — both confirm the forest-green Direction-D language.
- **Mismatch:** Dark mode exists in the palette but real screens hardcode light values, so **dark mode is effectively not implemented**. Several leftover Expo-starter screens ("Expo Starter" web tab, blue Expo splash icon, "Try editing app/index.tsx" hint) are **dead boilerplate**, not Roomie's design.

---

## 8. Technical Architecture (plain language + specifics)

- **Tech stack:** Expo / React Native (RN 0.85, React 19), Expo Router (file-based screens), TypeScript strict. One Cloudflare Worker for AI. Vitest for tests.
- **Frontend structure:** `src/app/` = routes; `src/features/<module>/` = each feature's logic + screen; `src/components/ui/kit.tsx` = the shared design system; `src/constants/theme.ts` = tokens.
- **Backend / database:** **InstantDB** — a hosted real-time graph database. There is **no custom server**; the app talks to InstantDB directly, and InstantDB's permission rules (in `instant.perms.ts`) are the security layer. Real-time sync is built in.
- **Auth/session:** **Clerk** is the identity provider; its session JWT is exchanged into InstantDB via `db.auth.signInWithIdToken({ clientName: 'clerk' })`. Token cache via `expo-secure-store`. One shared identity (`auth.id`) drives all permission rules.
- **API/routes:** No REST API for app data (InstantDB handles it). The only HTTP endpoint is the worker: `POST /draft` (+ `GET /health`).
- **AI integration:** Cloudflare Worker "roomie-brain" — verifies the Clerk JWT, then classifies one note via **Groq (`openai/gpt-oss-120b`, JSON mode) → Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)** fallback, returns zod-validated draft fragments, **never writes to any DB**.
- **Background jobs / notifications:** **None** (no cron, no push).
- **Testing:** Vitest, 2 files (money logic + chore rotation), ~19–27 pure-function tests. No integration/E2E/permission tests.
- **Deployment:** GitHub Actions CI on every push/PR: typecheck + lint + tests (format check is informational). **No deploy automation** — the worker is deployed manually via `wrangler deploy`; the app has no EAS/build pipeline wired.
- **Config / env:** `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_INSTANT_APP_ID`, `EXPO_PUBLIC_BRAIN_URL` (all public, fine to ship); worker secrets `GROQ_API_KEY` + `CLERK_ISSUER` set via `wrangler secret put`.
- **Security/privacy-relevant:** InstantDB permission rules enforce per-household isolation server-side (when pushed); the worker fail-closes (401) without a valid Clerk JWT; AI consent gate before any text leaves the device; money relationships point at users (not memberships) so a departed roommate's balance survives.

---

## 9. Data Model

**Entities (`instant.schema.ts`):**
- **`$users`** (built-in Clerk-backed identity) — `email`.
- **`profiles`** — `displayName`, `avatarUrl`, `createdAt`. *Defined but currently unused by any screen.*
- **`households`** — `name`, `inviteCode`, `creatorId`, `createdAt`. The unit everything hangs off.
- **`memberships`** — `role` (owner/member), `status` (active/invited/removed), `userId`, `displayName`, `joinedAt`. Links a user to a household.
- **`activityEvents`** — `type`, `metadata` (json), `createdAt`. The home diary.
- **`expenses`** — `title`, `amountCents`, `currency`, `createdAt`. (+ `paidBy`, `participants`)
- **`settlements`** — `amountCents`, `currency`, `createdAt`. (+ `fromUser`, `toUser`)
- **`pantryItems`** — `name`, `normalizedName`, `category`, `status` (in/out), `shelfLifeDays`, `barcode`, `addedAt`, …
- **`purchases`** — `itemName`, `at`. Append-only log; *written but not yet read.*
- **`chores`** — `name`, timestamps. (+ `turn` = current holder)
- **`choreEvents`** — `type` (done/pass), `at`. Append-only "effort diary; history only, never counts."
- **`personalTasks`** — `title`, `status` (open/done). Private to the owner.

**How they relate:** Everything shared links to a **household**: memberships, activityEvents, expenses, settlements, pantryItems, purchases, chores, personalTasks (choreEvents scope through their chore). Money links point at **users directly** (paidBy/participants/fromUser/toUser) by design, so balances survive a member leaving.

**Expected-but-missing/unused:** `profiles` exists but is unwired; there's **no "Note", "Routine", "Message", or stored "AI output" entity** (the AI draft is never persisted — by design); no bills/rent entity distinct from generic `expenses`; no reminders entity.

---

## 10. AI / Smart Features

Roomie has **one real AI feature** plus borrowed "smart" (non-AI) algorithms.

- **Brain Dump (AI):** Turns one free-text note into draft actions across modules. Lives in `src/features/brain/` (client) + `workers/brain/` (server). **Actually wired up** and deployed (`roomie-brain.ollieapp.workers.dev`). Provider: **Groq `gpt-oss-120b` → Cloudflare Workers AI (Llama 3.3 70B)** fallback. Safeguards present: Clerk JWT required (fail-closed), one-time on-device consent gate, draft-then-**confirm** (nothing auto-writes), zod validation, 500-char input cap, €5k amount cap in the schema. **Risk/missing:** the Groq model id may be invalid (silent always-fallback); rate limit is a crude global 200/day per worker isolate, **not per-user**; no PII scrubbing before sending text to Groq.
- **Smart (non-AI) algorithms:** grocery name normalization, spoilage/aging bands, chore rotation, debt-minimizing settlement — all deterministic, several vendored from the founder's Ollie app.
- **Planned AI (not built):** the Activity feed's "Brain" layer (AI grouping/summarizing events) and future "running low" cadence predictions from the `purchases` log.

---

## 11. Privacy, Security, and Trust

**The single most important fact:** Per the 2026-06-24 audit and the founder's own notes, the live InstantDB instance had **no permission rules pushed** ("default-ALLOW"), meaning until the rules in `instant.perms.ts` are pushed *and* verified, **any authenticated user could read/write any household's data.** The code-level permission rules now exist and look correct, and a stabilization pass addressed most findings — but the **gating step (push perms to live DB + run the two-account "stranger" test in `E2E_STRANGER_TEST.md`) is still pending.** This is the #1 trust blocker.

- **Per-household isolation:** Designed correctly in `instant.perms.ts` (every entity gates on household membership; no blanket-`true` rules). Unverified live.
- **Auth/authz:** Clerk identity → InstantDB rules keyed on `auth.id`. Worker independently verifies the same JWT.
- **Known authorization gaps (from audit, some now patched in code):** any member could evict the owner (F3); a creditor could mark someone else's debt paid (F4); removed members kept read/write access (F5); role self-escalation (F7). The current branch (`fix/stabilize-phase1`) has commits addressing join-flow perms, access control, and money trust — but live verification is pending.
- **Secrets:** Public keys are fine. **`CLERK_SECRET_KEY` (a server secret) sits in the RN app's `.env.local`** — gitignored and unbundled, but it doesn't belong in the mobile repo; remove it. Live test-tier `sk_test_…` and `gsk_…` (Groq) values exist in plaintext on disk (not committed) — rotate them, matching the project's standing pre-launch rotation practice.
- **AI data sharing:** User text goes to Groq/Cloudflare; consent gate exists, but **no PII scrubbing**.
- **Deletion/export:** **No account-deletion or data-export path** — a GDPR/KVKK gap flagged by the audit.
- **Local storage:** Clerk token in `expo-secure-store`; AI consent flag in AsyncStorage.

---

## 12. Tests and Reliability

- **What exists:** 2 vitest files — `money-logic.test.ts` (~11 tests: splits, penny rounding, books-sum-to-zero, departed-member credit) and `rotation.test.ts` (~8 tests: chore turn advance/wrap/self-heal). CI runs typecheck + lint + tests on every push.
- **What they cover:** the two trickiest pure-logic cores (money math, rotation).
- **What they DON'T cover:** permission rules, Clerk JWT verify, the AI draft parser, the worker, any integration/E2E. The worker dir is not in CI.
- **Do they pass?** The audit reports the existing tests pass clean; CI is green. *(Not re-run in this read-only pass.)*
- **Reliability risks (from audit):** no fetch timeout on the AI call (up to ~30s frozen spinner); some Kitchen/Tasks writes lack try/catch or busy guards; one money test historically **pinned broken removed-member behavior as "correct"** (a false-green — check whether it was corrected in the stabilization pass).
- **Obvious launch blockers:** the unverified live perms (§11) and no account-deletion path.

---

## 13. Launch Readiness

**Must Fix Before Launch (true blockers / trust-breakers)**
- **Push InstantDB perms to the live DB + run the `E2E_STRANGER_TEST.md` two-account test.** Until this passes, household data is potentially world-readable. *Why: this is the core multi-user safety guarantee; everything else is moot without it.*
- **Verify money-trust fixes live** (no settlement impersonation, removed-member balances still sum to zero, no owner-eviction by members). *Why: money disputes are the exact thing the app exists to prevent — a wrong balance breaks trust instantly.*
- **Account deletion / data export.** *Why: legal (GDPR/KVKK) requirement for shipping to real EU users.*
- **Remove `CLERK_SECRET_KEY` from the app repo + rotate exposed test secrets.** *Why: secret hygiene before any wider distribution.*

**Should Fix Soon**
- AI call timeout + write error-handling/busy guards. *Why: avoids frozen spinners and lost taps in daily use.*
- Per-user AI rate limit (KV counter) replacing the global 200/day. *Why: one noisy user shouldn't break the brain dump for the flat.*
- Validate/repair the Groq model id (or accept fallback-only intentionally). *Why: you're likely paying for Groq but always using the fallback.*
- Strip the dead Expo-starter boilerplate (blue splash, "Expo Starter" tab, edit-hint). *Why: it leaks "unfinished template" to testers.*
- Reconcile stale docs (dead Vite/Supabase stack; CHECKLIST next-task pointer). *Why: future-you/agents will follow the wrong map.*

**Can Wait**
- Surface the full Kitchen aging engine (`still_here_prompt` / auto-archive). *Why: nice, but the binary dot works.*
- Activity "Brain" AI layer; dark mode; `profiles` wiring; notifications/push. *Why: real value but not needed for a first dogfood.*

**Do Not Build Yet (overbuilding)**
- Grocery barcode Scan (Faz 6) and receipt-OCR. *Why: needs a dev build and is a whole feature; prove the core money+chore loop first.*
- Unequal/weighted splits, cadence "running low" predictions, B2B/multi-flat features. *Why: zero validated demand until your own flat lives in it for a week.*

---

## 14. Product Philosophy and Emotional Core

- **Belief about shared living:** Fairness is the real currency — and it's *two* currencies, money **and** effort. The job in both directions is "is everyone pulling their weight?" answered openly, not enforced.
- **Emotional problem it solves:** The low-grade resentment and awkwardness of living with others — who paid, whose turn, who keeps buying milk — surfaced *neutrally* so it never becomes a fight or a guilt trip.
- **Relationship it wants with users:** A calm, trusted shared utility you both glance at daily — "a sunlit kitchen corkboard, not a fintech dashboard." Anti-anxiety, anti-shame.
- **Features expressing this:** `choreEvents` "history only, never counts"; **no streaks/points** anywhere; identity colors that are "identity, never a ranking"; the feed's rule that public events are about *the house* (neutral) while nudges to a *person* stay private; warm emoji empty states; draft-then-confirm AI (the app never acts without you).
- **Features that could weaken it:** The AI Brain dump risks feeling like surveillance/magic-that's-wrong if it mis-routes (mitigated by confirm-first). The shared-money layer is the highest-stakes for trust — any wrong balance contradicts the whole "fairness without fights" promise, which is exactly why the unverified perms are an emotional, not just technical, risk.

---

## 15. Open Questions for the Founder

**Product idea**
1. Is the core wedge money+chores, or is the AI/photo "magic capture" the real hook you want people to remember?
2. Who is v1 really for — just your own flat (dogfood), or a public Splitwise-switcher audience?
3. Is "fairness in two currencies" a message users will instantly get, or does it need translating?

**User experience**
4. Should there be a real onboarding (right now it jumps from sign-up straight to create/join)?
5. What's the intended *daily* habit — opening the app, or capturing a sentence and forgetting it?
6. Do you want notifications/reminders at all for v1, or is the silent in-app feed the whole point?

**Features**
7. Removed-member money policy: auto-forgive the balance, or hold the debt open? (The audit flags this as undecided.)
8. Removed-member access: instant cutoff, or a short cleanup window?
9. Is barcode Grocery Scan a launch feature or a post-launch v1.1?
10. Equal-split only for v1, or do you need unequal/weighted splits before real flats will use it?
11. Should `profiles`/avatars be wired, or is "first initial + color" enough forever?

**Design / vibe**
12. Is Direction D (forest green + Baloo 2) final, or still exploring? (One doc still references Fraunces/linen.)
13. How much "joy/confetti" is right vs. calm — where's the line for you?
14. Dark mode: needed for v1 or later?

**Technical / launch**
15. When can you push perms to live InstantDB and run the stranger test? (This gates everything.)
16. One identity provider confirmed (Clerk) — any reason to reconsider before more users?
17. Do you want EAS build/distribution set up, or keep it local-dev only for now?
18. Account deletion/export — build before or after first external tester?

**Business / marketing**
19. Is this a personal tool, a public launch, or a B2B play (like Ollie's pivot)?
20. What's the one-week dogfood success signal that tells you it's ready to share?

---

## 16. Best Brainstorming Angles

1. **De-risking launch:** sequence the perms-push + stranger test + money-trust verification into a tight "is it safe for one real flat" checklist.
2. **Clarifying the AI role:** decide whether the Brain dump is the headline or a quiet accelerator — it changes onboarding and marketing.
3. **Designing the daily loop:** what makes a roommate *open it tomorrow* (the feed? a nudge? the money tab?) — today there's no re-engagement hook.
4. **Making roommate flows less awkward:** the removed-member money/access decisions, and how leaving/evicting feels emotionally.
5. **Simplifying MVP scope:** explicitly park Grocery Scan / OCR / unequal splits and define the smallest "lovable" core.
6. **Sharpening positioning:** "fairness in two currencies, no shame" vs. the crowded Splitwise/flat-app space — find the one-line wedge.
7. **Trust as a feature:** turn the privacy/perms work into a *visible* promise ("your flat's data never leaves your household").

---

## 17. Final Summary for ChatGPT

**Use this as your mental model: Roomie is** a calm, anti-shame "operating system for a shared house" — a React Native / Expo phone app (backend: InstantDB real-time DB + Clerk auth + one Cloudflare AI worker) that tracks fairness in two currencies, **money and effort**, for a flat of 2–5 roommates. The founder's own Rotterdam flat is the first user.

- **Core product:** Money (Splitwise-style equal splits + settle), Kitchen (shared pantry/shopping list with smart matching + a Money bridge), Tasks (no-shame rotating chores + personal to-dos), an Activity feed, and an AI "Brain dump" that routes one sentence into the right modules with confirm-first safety.
- **Build status:** A working multi-module MVP-in-progress that runs end-to-end on the founder's device and has CI + unit tests — but is **NOT yet safe for even one outside user** because the live database permissions haven't been pushed/verified.
- **Main implemented features:** auth, household create/join/leave, money split+settle, kitchen, chores, activity feed, AI brain dump (deployed worker).
- **Main missing/unclear pieces:** live perms verification, account deletion/export, notifications, real settings/profile, Grocery barcode Scan (0% built), Activity "Brain" AI layer, dark mode.
- **Biggest risks:** (1) live DB possibly world-readable until perms are pushed + stranger-tested; (2) money-trust bugs (settlement impersonation, removed-member balance, owner-eviction) — patched in code, unverified live; (3) no account deletion (legal); (4) a server secret in the app repo + secrets to rotate.
- **Best brainstorming direction:** lock down the multi-user safety + money-trust layer and define the smallest "lovable" daily loop **before** building any new features (especially Grocery Scan).

*One caveat for ChatGPT: the founder's older docs describe a dead Vite/PWA/Supabase stack (pivoted to Expo/RN/InstantDB on 2026-06-09) and the CHECKLIST's "next task" pointer is stale — trust the code and the 2026-06-24 audit over the older roadmap/marketing docs where they conflict.*
