# Ollie Repository Reuse Audit for Roomie

> Source: `/Users/serrayildirim/ollie` @ branch `feat/brain` · audit date 2026-06-09 · read-only analysis (nothing in Ollie modified).
> Target: `/Users/serrayildirim/roomie` (PWA · Vite + React 19 · multi-user, household-based).
> Note: Ollie's stale `CODEBASE_MAP.md` (2026-05-11) and `DATA_SCHEMA.md` predate `feat/brain`; this audit reads the **current** code, not those docs.

---

## 1. Executive Summary

Ollie is a **single-user, local-first** ADHD life-assistant. Its active app is `apps/native` (Tauri desktop/mobile); Roomie is a PWA. The monorepo cleanly separates **pure-logic packages** (zero I/O, well-tested, PWA-portable) from **Tauri-bound native shims** and **single-user persistence**. That separation is what makes reuse viable.

**Most reusable (copy / light-adapt):**

- **Kitchen domain logic** — `@ollie/cadence` (purchase-interval math), `predictOutAt` (replenish timestamp), `ageOf` (spoilage banding), `shouldPushReminder` (notify gate), `parseGroceryItem` + alias table, `inferRecipe` + recipe table. All pure, multi-user-agnostic.
- **AI text-routing pipeline** — `workers/ai-proxy` (segment → embed → cache → classify → multi-provider cascade). Returns structured fragments and **never persists server-side** — a natural draft generator.
- **Infra primitives** — `@ollie/notifications` (dispatcher + web backend), `@ollie/pii-scrub`, `@ollie/crypto`, `@ollie/events`, `@ollie/store`, `ApiResult`/`post()` fetch pattern, Supabase lazy client, layout/UI primitives, `formatRelativeTime`.

**Must be built fresh (Ollie has nothing):**

- **Expense splitting + who-owes-whom + settlements.** Ollie finance is a single-person tracker with **zero** split/debt/settlement concepts. This is Roomie's core Money feature — 0% reusable.
- **Household data model.** No `household_id` anywhere. Every table/store is single-tenant. The Partner feature is strictly 1:1 phrase-relay, not shared mutable records.
- **Chores / rotation / "who did it".** No Tasks-equivalent exists.
- **Draft-then-confirm for AI/OCR.** Ollie does the opposite — **write-then-undo**. Must be inverted.
- **PWA app-closed push (Web Push/VAPID).** Ollie's push is APNs-only (Apple). No reusable implementation.

**Rewrite (single-user persistence):** every `apps/native/src/modules/*/repo.ts` + `migrate.ts` (local SQLite, no owner column), `packages/store` keying, `packages/sync` whole-blob LWW (clobbers concurrent roommate edits), per-user passphrase encryption (blocks shared reads).

**One-line verdict:** Reuse Ollie's **Kitchen algorithms and AI/infra plumbing**; build Roomie's **Money-split, household model, Tasks, and confirm-first AI** from scratch.

---

## 2. Repository Map

| Path                                                | Purpose                                                        | Roomie relevance                                  | Reuse recommendation              |
| --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | --------------------------------- |
| `packages/cadence/`                                 | Recurrence/interval math (`computeCadence`, `detectRecurring`) | High — restock, recurring bills, recurring chores | **Copy**                          |
| `packages/logic/src/grocery/`                       | Pantry parse, pattern detectors, recipes, alias table          | High — Kitchen core                               | **Copy/Adapt**                    |
| `packages/logic/src/finance/`                       | Single-person expense/budget/subscription tracker              | Low — no split logic                              | **Mostly skip**, copy normalizers |
| `packages/logic/src/dissection/`                    | Keyword brain-dump fallback router                             | Low — superseded by AI worker                     | Skip                              |
| `packages/notifications/`                           | Backend-agnostic notify dispatcher + `web` backend             | High — reminders                                  | **Copy**                          |
| `packages/pii-scrub/`                               | Locale-aware PII redaction (76 tests)                          | Medium — any data collection                      | **Copy**                          |
| `packages/crypto/`                                  | AES-GCM-256 + PBKDF2 (WebCrypto)                               | Medium — private fields only                      | **Copy** (not for shared data)    |
| `packages/events/`                                  | Typed in-memory event bus                                      | Medium — module decoupling                        | **Copy**                          |
| `packages/store/`                                   | localStorage reactive KV + React bindings                      | Medium — local UI cache                           | **Adapt** (add scoping)           |
| `packages/sync/`                                    | Encrypted per-module Supabase sync + retry                     | Low — single-user LWW                             | Retry helper only                 |
| `packages/auth/`                                    | Passphrase→key vault (NOT identity; Clerk owns identity)       | Low                                               | Skip                              |
| `packages/api/` · `apps/native/src/api/`            | `ApiResult` fetch wrappers + Supabase client                   | High — generic skeleton                           | **Copy** skeleton                 |
| `packages/apns-jwt/` · `workers/apns-push/`         | Apple APNs JWT + push                                          | None — Apple-only                                 | Skip                              |
| `workers/ai-proxy/`                                 | Live AI router: classify, vision OCR, feed-me, cache           | High — text + receipt AI                          | **Adapt**                         |
| `workers/cron/`                                     | Drains `scheduled_jobs` → push                                 | Low — APNs path                                   | Pattern only                      |
| `apps/native/src/modules/grocery/`                  | Pantry/shopping UI + repo + predict/aging/push                 | High (logic) / rewrite (repo)                     | **Adapt logic, rewrite repo**     |
| `apps/native/src/modules/finance/`                  | Finance UI + repo + currency normalizers                       | Low + copy normalizers                            | **Adapt normalizers**             |
| `apps/native/src/modules/partner/`                  | 1:1 pairing/relay                                              | Pattern only (pairing UX)                         | Pattern for "join household"      |
| `apps/native/src/dump/`                             | Brain-dump input, photo intake, confirm card                   | Medium — intake UX                                | **Adapt** (invert to draft-first) |
| `apps/native/src/{ui,layout,theme,navigation,lib}/` | Design primitives, tokens, router, time format                 | High — generic                                    | **Copy** (rebrand tokens)         |
| `apps/native/src/storage/`                          | Tauri SQLite/KV shims                                          | None — Tauri-only                                 | Skip (use Supabase/IndexedDB)     |
| `apps/native/src/notify/`                           | Tauri/APNs notification glue                                   | Low — native-only                                 | Pattern only                      |
| `supabase/migrations/`                              | 30 migrations, all single-user                                 | Schema must be rewritten                          | Reference only                    |

---

## 3. Reusable Features

### Pantry / Kitchen

**Cadence engine** — `packages/cadence/src/index.ts` · `computeCadence(events: {ts,label}[]): CadenceEstimate` (+ `isOverdue`, `daysSinceLast`, `medianIntervalDays`; `detectRecurring`, `classifyCycle` in `recurring.ts`).

- Does: median-of-gaps interval estimate with confidence tier (`low-data`/`observed`/`stable`); robust to bursty buying.
- In: timestamped events for one item. Out: `{medianIntervalMs, sampleSize, confidence, nextExpectedTs, lastTs}`.
- Deps: none (self-contained). Edge cases: <2 samples → low-data; non-finite/negative ts dropped; cv>1.2 demoted.
- Single-user? Pure & generic. Roomie reuse: Kitchen restock, Money recurring bills, Tasks recurring chores — filter event stream by household/person first. **Copy directly.**

**Predicted-out timestamp** — `apps/native/src/modules/grocery/predict.ts` · `predictOutAt({lastPurchaseMs, cadenceDays, shelfLifeDays, staleAtDays?}): number|null`.

- Does: cadence-or-shelf-life → next run-out ms; caps beyond `staleAtDays` (180) to suppress noise; never fabricates. Pure. **Copy directly.**

**Spoilage banding** — `apps/native/src/modules/grocery/aging.ts` · `ageOf(addedAtMs, shelfLifeDays|null, nowMs): 'fresh'|'faded'|'still_here_prompt'|'should_archive'`.

- Does: bands by elapsed/shelf ratio (<1×/1–1.5×/1.5–2×/≥2×); unknown shelf-life → always fresh. Not a countdown/streak. Pure. **Copy directly.**

**Grocery text parser** — `packages/logic/src/grocery/parse.ts` · `parseGroceryItem(text): {name, normalizedName, category, intent: ADD|BOUGHT|REMOVE|UNKNOWN, qty?, unit?}`, `normalizeItemName`. Data: `ALIAS_TABLE` (~150 EN+TR items w/ category + shelfLifeDays) in `data.ts`.

- Does: free text → canonical item + intent + qty via exact→singular→prefix→Levenshtein≤2. Deps: `../util` (levenshtein). Edge: dozen→×12, comma decimals, Turkish İ/ı folding. Pure. **Copy directly** as deterministic offline parser/fallback (production routing uses the AI worker).

**Recipe inference** — `packages/logic/src/grocery/recipes.ts` · `inferRecipe(history, opts): RecipeInferredSignal|null`. Data: `RECIPE_TABLE` (~55 recipes) in `data.ts`.

- Does: named-dish lookup OR best pantry-coverage match (≥50%), bonus for using soon-expiring items; returns `have`/`missing` split. Pure. **Copy directly** as offline/fallback recipe engine.

**Pattern detectors** — `packages/logic/src/grocery/patterns.ts` · `detectDuplicate`, `detectExpirationDrift`, `detectReplenishNeeded`, `detectStockoutCascade`, `detectStaleListItems`, `detectShoppingCadence`, `detectPatterns`.

- Does: duplicate-buy, near-expiry, "milk is out — re-add?", staple promotion, stale-list, trip cadence. Pure but **semantically single-user** (no `boughtBy`/`addedBy`). Roomie reuse: **Adapt** — add owner field; in a shared house, cross-roommate duplicate-buy is a _headline feature_ (avoid double-buying). Strip `source` citation strings.

**Push-trigger gate** — `apps/native/src/modules/grocery/pushTrigger.ts` · `shouldPushReminder(row, nowMs, opts): boolean`. Pure 6-rule gate (opt-out/window/already-pushed/quiet-hours). **Copy directly.** (The _scanner_ that drives it reads single-user SQLite — adapt that.)

**Critical-reminder defaults** — `apps/native/src/modules/grocery/criticalReminder.ts` · `isCriticalReminderLocal(name): boolean`. Frozen Set defaulting some items to `remindMe=true`. **Adapt** — list is personal-care/pet heavy; trim to shared-house staples (toilet paper, dish soap, trash bags).

**Shelf-life cache** — `apps/native/src/modules/grocery/shelfLifeCache.ts` · `lookupDays(name): number|null`, ETag-aware load from worker `/shelf-life/all`. **Adapt** — keep the cached-reference pattern; the 721-item dataset lives in `workers/ai-proxy/src/modules/grocery.config.ts` (~1700 lines) and must be vendored if Roomie wants real numbers.

### Feed Me

**Feed-Me worker** — `workers/ai-proxy/src/router/feed-me.ts` · `handleFeedMe()`; prompt in `modules/feed-me.config.ts` (`buildFeedMeSystemPrompt`).

- Flow: JWT+ownership → validate → **PII-scrub pantry** → Voyage embed → pgvector cache (cosine 0.85) → HIT re-score / MISS 4-tier model cascade (Gemini 2.5 Flash → Groq → Cloudflare AI → OpenRouter) → cache write. Failure → `{suggestions:[], source:'static_fallback'}` (frontend falls back to `inferRecipe`).
- In: `{pantry: string[], diet, feedTarget, count, locale, excludeDishes?}`. Out: `{suggestions: RecipeSuggestion[], source, latencyMs}`.
- Single-user? `/feed-me/:user`, JWT `sub === pathUserId`. Roomie reuse: **Adapt** — pantry becomes shared household pantry; `/feed-me/:user` → `/feed-me/:household` + membership check; drop pet-feed; reconcile multiple roommate diets (intersection/strictest-wins is net-new). Cascade + cache + PII-scrub + static-fallback architecture reused as-is. Rotate exposed Voyage/Gemini keys.

**Cook history** — `workers/ai-proxy/src/router/cook-history.ts` · `handleCookHistory()` + RPC `feed_me_cook_signals` (migration `20260522000002_cook_history.sql`).

- Does: per-cook event log (rating −1/0/1) → recent/loved/rejected aggregation biases future suggestions. Per-user (`user_id`, RLS `auth.uid()=user_id`). Roomie reuse: **Adapt** — `user_id`→`household_id` + keep `cooked_by`; loosen RLS to membership.

### Finance

**(See §1 and §4 — no split/debt/settlement logic exists.)** Copyable scraps:

- Currency/merchant normalizers — `apps/native/src/modules/finance/types.ts` · `normaliseCurrency`, `normaliseMerchant`, `normaliseCadence`, `normaliseCategory` (trilingual-currency aware). **Copy.**
- `getMonthlyBurn()` per-currency bucketing — `apps/native/src/modules/finance/repo.ts:674` — model for per-person balances. **Adapt.**
- Stat/date helpers — `packages/logic/src/finance/math.ts`. **Copy.**
- CSV RFC-4180 escaper — `packages/logic/src/finance/export.ts` · `escapeCsvField`. **Copy** if Roomie exports a ledger.
- `detectRecurring`/`predictNextDue` — `recurring.ts` — for shared recurring bills. **Adapt.**

### AI brain / routing

**Dump classify** — `workers/ai-proxy/src/router/dump.ts` · `handleDumpRoute()`; prompt `dump-classify.ts` `SYSTEM_PROMPT`; cascade `json-cascade.ts`.

- Model: Groq `gpt-oss-120b` JSON mode → CF/Gemini/OpenRouter fallback. Out: `RouterOutput.fragments[]` (`{text, language, module, payload, confidence, needsConfirm, source}`). Validation: **weak** (JSON.parse + count check, no zod; payload is `Record<string, unknown>`).
- Roomie reuse: **Adapt** — keep pipeline (segment→embed→cache→classify→cascade); rewrite prompt to Roomie domains (expense/chore/shared-item/shopping); **add zod**; **stop auto-dispatching** — render fragments as an editable draft.

**Routing cache** — `workers/ai-proxy/src/router/vectorize.ts` (Cloudflare Vectorize, live) + `supabase/migrations/20260521000001_routing_cache.sql` (pgvector). Voyage 1024-dim, per-user namespace. **Adapt** — re-namespace to household/user; strong cost-saver for repetitive "bought milk" dumps.

### OCR / receipt parsing

**Vision** — `workers/ai-proxy/src/router/vision.ts` · `visionExtract()`; prompt `VISION_SYSTEM_PROMPT`.

- Model: Gemini 2.5 Flash, `inline_data` base64, temp 0.2, maxTokens 200. **Output is plain prose (1–3 sentences), NOT itemized JSON** — it's prepended to the dump as `[image: …]` text and re-routed through Flow A. No per-item array, no totals.
- Validation: input mime allowlist + size cap only; output unvalidated. No confirm step (feeds auto-write path).
- Roomie reuse: **Adapt engine + Rewrite prompt + output contract.** Keep `compressImage.ts` (**copy** — clean/pure), Gemini multimodal mechanics, mime/size guards. Rewrite prompt to emit JSON `{merchant, total, currency, date, items:[{name,qty,price}]}` (use function-calling like `feed-me.ts > geminiSuggest()`), add zod, land result on the **draft/confirm screen**.

### Shopping list

**Repo** — `apps/native/src/modules/grocery/repo.ts` · `shopping` (`list/add/remove/removeByName/listOpen/markPurchased`) + `pantry` (`add/touch/archive/use/setPredictedOut/...`). Upsert-by-normalized-name, purchase-log append (feeds cadence), archive-not-delete. **Single-user, no owner column → Rewrite** for shared server-side list with `household_id` + `added_by` and conflict handling. Keep the _patterns_ (upsert-by-name, archive, purchase-log).

### Notifications / reminders

**Dispatcher** — `packages/notifications/src/index.ts` · `notify()` (dedupe 24h, per-category mute, daily cap, aggregation, `schedule_at`, quiet-hours suppression) + `backends/web.ts` `webBackend` (Web Notifications API + setTimeout). Category enum is `REMINDER | PATTERN_ALERT | CONTENT_DELIVERY` (no engagement/streak guilt). **Copy** (dispatcher + web backend + budget/aggregator/suppression). Drop APNs/Tauri/Electron/Capacitor backends. App-closed PWA push (Web Push/VAPID) is **net-new**.

---

## 4. Algorithms and Business Logic

| Name                              | Path                                                    | Description                                                             | Inputs                                         | Outputs                                          | Edge cases                                    | Roomie adaptation                                                           |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------- |
| Purchase-interval (cadence)       | `packages/cadence/src/index.ts` `computeCadence`        | Median-of-gaps interval + confidence tier                               | `{ts,label}[]`                                 | `{medianIntervalMs, confidence, nextExpectedTs}` | <2 samples, irregular cv, bad ts              | Filter events by household/person; otherwise as-is                          |
| Replenish prediction              | `apps/native/.../grocery/predict.ts` `predictOutAt`     | Cadence-or-shelf → run-out ms, capped                                   | `{lastPurchaseMs, cadenceDays, shelfLifeDays}` | ms or null                                       | non-finite, 0-day, cap at 180d                | Shared pantry; recompute on any roommate's purchase                         |
| Spoilage banding                  | `apps/native/.../grocery/aging.ts` `ageOf`              | Elapsed/shelf ratio → 4 states                                          | `(addedAtMs, shelfLifeDays, nowMs)`            | state enum                                       | null shelf-life → fresh                       | As-is                                                                       |
| Missing-ingredient / recipe match | `packages/logic/src/grocery/recipes.ts` `inferRecipe`   | Pantry coverage scoring, expiry bonus, have/missing split               | `{pantry, items, dishHint}`                    | `{dish, have, missing, copy}`                    | empty pantry → null                           | Shared pantry; reconcile diets                                              |
| Pantry pattern detection          | `packages/logic/src/grocery/patterns.ts`                | Duplicate-buy / near-expiry / replenish / staple / stale-list / cadence | `GroceryHistory`                               | `*Signal` or null                                | per-detector try/catch, missing ts            | Add `boughtBy`/`addedBy`; group by household                                |
| AI intent classification          | `workers/ai-proxy/.../dump-classify.ts`                 | LLM → module/action fragments, confidence tiers                         | `{text, image?, locale?}` + JWT                | `RouterOutput.fragments[]`                       | JSON repair, count mismatch, cascade fallback | Roomie domains; add zod; draft not write                                    |
| OCR normalization                 | `workers/ai-proxy/src/router/vision.ts` `visionExtract` | Image → **prose** facts (not structured)                                | `{mime, base64}`                               | text string                                      | mime allowlist, size cap                      | Rewrite to structured JSON + confirm screen                                 |
| Expense calculation               | —                                                       | **Does not exist**                                                      | —                                              | —                                                | —                                             | **Build fresh:** equal/exact/%/shares split + remainder allocation          |
| Who-owes-whom / settlement        | —                                                       | **Does not exist**                                                      | —                                              | —                                                | —                                             | **Build fresh:** net-balance + debt-minimization (greatest-creditor/debtor) |
| Chore rotation / "who did it"     | —                                                       | **Does not exist**                                                      | —                                              | —                                                | —                                             | **Build fresh**                                                             |

**Critical gap:** the two algorithms at Roomie's commercial heart — **even/weighted expense split with rounding-remainder allocation** (e.g. €10/3 → 3.34/3.33/3.33) and **debt-minimizing settlement netting** — have **no precedent in Ollie**. Ollie only does `round2` on single amounts, never remainder distribution across people.

---

## 5. Data Model Analysis

**Current Ollie model is single-user, local-first, with no household concept.** Two coexisting keying regimes:

- **Regime A — Supabase Auth `uuid`, RLS `auth.uid() = user_id`:** `encrypted_state` (`20260512000001`), `profiles` (`...002`), `scheduled_jobs` (`20260513000001`), `finance_records` (`20260514000008`), `push_tokens` (`20260515000001`). **These RLS policies are effectively dead** — the app authenticates with Clerk, so `auth.uid()` is always NULL at runtime.
- **Regime B — Clerk `text` id, service-role-only (worker enforces ownership in code):** `partner_codes`/`partner_pairs`/`partner_snapshots` (`20260602103016`), `cook_history` (retyped uuid→text in `20260530144446`), `grocery_purchase_history` (`20260522000001`), `routing_cache` (`20260521000001`, shared), telemetry tables, `invites` (`20260514000016`).

**Local state:** `packages/store` keys `void.state.<module>.v5` in localStorage — **no user/household namespace**. Native product data lives in per-module SQLite (`apps/native/src/modules/*/migrate.ts`: `grocery_pantry`, `grocery_shopping`, `grocery_purchase_log`, `grocery_cook_history`) — **none has a `user_id`/`household_id` column**. Device == user == implicit single tenant.

**Auth:** Clerk owns identity (`ClerkProvider` in `apps/native/src/main.tsx`); `@ollie/auth` is now only a passphrase→key vault. Clerk JWT → worker → `service_role` is the de-facto working access path.

**Reusable for Roomie:** the _shapes_ `PantryItem`/`ShoppingItem` (good starting schema, add owner fields); the migrate.ts pattern (idempotent `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` backfill); the pairing-code/invite table shapes.

**Must change for multi-user / household-based Roomie:**

| Roomie entity                                  | Ollie precedent                                         | Action                               |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `users`                                        | Clerk identity                                          | Reuse Clerk (or pick one provider)   |
| `homes/households`                             | **none**                                                | New                                  |
| `household_members(household_id,user_id,role)` | `partner_pairs` (1:1 only)                              | New (generalize the pair table)      |
| `expenses`                                     | `finance_records` (single-owner, no payer/participants) | New (`paid_by`, `household_id`)      |
| `expense_splits`                               | **none**                                                | New                                  |
| `settlements`                                  | **none**                                                | New                                  |
| `pantry_items`                                 | `grocery_pantry` (no owner)                             | New (add `household_id`, `added_by`) |
| `shopping_items`                               | `grocery_shopping` (no owner)                           | New (add `household_id`, `added_by`) |
| `meals/votes`                                  | feed-me suggestions (per-user, no vote)                 | New (votes net-new)                  |
| `chores` / `chore_assignments` / `task_events` | **none**                                                | New                                  |
| `absences/favors`                              | partner go-dark flags (pattern only)                    | New (later)                          |

---

## 6. Multi-user Migration Risks

1. **Local-only single-tenant state** — `packages/store/store.ts` localStorage keys have no user/household namespace; all `apps/native/src/modules/*/migrate.ts` SQLite tables have **no owner column**. Every Roomie table needs `household_id` + `created_by`.
2. **Whole-blob LWW sync** — `packages/sync/index.ts` last-writes-wins on entire module blobs. Two roommates editing the shopping list → one clobbers the other. Roomie needs **per-row/per-entity** sync.
3. **Per-user passphrase encryption blocks shared reads** — `packages/crypto` + `packages/sync` encrypt `encrypted_state` under a key that never leaves one device. A roommate cannot decrypt another's blob. **Shared household tables must be plaintext + `household_id` RLS**, not this envelope. (The Partner feature already conceded exactly this: it relays _plaintext interpreted phrases_ server-side rather than sharing encrypted state.)
4. **Auth identity split** — half the migrations assume Supabase-Auth `uuid`; the app is Clerk `text`; RLS is effectively off (service-role bypass). **Do not inherit.** Pick Clerk-only and write RLS on `auth.jwt()->>'sub'`, or go deliberately service-role-only.
5. **No conflict resolution** beyond LWW; no merge for concurrent edits.
6. **Hardcoded N=2 in Partner** — `partner_pairs(user_lo,user_hi)` and one-snapshot-per-user-read-the-other don't generalize to N-member households.
7. **No shared mutable record anywhere** — Ollie has never modeled a row two users can both edit. Roomie's `expenses`/`chores`/`pantry` are exactly that — net-new territory.

---

## 7. AI/OCR Migration Notes

**Roomie hard rule: AI/OCR output creates a DRAFT only — never writes final data without explicit user confirmation.** Ollie violates this today.

| Flow          | Prompt location                                                | Model/provider                                          | Input                                 | Output schema                 | Validated?                                             | Confirm step?                      | Roomie adaptation                                                                                 |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- | ----------------------------- | ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Text classify | `workers/ai-proxy/.../dump-classify.ts` `SYSTEM_PROMPT`        | Groq `gpt-oss-120b` JSON → CF/Gemini/OpenRouter cascade | `{text, image?, locale?}` + Clerk JWT | `RouterOutput.fragments[]`    | **Weak** (JSON.parse + count; no zod; payload untyped) | **No — auto-writes**               | Keep pipeline; Roomie domains; add zod; render fragments as editable draft, write only on confirm |
| Vision OCR    | `workers/ai-proxy/src/router/vision.ts` `VISION_SYSTEM_PROMPT` | Gemini 2.5 Flash                                        | `{mime, base64}`                      | **Plain prose**, not itemized | Input guards only                                      | **No**                             | Rewrite prompt → JSON `{merchant,total,currency,date,items[]}`; add zod; land on confirm screen   |
| Voice         | `workers/ai-proxy/src/router/transcribe.ts`                    | Groq `whisper-large-v3-turbo`                           | audio                                 | `{text}`                      | —                                                      | **Yes** (pre-fills input for edit) | Copy if needed — already edit-before-write                                                        |
| Routing cache | `vectorize.ts` + `20260521000001_routing_cache.sql`            | Voyage `voyage-multilingual-2` (1024-dim)               | embedding                             | cached classification         | service-role RLS                                       | n/a                                | Re-namespace to household/user                                                                    |

**The one architectural inversion Roomie must make:** Ollie's flow is **AI result → `dispatchRouterOutput()` → immediate SQLite write → optional `NeedsConfirmCard` undo** (`apps/native/src/dump/DumpScreen.tsx`, `modules/dispatch.ts`, `modules/grocery/handler.ts`; `NeedsConfirmCard.tsx:28` literally notes "the write already happened"). The `/route/dump` worker itself **never persists** — all writes are client-side. So: keep the worker as a **pure draft generator**, and on the Roomie client **do not call dispatch** — render fragments + OCR items into an edit form, add the zod validation Ollie lacks, and persist only on user confirm.

**Models/keys the AI path needs:** `GROQ_API_KEY`, `GEMINI_API_KEY`, `VOYAGE_API_KEY`, `OPENROUTER_API_KEY` (optional), `CLERK_ISSUER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`; bindings `VECTORIZE_INDEX`, `AI`, `CACHE_KV`, `RATE_KV`. Voyage/Gemini/CF tokens are flagged for rotation (chat-exposed) — rotate before reuse.

---

## 8. Dependency Review

| Dependency                                                                        | Current use                      | Keep for Roomie? | Notes                                                       |
| --------------------------------------------------------------------------------- | -------------------------------- | ---------------- | ----------------------------------------------------------- |
| `react` / `react-dom` ^19.1                                                       | UI runtime                       | **Yes**          | PWA-ready                                                   |
| `react-router` ^7.15                                                              | Routing                          | **Yes**          | Web-standard                                                |
| `@supabase/supabase-js` ^2.106                                                    | Auth/DB/sync                     | **Yes**          | Browser SDK, PWA-safe                                       |
| `@clerk/clerk-react` ^5.61                                                        | Auth                             | **Maybe**        | Works in web; or pick own                                   |
| `vite` ^7 / `vitest` ^2.1 / `jsdom`                                               | Build/test                       | **Yes**          | Add `vite-plugin-pwa` (absent in Ollie)                     |
| `@fontsource/dm-*`                                                                | Editorial fonts                  | **Maybe**        | Only if inheriting design DNA                               |
| `zxcvbn` ^4.4                                                                     | Passphrase strength              | **Maybe**        | Only if passphrase crypto                                   |
| `itty-router` ^5                                                                  | CF Worker routing                | **Maybe**        | Only if reusing workers                                     |
| `@tauri-apps/api` + plugins (`-sql`, `-store`, `-notification`, `-opener`, `cli`) | Native shell/SQLite/KV/OS-notify | **No**           | Tauri-only; PWA uses Supabase/IndexedDB + Web Notifications |
| Voyage / Gemini / Groq / OpenRouter (server)                                      | AI cascade                       | **Maybe**        | Backend-only; paid/external; rotate keys                    |
| Plaid (`PLAID_*`)                                                                 | Bank linking                     | **No**           | Removed from Ollie product                                  |
| APNs (`@ollie/apns-jwt`, Apple\* secrets)                                         | Apple push                       | **No**           | Apple-only                                                  |

**Env vars (names only):** client — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_AI_PROXY_URL`, `VITE_SENTRY_DSN`/`VITE_SENTRY_TUNNEL_URL`, `VITE_USER_HASH_SALT`. Worker secrets — `GROQ_API_KEY`, `GEMINI_API_KEY`, `VOYAGE_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE`, `CLERK_ISSUER`, `T0_JWT_ENFORCED`. Skip — `APNS_*`, `APPLE_*`, `PLAID_*`. **Do not copy `.env`/`.env.local` verbatim** (plaintext keys, flagged for rotation) — copy `.env.local.example` placeholders.

---

## 9. Candidate Code to Copy

| Source path                                                                                    | Copy to Roomie? | Direct or adapt             | Why                                                     |
| ---------------------------------------------------------------------------------------------- | --------------- | --------------------------- | ------------------------------------------------------- |
| `packages/cadence/`                                                                            | Yes             | **Direct**                  | Pure, generic, 28 tests; restock/bills/chores           |
| `packages/logic/src/grocery/parse.ts` + `data.ts` (alias/recipe tables)                        | Yes             | **Direct**                  | Pure offline parser + recipe engine                     |
| `packages/logic/src/grocery/recipes.ts`                                                        | Yes             | **Direct**                  | Pure recipe matcher                                     |
| `apps/native/src/modules/grocery/{predict,aging,pushTrigger}.ts`                               | Yes             | **Direct**                  | Pure, no Tauri deps                                     |
| `packages/logic/src/grocery/patterns.ts`                                                       | Yes             | **Adapt**                   | Add owner field; strip citations                        |
| `packages/notifications/` (dispatcher, `backends/web.ts`, budget/aggregator/suppression/types) | Yes             | **Direct**                  | Backend-agnostic, web backend, 51 tests                 |
| `packages/pii-scrub/`                                                                          | Yes             | **Direct**                  | Locale-aware redaction, 76 tests                        |
| `packages/crypto/`                                                                             | Yes             | **Direct**                  | WebCrypto AES-GCM/PBKDF2 (private fields only)          |
| `packages/events/`                                                                             | Yes             | **Direct**                  | Typed bus, no DOM dep                                   |
| `packages/store/` (`browserAdapter` + `react.ts`)                                              | Yes             | **Adapt**                   | Local UI cache; add scoping                             |
| `apps/native/src/api/{workers.ts (skeleton), supabase.ts}`                                     | Yes             | **Adapt**                   | `ApiResult`/`post()` never-throw + lazy Supabase client |
| `apps/native/src/{layout,ui,theme}/`                                                           | Yes             | **Direct** (rebrand tokens) | Generic primitives, no Tauri imports                    |
| `apps/native/src/lib/formatRelativeTime.ts` + `WhenCaption.tsx`                                | Yes             | **Direct**                  | Generic Intl-aware timestamps                           |
| `apps/native/src/dump/compressImage.ts`                                                        | Yes             | **Direct**                  | Pure image prep for OCR                                 |
| `apps/native/src/modules/finance/types.ts` (currency/merchant normalizers)                     | Yes             | **Direct**                  | Trilingual-currency aware                               |
| `packages/logic/src/finance/math.ts`, `export.ts` (`escapeCsvField`)                           | Yes             | **Direct**                  | Generic stats + RFC-4180 CSV                            |
| `workers/ai-proxy/` (cascade, cache, vision, feed-me)                                          | Yes             | **Adapt**                   | Pipeline reused; prompts + scoping rewritten            |
| `apps/native/src/modules/*/migrate.ts` (pattern)                                               | Pattern only    | **Adapt**                   | Idempotent migration shape                              |

---

## 10. Candidate Code to Avoid

| Source                                                                                                                                | Why avoid                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/native/src/modules/*/repo.ts` + `migrate.ts` (as-is)                                                                            | Single-user local SQLite, no owner column — blocks multi-user                   |
| `packages/sync/` (whole-blob LWW)                                                                                                     | Clobbers concurrent roommate edits                                              |
| Per-user passphrase encryption for shared data (`packages/auth` + crypto+sync path)                                                   | Blocks cross-user reads of shared household data                                |
| Supabase-Auth `auth.uid()` RLS migrations                                                                                             | Dead at runtime (Clerk identity); inheriting propagates a broken security model |
| `apps/native/src/storage/{sqlite,kv}.ts`, `notify/systemNotify.ts`                                                                    | Tauri-only                                                                      |
| `packages/apns-jwt/`, `workers/apns-push/`, `workers/cron` APNs path                                                                  | Apple-only                                                                      |
| Plaid tables/workers (`plaid_items`, `plaid_inbox`, `PLAID_*`)                                                                        | Removed product feature, dead                                                   |
| `dispatch.ts` + `NeedsConfirmCard.tsx` (write-then-undo)                                                                              | Violates Roomie draft-first rule                                                |
| Finance: ADHD-tax, tax-setaside, BSAS, cycle/sleep correlation, safe-to-spend, subscription dormancy/audit, savings-from-cancellation | Ollie product DNA, irrelevant to roommates                                      |
| `packages/logic/src/products/` (period-product forecast), pet-feed config                                                             | Out of Roomie scope                                                             |
| `.env` / `.env.local` (verbatim)                                                                                                      | Plaintext keys flagged for rotation — security risk                             |

---

## 11. Suggested Roomie Extraction Plan

1. **Extract pure utility logic first** — vendor `@ollie/cadence`, `packages/logic/src/util` + `/stats`, `@ollie/events`, `formatRelativeTime`, layout/ui/theme primitives, `ApiResult`/`post()` + Supabase client, `compressImage`. All zero-Tauri, well-tested. Verify tests pass in Roomie's toolchain.
2. **Extract pantry algorithms** — `predictOutAt`, `ageOf`, `parseGroceryItem` + alias table, `shouldPushReminder`. Copy `patterns.ts` and **add `addedBy`/`boughtBy`** to `PantryItem`/`ShoppingItem` shapes.
3. **Extract Feed Me logic** — `inferRecipe` + recipe table as offline engine; stand up `workers/ai-proxy` feed-me with cascade + cache + PII-scrub, re-scoped `/feed-me/:household`, drop pet-feed, add diet reconciliation.
4. **Build finance fresh, reusing only normalizers** — copy currency/merchant normalizers + `getMonthlyBurn` bucketing pattern; **implement net-new** `expenses`/`expense_splits`/`settlements`, even/weighted split with remainder allocation, and who-owes-whom debt-minimization netting.
5. **Extract AI/OCR prompts as draft generators** — reuse the worker pipeline; rewrite prompts to Roomie domains; rewrite vision prompt to structured JSON; add **zod** at the draft boundary.
6. **Rewrite persistence around Roomie's household schema** — `households` + `household_members` + every product table with `household_id` + `created_by`; Clerk-`sub` RLS or deliberate service-role; per-row sync (not whole-blob LWW); shared tables plaintext, not per-user encrypted.
7. **Add confirmation screens before saving AI/OCR results** — invert Ollie's write-then-undo: fragments/OCR → editable draft → explicit confirm → write. Reuse intake UX (`BrainDumpInput`, `PhotoIntake`, `MicButton`) but **remove the auto-dispatch wiring**.
8. **(Net-new, no Ollie source)** — Tasks/chores module (rotation, "who did it", assignments), votes on meals, Web Push (VAPID) for app-closed PWA reminders.

---

## 12. Open Questions for the Founder

1. **Auth provider:** Clerk (Ollie's choice, JWT→worker→service-role works) or Supabase Auth (cleaner RLS via `auth.uid()`)? Ollie's split is a bug — Roomie must pick one up front. → _which one?_
2. **Access model for shared data:** Clerk-JWT RLS (`auth.jwt()->>'sub'` in `household_members`) vs worker-mediated service-role writes? Affects every table's security.
3. **Encryption posture:** confirm shared household data (expenses/chores/pantry) is **plaintext + RLS** (per-user encryption blocks roommate reads). Any field that must stay private per-person?
4. **Split model scope for v1:** equal-only, or also exact-amount / percentage / shares? Drives `expense_splits` schema and the split UI.
5. **Settlement netting:** simple pairwise balances, or debt-minimization (fewest transactions)? Both are net-new; minimization is more work.
6. **Rounding-remainder policy:** when a cost doesn't divide evenly (€10/3), who absorbs the extra cent — payer, rotating, or random? Needs an explicit rule.
7. **Diet reconciliation for Feed Me:** when roommates have conflicting diets, intersection / strictest-wins / per-person suggestions? Net-new logic.
8. **OCR depth for v1:** full itemized receipt (each line → split target) or just merchant+total as one expense? Determines vision prompt + draft-screen complexity.
9. **Shelf-life data:** vendor the 721-item `workers/ai-proxy/src/modules/grocery.config.ts` dataset, or ship with only the ~150-item `ALIAS_TABLE`?
10. **App-closed reminders:** is Web Push (VAPID) in scope for v1, or are in-app/foreground reminders enough at launch? No reusable push implementation exists.
11. **Cook-history learning:** aggregate per-household or keep per-roommate taste signals?
12. **Reuse mechanism:** vendor (copy files into Roomie, per the started-separate-repo decision) vs publish `@ollie/*` as shared packages? Affects how updates flow.

---

### Uncertainties / not exhaustively read

- `workers/ai-proxy/src/modules/grocery.config.ts` (~1700 lines) confirmed to exist + referenced, not read in full.
- `FinanceBox.tsx` / `finance/bridge.ts` UI not read line-by-line, but exports + grep confirm no split/settlement concepts (high confidence).
- GEMINI/VOYAGE/OPENROUTER worker secrets are set via `wrangler secret put` (commented in toml), not all visible in plaintext config.
