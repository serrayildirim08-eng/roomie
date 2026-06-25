# Roomie — Full Audit (2026-06-24)

Branch: `feat/t5-perms` · ~5,249 LOC TS/TSX · Expo SDK 56 / React 19 / InstantDB / Clerk / Cloudflare Worker "brain"
Source: 20 confidence-scored lane syntheses (3 rounds each). This is the consolidated principal-engineer report.

---

## 1. Overall Verdict

**Needs focused cleanup before more features.**

The foundation is genuinely solid — money math, chore rotation, the brain Zod parser, and the Clerk↔Instant bridge are well-built and the existing 27 tests pass clean. But the app is **not safe to hand to a single beta tester today** because of two interlocking P0 ops/access problems plus a cluster of money-trust and access-control P1s. None of these need a rewrite. They need a focused, sequenced fix pass (estimated a few days), then the app is dogfood-ready.

---

## 2. Plain-English Summary

Roomie is a shared-house app for roommates: split money fairly, track who buys groceries, rotate chores, and type plain sentences that an AI sorts into the right place. The engine room (the math, the rotation, the AI parsing) works well. The problems are around the edges: the database security rules were written but **may not be switched on yet** (so right now anyone logged in could read every house's data), and even once you switch them on, **the "join a house" feature breaks** because of how the rules and the join screen interact. On top of that there are a handful of money-trust bugs — one person can mark another's debt as paid without consent, and when someone leaves the house their money silently disappears from the balances. Fix those in order and it's ready for the Rotterdam flat to dogfood.

---

## 3. What This App Is

"Shared-house OS for roommates." A multi-tenant (household-scoped) Expo/React Native app where members:
- **Money**: log shared expenses, see simplified debts, settle up.
- **Kitchen**: track a pantry with shelf-life aging, shopping list, claim/restock, and a "Got it" bridge that turns a restock into a split expense.
- **Tasks**: house chores on a fair chronological rotation + private personal to-dos.
- **Brain**: a natural-language input box ("süt aldım 5€") that an AI (Cloudflare Worker → Groq/CF-AI) parses into draft fragments the user confirms before anything is written.
- **Activity**: a chronological home diary (no scores, no streaks — by design).

Product rules locked & respected in this audit: no streaks/points/leaderboards/shame, chores = chronological history only, extreme-minimal ADHD-first UI, warm editorial look, mock-before-build.

---

## 4. Core User Flows (each assessed)

| Flow | State | Verdict |
|---|---|---|
| Sign up / verify email | Works, but no resend-code, no forgot-password, no keyboard chaining | **Partial** — friction-heavy first run |
| Create a household | Works | **OK** |
| **Join a household by code** | **BROKEN once perms are pushed** — preflight query requires membership the joiner doesn't have yet | **P0 broken** |
| Add a shared expense | Works (manual path has error handling) | **OK** |
| See debts / settle up | Works, but Settle has no confirm, no busy guard, wrong actor logged, creditor can forge debtor's payment | **Partial / trust bug** |
| A roommate leaves | Money silently miscomputes; ex-member keeps read+write access | **Broken** |
| Pantry add / aging / restock | Works; aging state machine collapsed to a boolean in UI (no auto-archive) | **Partial** |
| Chore rotation + Done/Pass | Works; double-tap and concurrent Done create duplicate permanent events | **Partial** |
| Brain: type → draft → confirm | Works on CF-AI fallback (Groq likely never reached); no timeout; question-only state has no input field | **Partial** |

---

## 5. Feature Inventory

| Feature | Status | Value | Risk | Evidence | Priority |
|---|---|---|---|---|---|
| Money split + simplifyDebts | working | High | Removed-member math loss | money-logic.ts, 19 tests | P1 |
| Settle up | partial | High | Forge/double-settle/no confirm | money-screen.tsx:183-197,277-291 | P1 |
| Chore rotation | working | High | Double-tap/concurrent dup events | rotation.ts, tasks-screen.tsx | P2 |
| Personal tasks | working | Med | Delete no confirm; never purged | tasks-screen.tsx:164-170 | P2 |
| Pantry + aging | partial | Med | 4-state machine → boolean; no auto-archive; invisible dot | kitchen-screen.tsx:321,419 | P2/P3 |
| Kitchen "Got it" bridge | working | Med | Splits with all members always | kitchen-screen.tsx:198-201 | P3 |
| Brain NL input | partial | High | Groq model invalid; no timeout; no client validation | groq.ts:13, brain-input.tsx | P1/P2 |
| Activity feed | working | Med | Stores raw titles permanently; 50-cap silent | activity-feed.tsx:13-19 | P2/P3 |
| Auth (Clerk) | partial | High | No reset/resend; Expo Go breaks token cache | auth-screen.tsx, README:29 | P1/P2 |
| Household perms (T5) | unknown | Critical | May not be pushed to InstantDB | CHECKLIST:157, no push evidence | **P0** |
| OCR receipt scan (Faz 6) | not built | Flagship | Marketed as "the heart" | CHECKLIST:143-149 | P1 (scope) |

---

## 6. Tech Stack Map

- **Client**: Expo SDK 56, React 19, React Native 0.85, expo-router file routes (`src/app/{index,money,kitchen,tasks,_layout}.tsx`), `expo-router/unstable-native-tabs` (semver-unstable, pinned).
- **DB + sync**: InstantDB (`@instantdb/react-native`) — live queries, perms in `instant.perms.ts`, schema in `instant.schema.ts`.
- **Auth**: Clerk (`@clerk/expo`) + `instant-clerk-bridge.tsx` mints an Instant identity from the Clerk JWT. **Dual-auth (Clerk = identity, Instant = data) — both required.**
- **AI brain**: Cloudflare Worker `workers/brain` — Clerk JWT verify (JOSE) → Groq JSON mode → CF Workers AI fallback → Zod salvage parser.
- **Tests**: vitest, 27 tests (19 money + 8 rotation). No e2e, no worker tests, no CI.
- **Secrets**: `.env.local` (client) + `workers/brain/.dev.vars` (worker). *(Values not printed; risks noted by path.)*

---

## 7. Architecture Assessment

Coherent and appropriately minimal for pre-alpha. Two real structural concerns:
1. **Inverted dependency direction**: `nowMs`/`parseAmountToCents`/`formatEur` live in `money-logic.ts` but are imported by tasks, kitchen, and brain. Should move to `src/lib/`.
2. **`brain/apply.ts` is a cross-feature god-writer** — directly writes 6 entity types across 4 modules in ~153 lines. Fine at 4 modules; becomes a bottleneck at module 5-6. Defer.
3. **Worker/client `Target` type is hand-synced** with no compile-time exhaustiveness check — a new worker target silently lands in `skipped`.

Nothing here demands a refactor now.

---

## 8. Frontend

- **Three feature screens re-declare** `emailName`, `Centered`, `PrimaryButton`, the input style block (6 copies), and the household membership query independently. Divergence already exists (button padding 15 vs 16; money screen uses `#c0392b` vs `Roomie.danger`).
- **Missing `isLoading` guard** on Money/Tasks/Kitchen tabs → flash of "Sign in first." on every launch (Home does it right).
- **No error boundary anywhere** — any render throw white-screens the whole app.
- **`BottomTabInset` defined but imported nowhere** → last row of every list hidden behind the native tab bar on Money/Kitchen/Tasks.
- Index-as-React-key in debt list and brain fragments → state corruption on fragment delete.

## 9. Backend / Worker

- **Groq model ID `openai/gpt-oss-120b` is almost certainly invalid** (Groq uses flat IDs like `llama-3.3-70b-versatile`). Every call silently falls to CF Workers AI. *(needs-runtime-verification via `wrangler tail` → check `source`.)*
- **No fetch timeout** on Groq or CF-AI calls → a stalled upstream hangs the worker to the ~25-30s CF wall-clock; the Groq stall never triggers the CF fallback.
- **Per-isolate rate cap** (`let capCount`) is not per-user and resets on cold start → no real budget guard, and one user can 429 all housemates in an isolate. Off-by-one allows 201/day.
- **JWT verify checks issuer only** — no `aud`/`azp` → cross-app token reuse if Clerk instance is shared (Roomie/Ollie).
- **Zero worker tests** despite a built-in `_resetClerkJwksCache` test seam.

## 10. Data Model

- Clean, compact schema. Holes are in perms (see §11), not shape.
- **`profiles` entity** fully defined in schema + perms, **never read or written** (displayName is denormalized on memberships). Dead weight.
- Deleting a chore **orphans its choreEvents** (no cascade) — UI promises "history removed", DB keeps them unreachable forever. Fix: batch-delete `chore.events` (already in memory).
- `personalTasks` done rows never purged; `currency` field always 'EUR' and never read.
- No uniqueness guard on memberships → leave+rejoin / double-tap creates duplicate active rows; all screens read `memberships[0]` non-deterministically.

## 11. Auth / Permissions

The T5 layer correctly isolates households from strangers **but**:
- **`memberOfHousehold` has no status filter** → removed members keep full read **and write** (comment says "read" — code grants CRUD).
- **`memberships.delete = isMember`** → any member can evict the owner (P0).
- **`memberships.update = isSelf || isMember`** → any member can self-promote to owner or kick others.
- **`households.view = isMember`** breaks the join flow (P0, see §24).
- **`memberships.create = isSelf`** with no invite gating → anyone with the household UUID self-joins (#34).
- **`settlements.create` / `expenses.delete` / `activityEvents.create`** not actor-scoped → forge settlement, delete anyone's expense, spoof diary entries.
- **`households.update = isMember`** → any member can rename the home.

## 12. Security (P0/P1/P2 only)

**P0**
- T5 perms likely **not pushed** to InstantDB → DB default-ALLOW; any authenticated Clerk user reads/writes every household. *(needs-runtime-verification — pull perms and diff.)*
- Member eviction: any member can delete the owner's membership row directly via SDK.

**P1**
- Settlement impersonation: creditor can record "debtor paid" without consent.
- Membership role escalation: any member → `role:'owner'`.
- Removed members retain full read+write to all household data.
- Invite code == raw household UUID, no expiry/revocation.

**P2**
- Any member can delete any expense/settlement (no authorship guard).
- Per-isolate AI cap is not a real cost guard; CORS wildcard on worker; missing `aud`/`azp` claim check.
- `CLERK_SECRET_KEY` present in `.env.local` (gitignored, unused by code, wrong scope — backend admin secret next to client code). Remove it.

## 13. Privacy

- Removed members keep reading all new household data until their row is physically deleted (acknowledged design tradeoff — but the **write** side is an unintended bug).
- **User free-text goes to Groq on every Send with zero in-app disclosure** — notes may contain medical/financial/legal text. Needs a one-time consent modal before the first call. (P1)
- `activityEvents` store raw expense titles + amounts permanently, no deletion path (delete=false) — sensitive labels ("therapy", "legal fees") live forever and survive expense deletion.
- **No account deletion / right-to-erasure** path anywhere → GDPR/CCPA/KVKK blocker for any EU/CA launch.
- Housemate **email addresses** are exposed client-side via `user: {}` expansion in 3 screen queries.
- `personalTasks` schema comment signals a future household-scope perm flip ("need a favor") that would silently expose private tasks — add a `visibility` field before that ships.

## 14. Validation

- **`parseAmountToCents` has no upper bound** (`return cents>0 ? cents : null`) → a fat-finger "999999" writes a ~€10M expense to the live ledger. Worker caps AI amounts at €5000 but manual + inline-edit paths bypass it. (P1)
- **No `maxLength` on any TextInput** — unbounded strings into every entity, inflating sync payloads.
- `JoinHousehold` sends arbitrary input straight to `queryOnce` (UUID regex exists but is only used in the create path, not join).
- Brain response is type-cast, not runtime-validated client-side.

## 15. UI/UX

- **Settle** fires irreversible write with no confirm, no busy guard, wrong `actorId`. (P1)
- **Chore row packs 5 interactive targets** into one horizontal line — chore name clipped to ~85pt on a 375pt phone; Pass/Done below the 44pt iOS touch minimum; outer+inner Pressable conflict. (P1)
- **Aging dot is `Roomie.hairline` on `Roomie.canvas`** (~1.2:1 contrast) — effectively invisible; aging system's only signal is undetectable.
- Personal-task delete fires with no confirm (chore & expense delete both confirm — inconsistent).
- Dead-end empty states ("Create or join a home first.") with no CTA to Home.
- Expo template leaks: **splash is Expo blue + Expo logo on every sign-in**; web tab bar reads **"Expo Starter"** with a docs.expo.dev link.
- Brain error state renders raw error strings ("http 429") to users.
- Auth: no forgot-password, no resend-code, no keyboard chaining, no `textContentType` (no iOS strong-password / autofill).

## 16. Testing

- Exactly 2 test files (27 tests), both pure-function. **Everything else untested**: parseDraft (the only LLM→DB firewall), aging.ts, normalize.ts, activity.ts, applyFragments, the entire worker, all perms.
- **The existing "removed users" money test pins the BROKEN behavior as correct** (asserts individual values, never `sum === 0`) → false-green.
- **No CI** — the 27 tests run only when a developer remembers. Worker tests are silently excluded from root `npm test`.

## 17. Build / Deploy / DevOps

- **No CI pipeline** (no `.github/`). typecheck/lint/test/format all manual.
- **No `eas.json`, no `ios.bundleIdentifier`/`android.package`** → TestFlight/Play path is impossible without config (Faz 7 blocker).
- **Root `tsconfig.json` `**/*.ts` glob sweeps `workers/brain/src`** under Expo/DOM compiler settings → worker type errors masked; worker has no own typecheck script.
- 22 files fail `format:check` now; no pre-commit hook.
- `scripts/reset-project.js` still wired in package.json → `npm run reset-project` deletes `src/`.
- No staging environment (one Instant app, one worker). No `.env.local.example`. No error monitoring (no Sentry).
- `app.json ios.icon` points to `./assets/expo.icon` (a **directory**, not a PNG) → iOS build fails / blank icon.

## 18. Performance / Reliability

- **MoneyScreen fetches ALL expenses + settlements with no limit** → every keystroke re-computes debt over all history (no `useMemo`); grows with household age. (Only money query lacking a limit.)
- Kitchen/Tasks write handlers have **no try/catch and no busy guard** → silent failures + double-tap duplicates; after T5 push, permission rejections will be swallowed.
- `apply.ts` does N×2-3 serial `db.transact` round-trips per fragment → slow confirm + partial-write risk on abort. Batch into one transact.
- `.unlink({ claimedBy: '' })` when no claimer → undefined InstantDB behavior.
- Kitchen `now` captured at render → aging dots only change on unrelated data pushes (needs a 60s ticker).

## 19. External / AI

- Groq model ID invalid (see §9) — **the single highest-leverage worker fix.**
- Stale Groq API key (chat-exposed per memory) pending rotation at beta gate.
- Bridge swallows all errors silently → user is Clerk-signed-in but Instant-unauthenticated with blank tabs and no retry.
- `getToken()` null → "Bearer null" sent to worker → cryptic 401 after session refresh (should early-exit with "session expired").
- `cloudflare-ai.ts` docstring says "Groq → Gemini → CF" — Gemini was removed; stale.

## 20. Reinvented Wheels / Overengineering

- `react-native-worklets` carried for a single `scheduleOnRN(setVisible, false)` — Reanimated's `runOnJS` already available.
- Themed* primitive layer (ThemedText/ThemedView/useTheme + Colors.dark) is **entirely bypassed** by all 7 product screens (they hardcode `Roomie.*`). It's template-only.
- Spacing token system exists, unused by every feature screen (132+ raw magic numbers).
- Unused direct deps: expo-constants, expo-device, expo-linking, expo-glass-effect.

## 21. Underengineered Areas

- No error boundary, no error monitoring, no CI, no e2e, no worker tests, no fetch timeouts, no input length caps, no account-deletion flow, no staging env, no invite-token layer. These are the gaps that matter for a multi-user money app.

## 22. Dead / Stale Code

- Dead Expo-template components: HintRow, WebBadge, Collapsible, ExternalLink, AnimatedIcon (named export), app-tabs.web.tsx "Expo Starter", themed-text/themed-view (only consumed by the dead set).
- Dead assets: expo-logo, logo-glow, expo-badge*, react-logo*, tutorial-web.
- `profiles` entity (schema+perms, zero usage). `BottomTabInset`, `Fonts`, `linkPrimary` variant — dead exports.
- `scripts/reset-project.js` (dangerous).

## 23. Documentation Audit

- **CHECKLIST.md (the declared single source of truth) is stale**: top banner still points to Faz 3 (done); T5 shown ⬜ though code shipped; test count says "19" (actually 27).
- **ROADMAP_ELI5 / FOUNDATION_ROADMAP / OLLIE_REUSE_AUDIT / PRODUCT_MARKETING_LAUNCH_BRIEF describe a Vite+PWA+Supabase stack that no longer exists** (pivoted to Expo/RN/InstantDB on 2026-06-09) — a literal landmine for any agent following them.
- **README says "open in Expo Go"** — which breaks Clerk token persistence (expo-secure-store unavailable in Expo Go). (P1 doc bug)
- AGENTS.md is a 3-line Expo-docs pointer — no stack, no product rules, no bridge pattern, no "never push perms without review".
- No `.env.local.example`.

## 24. Launch Readiness

**Not launchable to even one external tester today.** The blocking sequence:
1. **Fix the join flow** (remove the preflight query) — *before* pushing perms, or roommate joins break permanently.
2. **Push T5 perms** to InstantDB and run the stranger-account E2E.
3. Close the four P1s (forge-settle, removed-member write, removed-member money loss, per-isolate cap) — they erode the exact money-trust the product sells.
Foundation (money/rotation/parser/bridge) is solid; typecheck + 27 tests green. The risk is concentrated in ops sequence, access control, and missing error handling — all fixable in a focused pass.

---

## 25. Three-Round Finding Matrix (most important)

Sorted by severity then confidence.

| ID | Finding | Sev | Conf | Status | Evidence | User impact | Smallest safe fix |
|---|---|---|---|---|---|---|---|
| F1 | Join flow deadlocks once perms pushed (households.view=isMember + preflight query) | P0 | 3 | confirmed | perms.ts:57; household.tsx:170-173 | No new roommate can ever join | Drop preflight query; transact-first + catch |
| F2 | T5 perms likely not pushed → DB default-ALLOW | P0 | 3 | needs-runtime | CHECKLIST:157; no push artifact | Any Clerk user reads all households | `instant-cli push perms` after F1, then stranger E2E |
| F3 | Any member can delete (evict) any membership incl. owner | P0 | 3 | confirmed | perms.ts:77 `delete:isMember` | Roommate can lock out the owner | `delete: 'isSelf || isCreator'` |
| F4 | Settlement impersonation — creditor forges debtor's payment | P1 | 3 | confirmed | money-screen.tsx:277-291,183-196 | Debt zeroed without consent | Render Settle only when `d.fromId===userId`; perms `isFromUser` |
| F5 | Removed members retain full read+write to all data | P1 | 3 | confirmed | perms.ts:27 (no status filter) | Ex-roommate tampers/reads after leaving | Delete membership on leave; denormalize names |
| F6 | Removed-member money silently lost (net ≠ 0) | P1 | 3 | confirmed | money-screen.tsx:43; money-logic.ts:25 | Wrong balances after anyone leaves | Drop `status:'active'` filter from balance query |
| F7 | Membership role self-escalation to owner | P1 | 3 | confirmed | perms.ts:76 `update:isSelf\|\|isMember` | Privilege escalation | `update: 'isSelf'` (+ field guard on role) |
| F8 | parseAmountToCents has no upper bound | P1 | 3 | confirmed | money-logic.ts:79 | €10M fat-finger corrupts ledger | `cents<=500_000 ? cents : null` |
| F9 | Invite code == raw household UUID, no revocation | P1 | 3 | confirmed | household.tsx:64; perms #34 | UUID leak = permanent self-join | Short single-use inviteToken on household |
| F10 | Groq model ID invalid → silent CF-AI fallback always | P1 | 3 | needs-runtime | groq.ts:13 | Lower quality/slower; cost metrics wrong | `llama-3.3-70b-versatile`; verify via `wrangler tail` |
| F11 | User free-text → Groq with no disclosure | P1 | 3 | confirmed | prompt.ts:41; index.ts:53-65 | Sensitive notes sent to 3rd-party silently | One-time consent modal before first Send |
| F12 | No timeout on Groq/CF-AI fetch | P1 | 3 | confirmed | groq.ts:102; cloudflare-ai.ts:52 | Up to 30s frozen spinner, no fallback | `AbortSignal.timeout(8000)` + race wrapper |
| F13 | Kitchen/Tasks writes: no try/catch, no busy guard | P1 | 3 | confirmed | kitchen/tasks screens | Silent failures + double-tap dups | Wrap handlers; add `disabled` busy flag |
| F14 | Per-isolate AI cap not per-user, resets on cold start | P1 | 3 | confirmed | index.ts:23-35 | One user 429s all housemates | Per-userId Map now; KV counter pre-beta |
| F15 | MoneyScreen unbounded expenses/settlements query | P1 | 3 | confirmed | money-screen.tsx:44-45 | Jank that grows with house age | `limit:200`+order; `useMemo` debt calc |
| F16 | Chore row: 5 targets on one line, sub-44pt taps | P1 | 3 | confirmed | tasks-screen.tsx:224-253 | Unusable on 375pt phones | Two-line layout; move ✕ into history |
| F17 | BottomTabInset unused → content cut behind tab bar | P1 | 3 | confirmed | theme.ts:90 (no import) | Last list rows unreachable | Import + `paddingBottom: inset+24` |
| F18 | iOS icon path is a directory, not a PNG | P2 | 2 | confirmed | app.json:11 | iOS build fails / blank icon | Point to `./assets/images/icon.png` |
| F19 | No CI; 27 tests + format manual-only | P2 | 3 | confirmed | no `.github/` | Regressions reach dogfood unseen | `ci.yml`: typecheck+lint+test+format |
| F20 | No account deletion / erasure path | P2 | 3 | confirmed | grep: no deleteUser | GDPR/KVKK launch blocker | Build delete flow + Clerk webhook |
| F21 | activityEvents store raw titles/amounts forever | P2 | 3 | confirmed | activity.ts:55; perms delete=false | Sensitive labels permanent | Store expenseId, resolve at render |
| F22 | reset-project.js wired in package.json | P1 | 3 | confirmed | package.json:17 | Wipes src/ on accidental run | Delete script + entry |
| F23 | README "open in Expo Go" breaks Clerk token cache | P1 | 3 | confirmed | README:29; token-cache req secure-store | Users silently logged out | Doc: require dev build |
| F24 | Personal-task delete no confirmation | P2 | 3 | confirmed | tasks-screen.tsx:168-170 | Permanent accidental loss | `Alert.alert` like chore delete |
| F25 | Deleting chore orphans choreEvents | P2 | 3 | confirmed | tasks-screen.tsx:204 | Storage leak; false "history removed" | Batch-delete `chore.events` |

---

## 26. P0 / P1 Blockers (ordered — do in this order)

1. **F1 — Fix join flow** (remove preflight `queryOnce`, transact-first + catch). *Must precede F2.*
2. **F2 — Push T5 perms** to InstantDB; run stranger-account E2E; mark CHECKLIST ✅.
3. **F3 — `memberships.delete = 'isSelf || isCreator'`** (stop owner eviction).
4. **F7 — `memberships.update = 'isSelf'`** (stop role escalation / kick).
5. **F4 — Settle: actor-scope** (render only for debtor; perms `isFromUser`; `actorId: userId`; add confirm + busy guard).
6. **F5 — Removed-member access**: delete membership on leave + denormalize names (high-risk; design migration).
7. **F6 — Removed-member money**: drop `status:'active'` filter from balance query.
8. **F8 — parseAmountToCents upper cap** (€5000) + amount `maxLength`.
9. **F10 — Groq model ID** → `llama-3.3-70b-versatile`; verify `source:'groq'`.
10. **F11 — Brain consent modal** before first Send.
11. **F12 — Fetch timeouts** (client + worker).
12. **F13 — try/catch + busy guards** on all Kitchen/Tasks/Settle writes.
13. **F14 — Per-user AI cap**; **F15 — bound MoneyScreen query + useMemo**.
14. **F16 — Chore row two-line layout**; **F17 — BottomTabInset**; **F22 — delete reset-project.js**; **F23 — README dev-build fix**.

## 27. P2 Important Fixes

- F9 invite-token layer · F18 iOS icon · F19 CI · F20 account deletion · F21 activity-title privacy · F24 personal-task delete confirm · F25 choreEvent cascade · expense/settlement authorship guard · CORS allowlist (when web) · `aud`/`azp` JWT check · remove `CLERK_SECRET_KEY` from `.env.local` · email exposure (drop `user:{}`) · maxLength on all inputs · error boundary · root `tsconfig` exclude workers + worker typecheck script · format pass + pre-commit hook.

## 28. P3 / P4 Cleanup

- Extract shared primitives (emailName, Centered, PrimaryButton, input style) · move `nowMs`/`parseAmountToCents` to `src/lib/` · aging 4-state UI + visible dot color · aging 60s ticker · index-key → stable key (debt + brain fragments) · delete dead Expo template components & assets · remove `profiles` entity · personalTasks hard-delete on done · stale doc banners (ROADMAP/FOUNDATION/OLLIE_REUSE/MARKETING) · update AGENTS.md · `.env.local.example` · drop unused deps + react-native-worklets · `shopping_add`→`pantry_out` activity mislabel · Groq retry/backoff · ActivityFeed 50-cap "show more".

---

## 29. Roadmap (3 phases)

### Phase 1 — Stabilize (make it safe for the Rotterdam flat)
- **Goal**: Database secure + join works + money trustworthy + writes don't fail silently.
- **Tasks**: F1→F2 sequence; F3/F7/F4 perms+settle; F5/F6 removed-member; F8 amount cap; F10 Groq; F11 consent; F12 timeouts; F13 error handling; F22 reset-project; F23 README; F18 iOS icon.
- **Likely files**: `instant.perms.ts`, `src/features/household/household.tsx`, `src/features/money/money-screen.tsx` + `money-logic.ts`, `src/features/kitchen/kitchen-screen.tsx`, `src/features/tasks/tasks-screen.tsx`, `workers/brain/src/{groq,index,clerk-verify}.ts`, `src/features/brain/brain-input.tsx`, `app.json`, `package.json`, `README.md`.
- **What NOT to touch**: `money-logic.ts` math, `rotation.ts`, `normalize.ts`, `schema.ts` salvage parser, the Clerk bridge mechanics, any UI per locked product rules.
- **Tests**: removed-member `sum===0` (fix the false-green); settle actor-scope unit; parseAmountToCents cap; perms integration (stranger denied, member allowed); worker schema.test.ts.
- **Exit**: Stranger E2E denied; valid roommate joins; balances sum to zero after a member leaves; no silent write failures; `source:'groq'` confirmed; CHECKLIST T5 ✅.

### Phase 2 — Product-UX completion
- **Goal**: First-run and daily loop feel finished.
- **Tasks**: F16 chore row, F17 insets, F24 confirm, aging UI + dot, auth forgot/resend/chaining/autofill, brain question-input state, dead-end empty-state CTAs, remove Expo branding (splash + web tab), F9 invite-token, error boundary, F20 account deletion + F21 activity privacy.
- **Likely files**: feature screens, `auth-screen.tsx`, `animated-icon.tsx`, `app-tabs.web.tsx`, `_layout.tsx`, `kitchen-screen.tsx` (aging), `instant.schema.ts` (inviteToken, visibility).
- **What NOT to touch**: rotation logic, money math, brain parser.
- **Tests**: snapshot per screen incl. empty/error; aging boundary tests; invite-token reject/accept E2E.
- **Exit**: New tester completes signup→join→first expense→first chore with no dead-ends, no Expo branding, no silent loss.

### Phase 3 — Architecture / scale
- **Goal**: Multi-household-ready + maintainable.
- **Tasks**: CI + worker tests + format hook; KV per-user cap; staging env + eas.json + bundle IDs; shared primitives + `src/lib` move; `apply.ts` → per-module dispatch; worker/client shared Target type; CORS allowlist; aud/azp; OCR (Faz 6) when prioritized.
- **Likely files**: `.github/`, `workers/brain/*`, `eas.json`, `app.json`, new `src/lib/*` + `src/components/*` + `src/hooks/use-household.ts`, `wrangler.toml`.
- **What NOT to touch**: working feature logic during the extraction — move, don't rewrite.
- **Tests**: CI gate on all; KV cap test; per-module applyFragment tests.
- **Exit**: green CI on PR; staging deploy + rollback documented; two households fully isolated.

---

## 30. Top 20 Next Tasks (priority order)

1. **Fix join flow (F1)** — *why*: pushing perms breaks joins permanently; P0; conf 3; `household.tsx`; remove preflight query, transact-first+catch; tests: join-by-code E2E; risk low; impact: multiplayer broken.
2. **Push T5 perms + stranger E2E (F2)** — P0; conf 3; InstantDB CLI; run after F1; tests: stranger denied; risk low; impact: total data exposure.
3. **memberships.delete = isSelf||isCreator (F3)** — P0; conf 3; `instant.perms.ts`; one-line; perms test; risk low; impact: owner eviction.
4. **memberships.update = isSelf (F7)** — P1; conf 3; `instant.perms.ts`; one-line; perms test; risk low; impact: role escalation.
5. **Settle actor-scope + confirm + busy (F4)** — P1; conf 3; `money-screen.tsx` + perms `isFromUser`; render-guard + Alert + flag; unit test; risk low; impact: forged payments.
6. **Removed-member money fix (F6)** — P1; conf 3; `money-screen.tsx`; drop active filter; `sum===0` test; risk med; impact: wrong balances.
7. **Removed-member access (F5)** — P1; conf 3; `household.tsx` + perms; delete row on leave + denormalize; access E2E; risk high; impact: ex-member tampering.
8. **parseAmountToCents cap + maxLength (F8)** — P1; conf 3; `money-logic.ts`; one guard; reject test; risk low; impact: €10M ledger corruption.
9. **Groq model ID (F10)** — P1; conf 3; `groq.ts:13`; one line + verify; smoke test; risk low; impact: degraded AI silently.
10. **Brain consent modal (F11)** — P1; conf 3; `brain-input.tsx`; gate first Send; flag test; risk low; impact: silent 3rd-party data send.
11. **Fetch timeouts (F12)** — P1; conf 3; `brain-input.tsx` + `groq.ts`; AbortSignal; timeout test; risk low; impact: frozen spinner.
12. **Kitchen/Tasks error+busy (F13)** — P1; conf 3; kitchen/tasks screens; wrap+disable; throw test; risk low; impact: silent failures/dups.
13. **Per-user AI cap (F14)** — P1; conf 3; `index.ts`; Map by userId + `>=`; cap test; risk low; impact: one user blocks all.
14. **Bound MoneyScreen query + useMemo (F15)** — P1; conf 3; `money-screen.tsx`; limit+order+memo; 500-row bench; risk low; impact: growing jank.
15. **Chore row two-line layout (F16)** — P1; conf 3; `tasks-screen.tsx`; restructure; 375pt snapshot; risk med; impact: unusable rows.
16. **BottomTabInset (F17)** — P1; conf 3; 3 screens; import+padding; layout assert; risk low; impact: hidden rows.
17. **Delete reset-project.js (F22)** — P1; conf 3; `package.json`+`scripts/`; delete; none; risk low; impact: src wipe.
18. **README dev-build fix (F23)** — P1; conf 3; `README.md`+CHECKLIST; doc edit; manual persist test; risk low; impact: silent logout.
19. **iOS icon path (F18)** — P2; conf 2; `app.json`; one line; eas dry-run; risk low; impact: build fail.
20. **CI pipeline (F19)** — P2; conf 3; `.github/ci.yml`; 20 lines; existing 27 tests gate; risk low; impact: regressions unseen.

---

## 31. Do Not Touch Yet

- `src/features/money/money-logic.ts` math (correct; only the **query** feeding it is wrong).
- `src/features/tasks/rotation.ts` (well-tested).
- `src/features/kitchen/{aging,normalize}.ts` logic (correct; only the **UI** collapses states).
- `workers/brain/src/schema.ts` salvage parser (subtle, correct — add tests, don't edit).
- The Clerk↔Instant bridge mechanics (works; only its error-swallowing needs handling, not its flow).
- `simplifyDebts` greedy algorithm.
- Any UI change that would add streaks/points/shame, busy up the minimal UI, or turn chores into anything but chronological history — **locked product rules**.

## 32. Questions for Serra (decision-blocking only)

1. **Removed-member money policy**: when a roommate leaves before settling, should their share be **auto-forgiven** (books zero out) or **held open as an unsettleable debt**? This decides the F6/F5 fix shape and the test assertions.
2. **Removed-member read access**: is passive read-after-leave acceptable with a cleanup window, or must their data access be cut immediately (requires delete-membership + name-snapshot migration)?
3. **OCR (Faz 6)**: hard gate before any wider share, or explicitly de-scoped from v1 dogfood with marketing updated? (It's described as "the heart" but is 0% built.)
