# Ollie + Roomie — Product, Marketing & Launch Brief

> Grounded in actual code, 2026-06-09. Ollie: `/Users/serrayildirim/ollie` @ `feat/brain`. Roomie: `/Users/serrayildirim/roomie`.
> Honesty rule applied: no invented features; MVP-level / unfinished things flagged explicitly.

## ⚠️ Reality check (read first — it reframes every answer below)

- **Ollie is a real, feature-rich app but NOT launch-ready.** 14 working modules, polished empty/error states, local-first storage. But: **no onboarding**, in-app **sign-up looks unwired**, the deployed AI worker that powers the core "type a sentence → it sorts itself" feature **currently returns 404** (stale deploy), **no analytics fire**, the advertised **encryption layer is dead code**, and it's a **Tauri desktop/iOS app — not a working browser PWA** (browser mode silently loses all data). Status per memory: closed alpha, on an unmerged branch.
- **Roomie is NOT an MVP yet.** It is a fresh Vite + React scaffold. `src/App.tsx` is still the default Vite template (a counter button). Dependencies are only `react` + `react-dom` — no backend, no auth, no modules, no Money/Kitchen/Tasks code. It is a _plan_ (README + ELI5 roadmap + the Ollie-reuse audit), not a product. **There is currently nothing to demo in Roomie.**

Everything below treats Ollie as the existing product and Roomie as a planned product built by vendoring Ollie's logic.

---

# PART A — Product + Marketing Brief

## App 1 — Ollie

**1. App name:** Ollie.

**2. What it does (plain English):** A private, local-first life assistant for the ADHD brain. You "brain-dump" whatever's in your head in one box ("spent $40 at sephora", "milk's out", "dentist next tuesday") and Ollie sorts each fragment into the right life area — groceries, finance, work, meds, mood, sleep, etc. — then quietly surfaces what matters (a bill due, milk to re-buy) without nagging, streaks, or shame.

**3. Main user problem:** ADHD people lose thoughts and drown in app-switching/form-filling. Existing trackers demand structure up front (pick a category, fill fields) — exactly the executive-function tax ADHD brains can't pay. Ollie removes the form: one box, it routes for you, and it never punishes a missed day.

**4. Target users / ICP:** Adults with ADHD (self-identified) who've bounced off Notion/Todoist/budgeting apps because the upkeep is too heavy. Secondary: anyone wanting a calm, anti-gamification personal tracker. The product deliberately avoids leaking the founder's lawyer context — built for everyone, not a niche profession (per design memory).

**5. Core features (in code today):**

- **Brain-dump → auto-route** (`apps/native/src/dump/`, worker `workers/ai-proxy/`): free text classified into module actions with confidence tiers. _(Caveat: deployed worker 404 — see limitations.)_
- **14 modules**, each with real persistence: grocery/pantry, finance, work, goals, admin, mood, body, sleep, cycle, medication, habits, pets, brain, partner.
- **Grocery/pantry intelligence:** spoilage banding, purchase-cadence learning, "milk's out — re-add?" replenishment, recipe suggestion ("Feed Me").
- **Finance:** expense logging, recurring-bill/subscription detection, monthly burn.
- **Ambient "noticings"** (`brain/TodayNoticings.tsx`): surfaces a few relevant things, silent when nothing qualifies.
- **App-closed reminders** via native local notifications + a server `scheduled_jobs` path.
- **No streaks / no leaderboards / no guilt** — a deliberate ADHD-safe stance.

**6. Current MVP limitations (honest):** Core dump-routing 404s against production until the worker is redeployed; no onboarding; in-app sign-up unproven; no product analytics; "encryption" UI/layer is dead code (data is plaintext local); Tauri desktop/iOS only (browser build doesn't persist); voice/OCR exist server-side but OCR returns prose, not structured data; on an unmerged `feat/brain` branch.

**7. Main user workflow:** Sign in (Clerk) → land on the dump box → type a thought → it routes to a module → open a module to see/adjust → reminders fire when something's due.

**8. Activation moment:** The first time a user types one plain sentence and watches it land correctly in the right module **without choosing a category** — e.g. "spent $40 at sephora" appearing as a logged expense. That "it just knew" moment is the whole pitch. _(Today this depends on the worker being live.)_

**9. Possible pricing model:** Freemium. Free local-first core; paid tier (per memory: IAP post-alpha) for the AI brain (cloud routing has real per-dump cost), partner/care-circle sharing, and cloud backup/sync. Honest note: cloud AI calls cost money per dump, so an unlimited free AI tier isn't sustainable — gate AI volume, keep manual logging free.

**10. Competitors / alternatives:** Tiimo, Inflow, Numo (ADHD apps); Finch (gentle self-care); Notion/Todoist/Apple Reminders (general); Bearable/How We Feel (mood/health tracking); plain Notes app.

**11. What makes it different:** (a) One input box that routes itself — no taxonomy to maintain. (b) Constitutionally anti-shame: no streaks/leaderboards. (c) Local-first by default. (d) Breadth — money + groceries + meds + mood + sleep in one calm surface, cross-linked (one sentence can touch two modules, e.g. "bought milk for $5" → pantry + finance).

**12. Technical details that affect marketing/onboarding/trust:**

- **Local-first:** module data lives on-device (SQLite/localStorage). Marketing-safe: "your life data lives on your device." **Caveat: each dump's raw text is sent to a cloud worker** (Cloudflare → AI providers) to classify — so _don't_ claim "nothing ever leaves your device."
- **No at-rest encryption in this build** (encrypted KV exists but has zero callers). Don't market encryption.
- **Auth = Clerk** (required, no guest mode). **Tauri desktop/iOS**, not a web app. These shape onboarding and store/distribution copy.

## App 2 — Roomie

> **Status: pre-MVP scaffold. The features below are the documented _plan_; almost none are built in code yet.** I mark each as PLANNED. Be careful not to market these as existing.

**1. App name:** Roomie.

**2. What it does (plain English — intended):** A shared-house operating system for roommates that tracks fairness in two currencies: **money** (who paid, who owes whom, in EUR — Splitwise-style) and **effort** (whose turn for shopping/cleaning/cooking, who actually did it) — without points, leaderboards, or shame. Wedge: one sentence → many places ("bought milk, €5" → adds milk to the shared pantry _and_ logs the split expense). _(Source: README + `docs/ROADMAP_ELI5.md`.)_

**3. Main user problem:** Roommates fight over money and chores. Existing tools each solve half: Splitwise splits money but doesn't run the house; shared grocery lists have no identity/money; all-in-one flat apps are shallow and gamify chores (shame). Gap: nobody does **groceries + money together, well, learning, and form-free**.

**4. Target users / ICP:** Shared flats of 2–5 adults; first user is the founder's own Rotterdam flat (mixed iOS/Android). Dogfood-first, then expand. Broader ICP: students and young-professional housemates who already use Splitwise but improvise on chores/groceries.

**5. Core features (ALL PLANNED — none built):** Money (expense split EUR, who-owes-whom, "mark settled", no in-app transfer); Kitchen (shared pantry, spoilage/replenish, Feed Me recipe vote, missing-ingredient → shopping list); Tasks (chore/shopping/cooking rota, "who did it", absence/favors later); an AI layer (sentence → draft action) and receipt OCR → **draft/confirm screen, never silent save**.

**6. Current MVP limitations (honest):** **There is no MVP.** `src/` is the default Vite template; no Money/Kitchen/Tasks code, no auth, no database, no household model. The Ollie reuse audit shows the hardest core — **expense splitting + who-owes-whom + settlements** — has **zero reusable code in Ollie** and must be built from scratch. Realistic state: ~1–2 days of scaffolding + planning done; product = 0%.

**7. Main user workflow (intended):** Create/join a household via invite code → add an expense or a pantry item (typed, or photo a receipt → confirm draft) → everyone sees shared balances + lists update live → "who did it" logs effort → reminders nudge whoever's turn it is.

**8. Activation moment (intended):** Two roommates in the same household both seeing a balance update live after one of them logs "groceries €24, split 3 ways" — the "we're finally on the same page" moment. _(Not yet buildable.)_

**9. Possible pricing model (intended):** Free for the core house (money + lists), à la Splitwise free; paid only if/when it adds heavier value (OCR volume, subscriptions/recurring bills, more than N members). Avoid Splitwise's mistake of paywalling basic splitting too aggressively. Per-household rather than per-seat fits the use case.

**10. Competitors / alternatives (from Roomie's own research):** Splitwise, Tricount (money only); OurGroceries (lists only, no money/identity); Flatastic, OurFlat (all-in-one but shallow; money behind Pro paywall; chores gamified).

**11. What makes it different (intended):** Money **and** kitchen handled together and learning (cadence/spoilage from Ollie), form-free capture ("one sentence → many places"), and chores **without** points/shame. Differentiation is real _on paper_ but unproven until built.

**12. Technical details affecting marketing/trust (intended):** Must be **multi-user, household-scoped** (shared mutable data — Ollie has never done this; net-new). Audit flags: shared data should be **plaintext + row-level security by household**, not per-user encryption (which blocks roommates reading shared data); pick one auth provider up front; AI/OCR must be **draft-then-confirm**. Until these exist, no privacy claims can be made.

## Comparison (Q13–20)

**13. How are the two apps related?** Roomie is the **multi-user descendant of Ollie**. Same founder, same philosophy (calm, anti-shame, form-free, "one sentence → many places"). Roomie _vendors_ Ollie's pure logic — pantry/cadence/spoilage, Feed Me recipes, the AI routing pipeline, infra (notifications, PII-scrub, fetch client) — and rebuilds persistence for households. They share DNA and code, not a codebase (separate repos, per decision).

**14. Marketed as…** **Separate products** — clearly. Different audiences (solo ADHD individual vs. a shared flat), different value (personal calm vs. group fairness), different platforms (Ollie = desktop/iOS app; Roomie = intended PWA). They are **not** a suite to a buyer, and Roomie is not a "companion" to Ollie. Internally they're "hero engine (Ollie) → spun-out vertical (Roomie)", but that's an engineering story, not a marketing one. Don't co-brand at launch.

**15. Which launches first & why?** **Ollie — but only after a focused launch-readiness sprint** (worker redeploy, onboarding, sign-up, analytics). It's the only one with a real product. Roomie cannot launch; it has no features. Sequencing: ship Ollie to its closed alpha, harden the reusable engine, _then_ build Roomie on a proven core. Launching Roomie first would mean building the entire thing from a scaffold — months out.

**16. Audience to target first:** For Ollie: a small, warm ADHD-adult cohort (e.g. ADHD creator communities, r/ADHD, the founder's network) as closed alpha — people forgiving of rough edges who feel the "lost thoughts / form fatigue" pain acutely. For Roomie (later): the founder's own flat, then student/young-professional house-shares already using Splitwise.

**17. Strongest launch angle:** Ollie — **"One box. No categories. It sorts your life for you — and never shames you for an off day."** The anti-form + anti-shame combo is the differentiated, honest hook. (Avoid leading with breadth or AI buzzwords; lead with the _feeling_ of being understood without effort.)

**18. Objections / concerns:**

- "Another tracker I'll abandon." → Counter with form-free + no-streak (low maintenance, no guilt on relapse).
- "Is my sensitive data (meds, mood, money, cycle) safe?" → Honest answer needed: local-first, but dump text hits a cloud AI; no at-rest encryption yet. Don't overstate.
- "Does the AI actually work / is it accurate?" → Today it 404s in prod; must be fixed before any demo.
- "Why not just Notion/Apple Notes?" → Routing + ambient noticing + reminders.
- For Roomie: "Why not Splitwise?" → money+kitchen+chores together, learning, no shame — but can't claim until built.

**19. Proof points to prepare (Ollie):** A screen recording of a real dump routing correctly (only once the worker is live); before/after of "blank box → sorted module"; the calm empty-state copy; a meds/bill reminder firing; a privacy one-pager (local-first + the honest cloud-AI caveat). **Do not** stage a fake demo while the worker 404s. For Roomie: nothing to show yet — prepare a clickable prototype/mockup labeled "concept," not a product demo.

**20. Top 10 honest marketing claims (Ollie, today):**

1. "One input box — no categories to pick." _(true; routing exists in code)_
2. "No streaks, no leaderboards, no shame." _(true; deliberate design)_
3. "Your thoughts are saved the instant you type — even offline." _(true: `pending_dump` persisted before network)_
4. "Local-first: your module data lives on your device." _(true for module data)_
5. "Built for the ADHD brain, not against it." _(true to design intent)_
6. "Tracks money, groceries, meds, mood, sleep and more in one calm place." _(true: 14 modules)_
7. "Knows when your milk's about to run out and when a bill's due." _(true: cadence + recurring detection in code)_
8. "Suggests what to cook from what you have (Feed Me)." _(true: recipe logic exists)_
9. "Quiet by default — it only speaks up when something matters." _(true: silent noticings)_
10. "Runs as a real desktop and iPhone app." _(true: Tauri + iOS build)_

❌ **Cannot honestly claim:** "encrypted", "nothing leaves your device", "works in your browser", "AI works flawlessly" (worker down), or any usage/retention stat (no analytics).

---

# PART B — Launch-Readiness Audit

## Ollie (Q1–10)

1. **Onboarding clear?** No — there is **none**. New users land on a blank dump box with zero guidance after sign-in. This is the single biggest conversion risk.
2. **Shortest path to value:** Sign in → type one sentence → see it routed. ~2 steps _if_ the worker is live. Today it's blocked by the 404.
3. **Where users get confused:** No explanation of what to type or what the app is; sign-up link appears unwired; in a browser, data silently doesn't persist (looks broken); "noticings" render nothing when empty (can read as "is it working?").
4. **Highlight on landing page:** The one-box routing, the no-shame stance, local-first, the breadth-in-calm. Show the dump→sort moment.
5. **Don't over-promise:** encryption (dead code), "browser/web app" (Tauri only), flawless AI, OCR structured extraction (returns prose), partner routing (not in dispatch registry), analytics-driven personalization (no analytics).
6. **Privacy/security to explain:** Local-first storage; **but** dump text is sent to Cloudflare → AI providers for routing; no at-rest encryption yet; Clerk handles auth (publishable/anon keys only in client — no secrets exposed, good). Be explicit about the cloud-AI hop.
7. **Integrations/APIs/deps to mention:** Clerk (auth), Supabase (auth session + reminder scheduling only), Cloudflare Workers (AI proxy, APNs push, Sentry tunnel), AI providers server-side (Groq/Gemini/OpenRouter/Anthropic). Native local notifications.
8. **Bugs / missing states hurting conversion:** **Stale AI worker → /route/dump 404 (core feature down)**; no onboarding; sign-up route unwired; browser build loses data; `App.tsx` dead POC leftover; `BoxPlaceholder` "not yet built" for unknown routes; partner not dump-routable.
9. **Analytics to track (none fire today — must add):** `signup_completed`, `first_dump_submitted`, `dump_routed_success/fail` (+ latency `dump_roundtrip` already console-logged), `module_opened`, `reminder_fired`, `reminder_tapped`, `D1/D7_return`, `dump→module activation`. Wire the existing `ingestEvent` (defined, zero callers).
10. **Improve before public launch:** (a) redeploy AI worker + add a graceful "AI unavailable" path; (b) add a 3-screen onboarding + 1 seeded example dump; (c) fix sign-up; (d) wire analytics; (e) remove/replace the encryption claim or actually encrypt; (f) decide platform story (desktop/iOS app, not "web").

## Roomie (Q1–10)

Short, because **nothing is built**: 1. No onboarding (no app). 2. No path to value (no features). 3. N/A. 4. Nothing yet — landing page would be a waitlist/concept. 5. Don't promise _anything_ as existing. 6. No data handled yet; privacy posture decided only on paper (plaintext + household RLS planned). 7. None integrated yet (deps are just react/react-dom). 8. The whole product is "unfinished." 9. None. 10. **Build a first vertical slice** (one household, one expense split, live shared balance) before any launch talk.

## Critical fixes before launch

**Ollie:**

1. **Redeploy `ollie-api` worker so `/route/dump` works** — core feature is dead in prod (404). Add a visible failure state + (optional) local keyword fallback so a down worker degrades, not breaks.
2. **Add onboarding** — minimum: a one-card "type anything, I'll sort it" + one pre-filled example.
3. **Fix in-app sign-up** (mount `<SignUp>` or route to Clerk hosted flow).
4. **Wire analytics** (call the existing `ingestEvent`) — you cannot measure a launch blind.
5. **Resolve the encryption claim** — either ship the encrypted-KV layer (it exists) or remove all encryption messaging.
6. **Pick & state the platform** — it's a desktop/iOS app; stop implying PWA.

**Roomie:**

1. **Build a working slice** (household + one split expense + shared view). There is no launch conversation before this.

## Nice-to-have improvements

- Ollie: structured OCR (receipt → fields), partner in dump dispatch, merge `feat/brain` to main, seed/demo data toggle, a real privacy one-pager, Sentry init wired.
- Roomie: vendor the pure Ollie logic (cadence/spoilage/Feed Me) early to de-risk the Kitchen module; design the split/settlement algorithm (the net-new core) before UI.

## Marketing-safe product descriptions

**Ollie (safe to publish):** "Ollie is a calm, private life assistant for the ADHD brain. Type whatever's in your head into one box — a spend, a low mood, milk that ran out, a meds refill — and Ollie sorts it into the right place for you. No categories to pick, no streaks, no shame. It quietly reminds you when a bill's due or the milk's about to run out, and your data lives on your device. Available as a desktop and iPhone app." _(Note: omit encryption/web/AI-perfection claims; if asked, disclose that dump text is sent to a cloud service to classify it.)_

**Roomie (safe today — concept framing only):** "Roomie is an in-development shared-house app that tracks fairness in money and effort — who paid, who owes whom, and whose turn it is — without points or shame. Currently being built and dogfooded in one real flat." _(Do not describe Money/Kitchen/Tasks as available.)_

## Recommended landing page sections

**Ollie:** 1) Hero — "One box. It sorts your life." + dump→module visual. 2) The anti-form / anti-shame promise (no streaks). 3) "What it handles" — the module breadth, calmly. 4) "Quiet by default" — ambient noticings + reminders. 5) Privacy — local-first + honest cloud-AI note. 6) Platforms (desktop/iPhone) + alpha waitlist/CTA. 7) Who it's for (ADHD-first, everyone-friendly).

**Roomie:** A single waitlist page: problem (money + chore friction), one-line promise, "in development, dogfooding now," email capture. Nothing claiming a live product.

---

# PART C — 60-Second Demo Scripts

## Ollie — 60-second demo _(runnable only after the AI worker is redeployed; do not record while it 404s)_

- **Opening problem (0–8s):** "If you've got ADHD, every tracker asks you to stop, pick a category, fill a form — right when your brain can't. So thoughts get lost and apps get abandoned."
- **Who it's for (8–13s):** "Ollie is for the ADHD brain that just wants to get the thought _out_ and trust it lands somewhere."
- **Demo flow (13–48s):**
  1. "This is the whole interface — one box." _(show dump screen)_
  2. Type **"spent 40 at sephora and milk's out"** and submit.
  3. "I didn't pick a category. Watch — it split that into two things." _(open Finance → the $40 expense is logged; open Grocery → milk flagged to re-buy)_
  4. "And it's quiet — it only speaks up when something matters, like a bill due or milk about to run out." _(show a noticing / reminder)_
- **Aha moment (48–54s):** "It just _knew_ — money went to money, groceries to groceries — from one plain sentence."
- **Close / CTA (54–60s):** "No streaks, no shame, your data on your device. Ollie's in private alpha — join the waitlist."

_Honesty guardrails:_ only show modules that persisted the data on a Tauri build (not browser); don't show "encryption"; don't claim web. If the worker is down, this demo is not truthful — fix first.

## Roomie — 60-second demo

**Honest status: there is nothing to demo. Roomie is a scaffold (default Vite template); Money/Kitchen/Tasks don't exist in code.** A truthful 60-second _product_ demo cannot be recorded today.

What you _can_ honestly do now: a **concept walkthrough** clearly labeled "early concept, in development" (narrate mockups, not a working app), or wait until the first vertical slice ships. The script below is the **target** demo to record **once that slice exists** — do not present it as current:

- **Opening problem (0–8s):** "Roommates fight about two things: money and chores. Splitwise does the money. Nothing runs the house."
- **Who it's for (8–13s):** "Roomie is for a shared flat that wants both — fairly, without keeping score."
- **Demo flow (13–48s) [TARGET, not yet built]:** Roommate A types "groceries €24, split 3 ways" → B and C see their balance update live → A photos the receipt → it appears as a _draft_ to confirm, not auto-saved → milk lands on the shared pantry list.
- **Aha moment (48–54s) [TARGET]:** "One sentence updated the money _and_ the kitchen — and everyone saw it instantly."
- **Close / CTA (54–60s):** "Roomie — fairness in money and effort, no shame. Building it now; join the waitlist."

> Until the slice is built, the only launch asset Roomie can truthfully ship is a waitlist page.
