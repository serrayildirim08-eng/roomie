# Roomie — Final Audit Report

_Tarih: 2026-06-14 · Yöntem: 20 boyut × 3 bağımsız tur (60 bulucu) + boyut-içi uzlaştırma + çapraz sentez · 81 agent, ~4.9M token._

## Yöntem & güven puanı

Her boyut **3 kez bağımsız** denetlendi (turlar birbirini görmedi). Bir bulgunun **güven puanı = onu kaç turun bağımsız olarak yakaladığı**:

- 🟢 **3/3** = üç tur da buldu → neredeyse kesin gerçek
- 🟡 **2/3** = iki tur buldu → güçlü sinyal
- 🔘 **1/3** = tek tur buldu → gerçek olabilir ama tek-seferlik/incelik; doğrulanmalı

Ham tur çıktıları: [ROUND_1](./ROUND_1.md) · [ROUND_2](./ROUND_2.md) · [ROUND_3](./ROUND_3.md).

---

## Yönetici özeti

Roomie's pure business logic is mostly sound where it has been written and tested — computeNetCents, simplifyDebts, parseAmountToCents and the chore rotation helpers (effectiveTurn/nextTurn) have real unit tests and the remainder-penny accounting holds. But the codebase is wide open in two ways that matter for a real-money shared-house app. First and most dangerous: there are NO InstantDB permission rules for any entity except $users (confidence 3, all three rounds), so today household isolation is enforced only by client-side query filters — meaning any authenticated user can read and tamper with every household's expenses, settlements, chores, pantry, personal tasks and activity feed via a raw queryOnce/transact. This is the deferred T5 task, and it is genuinely critical: it is a complete cross-household data breach plus a money-tampering surface, not a theoretical edge case. Second: nearly every write path (settle, claim, chore-done, add, brain-confirm) lacks double-submit guards, try/catch, and atomicity — so concurrent taps duplicate real settlements/purchases, failures fail silently, and the brain apply pipeline can half-write. The money math has a real latent bug too: when a removed member fronted an expense, their credit silently vanishes and the books stop summing to zero (and a test actually codifies that loss as correct). The brain pipeline has a silent invalid-amount revert and loose bidirectional chore matching that can mark the wrong chore done. The worker's rate limiter is per-isolate and global rather than per-user-persistent, so it both fails to cap cost and enables a household-level DoS. Net: the app is a well-structured prototype with sound core arithmetic, but it is NOT safe to open beyond the single test flat until T5 permissions land and the write paths get guards/atomicity.

---

## Sayılar

| | Toplam | 🔴 critical | 🟠 high | 🟡 medium | ⚪ low |
|---|---|---|---|---|---|
| **Bulgu** | 95 | 4 | 31 | 38 | 22 |

**Güvene göre:** 🟢 3/3 = **28** · 🟡 2/3 = **33** · 🔘 1/3 = **34**

## En kritik 5 risk

1. No InstantDB permission rules (T5 deferred): every household's money/chores/pantry/tasks are world-readable and world-writable to any authenticated user — full cross-household breach + money tampering
2. Removed-member expenses silently lose money: computeNetCents drops the departed payer's credit so the ledger stops summing to zero — and a unit test codifies the loss as expected
3. Write paths lack double-submit guards, try/catch and atomicity: settle/claim/brain-confirm duplicate real records on double-tap and fail silently on error
4. Brain apply is non-idempotent and silently reverts invalid edited amounts: wrong euros and duplicate expenses/chore-events reach the shared ledger with no user signal
5. Worker rate limiter is per-isolate + global (not per-user/persistent): a single leaked token can DoS the whole household or bypass the cap for a runaway Groq bill

---

## Bulgular (severity → güven sırasıyla)

> Not: madde numarası (#rank) sadece çapraz-referans kimliğidir; gruplama severity'e göredir (bir-iki high, sentez sıralamasında alt sıralarda numaralanmış olabilir).

### 🔴 CRITICAL — 4 bulgu

#### #1 · 🟢 **3/3** · No InstantDB permission rules for any non-$users entity — all household data world-readable and world-writable to any authenticated user
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2, 3
- **Yer:** `instant.perms.ts:15-21`
- **Ne:** instant.perms.ts defines an allow rule ONLY for $users. Every other entity (expenses, settlements, pantryItems, purchases, chores, choreEvents, personalTasks, activityEvents, households, memberships, profiles) has NO rule, and in InstantDB an entity with no rule defaults to full view+write for any authenticated user. Today's household scoping lives only in client-side useQuery filters, which is a UX filter, not a security boundary. The per-entity findings (expenses, settlements, chores/choreEvents, pantry/purchases, activityEvents/profiles, personalTasks, households, memberships) are all the same root cause scoped per entity. The file's own header admits this is the tracked T5 task. Confidence 3 — all three blind rounds caught the umbrella plus most per-entity clusters.
- **Etki:** Any logged-in user — even one who never joined a household — can read AND modify every record in every household via raw db.queryOnce/db.transact ignoring the client filter: read all expenses/settlements (financial + privacy leak), inject/delete expenses to commit fraud and break debt math, reassign/complete chores for others, read everyone's personal tasks, forge or wipe the activity audit feed. For a real-money shared-house app this is a complete cross-household breach plus a money-tampering surface.
- **Fix:** Add household-scoped allow rules to instant.perms.ts for every entity using a reusable template: view/create/update/delete = "auth.id in data.ref('household.memberships.user.id')". Tighten per entity: immutable audit logs (settlements/choreEvents/purchases/activityEvents: update:false, delete:false), owner-only personal tasks (auth.id == data.ref('owner.id')), owner-only membership role/status changes, members-only household view. choreEvents traverse via 'chore.household'. Push with `npx instant-cli@latest push perms`. This is T5 in docs/CHECKLIST.md and must land before the app opens beyond the test flat.
- **Neden bu sıra:** The single highest-impact issue: critical severity, confidence 3 across all rounds, and the umbrella for every per-entity perms finding. It is the difference between a private app and a public free-for-all on real money.

#### #2 · 🔘 1/3 · Removed-member expenses silently lose money — computeNetCents drops the non-member payer's credit so the ledger stops summing to zero (and a test codifies the loss)
- **Boyut:** Money debt/settlement math (`money-correctness`) · **Turlar:** 2
- **Yer:** `src/features/money/money-logic.ts:25-34 (fed empty strings from money-screen.tsx:95,100-101)`
- **Ne:** Cross-dimension merge of money-correctness 'removed-user broken links' and testing-gaps 'computeNetCents loses money when a non-member fronts an expense' — same root. Line 25 only credits the payer when (paidById in net), but lines 26-28 still debit member participants. When a removed member is the payer (or money-screen coerces a nulled link to '' via ?? ''), the payer's full credit is silently dropped while participants are still debited, so net no longer sums to 0. Settlement legs (+fromId, -toId) are likewise skipped if either party is a non-member. Example: €300 paid by A split 3 ways should be +200/-100/-100; after A is removed it becomes -100/-100 (sum -€200, €300 lost). The (id in net) guards make corruption silent rather than throwing. The money-logic.test.ts:66 test 'ignores ids that are not members' asserts a non-zero net as correct, actively protecting the defect.
- **Etki:** Permanent, silent corruption of the household ledger — the one place a wrong number is real euros. The exact scenario shared houses hit (someone moves out after fronting groceries): surviving members quietly overpay or the books don't reconcile, with no error or warning. The test suite guarantees the bug ships green and would flag a correct fix as a regression.
- **Fix:** Before passing to computeNetCents, drop/repair rows referencing non-members instead of coercing nulls to '': filter expenses to current-member payers and settlements where both legs are members; OR make computeNetCents defensive — throw/flag when paidById∉net or a settlement leg∉net so 'net sums to 0' can never break silently; OR redistribute a departed payer's credit across remaining participants. Rewrite the test to assert balances sum to zero for the removed-user case.
- **Neden bu sıra:** Critical money correctness — silent permanent ledger corruption in normal use (member moves out) — and uniquely dangerous because an existing test pins the broken behavior. Confidence 1 only because two rounds didn't probe the non-member-payer path, but the code is confirmed.

#### #3 · 🔘 1/3 · Client-side query filtering used as the security boundary instead of server-side rules
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 3
- **Yer:** `src/features/money/money-screen.tsx:39-48 (same pattern in kitchen-screen.tsx, tasks-screen.tsx, activity-feed.tsx)`
- **Ne:** Screens scope data purely via client-side useQuery where-clauses (filter memberships by current userId, then walk to household.expenses/settlements). This only restricts data because the shipped client chooses to; it is not enforced by InstantDB. It is the architectural flip side of the missing-perms umbrella (rank 1): even correct UI filtering provides zero protection against a modified client, a direct queryOnce, or any non-UI use of the InstantDB client.
- **Etki:** An attacker or any script using the same InstantDB client can ignore the userId filter and query/mutate household data directly by ID, so the entire household-isolation guarantee rests on trusting the client — never safe for an app handling real money.
- **Fix:** Treat instant.perms.ts as the only real enforcement; once per-entity rules (rank 1) are added, keep client where-clauses purely as UX/perf. Add a regression test that issues an unscoped queryOnce as a non-member and asserts it returns nothing.
- **Neden bu sıra:** Critical and the same trust failure as rank 1 stated architecturally; kept distinct because it names the pattern across all screens. Confidence 1 (one round) but directly confirmed and load-bearing.

#### #4 · 🟡 2/3 · expenses / settlements entities have no permission rules — cross-household financial read + tamper, breaks debt math
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2
- **Yer:** `instant.schema.ts:47-59 (expenses, settlements) / instant.perms.ts:15-21 (missing rule)`
- **Ne:** Merged per-entity critical: expenses (household, paidBy, participants) and settlements (household, fromUser, toUser) have no rules; money-screen.tsx writes both with only a client-side household scope. money-logic.computeNetCents derives every member's net debt from the expenses/settlements it can read, so the integrity of the entire money module depends on these being scoped.
- **Etki:** Any authenticated user can read all expenses/settlements of all households (amounts, who paid, who owes, payment timing) and inject fake expenses (e.g. a €1000 expense paid by a victim), forge settlements ('Bob paid Alice €500'), or delete/modify real records in any household — directly corrupting debt/settlement calculations and constituting financial fraud.
- **Fix:** expenses: view/create = "auth.id in data.ref('household.memberships.user.id')", update:false (audit trail), delete restricted to creator with recency guard or disallowed. settlements: same view/create, update:false, delete:false; allow correction only via a short recency window on fromUser.
- **Neden bu sıra:** Critical, confidence 2, and the money-specific sharp edge of the perms gap — the entities where unauthorized writes literally move euros. Ranked just under the umbrella because it is the most financially consequential slice.

### 🟠 HIGH — 31 bulgu

#### #5 · 🟢 **3/3** · Non-null assertion on EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY without runtime validation
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 1, 2, 3
- **Yer:** `src/app/_layout.tsx:20`
- **Ne:** `const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;` uses a non-null assertion that lies to the type system; the env var may be undefined in dev/CI/misconfigured builds and flows into ClerkProvider with no guard.
- **Etki:** If unset, ClerkProvider receives undefined as publishableKey and auth — the gate for the entire app — breaks at runtime with a cryptic error instead of failing loudly at startup.
- **Fix:** Read without the assertion and throw at module load: `const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY; if (!publishableKey) throw new Error('Missing required env var: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY...');`
- **Neden bu sıra:** High + confidence 3 (all rounds). Affects app-wide auth init; cheap, unambiguous fix. Top of the high tier alongside the other c3 highs.

#### #6 · 🟢 **3/3** · Rate limiter is per-isolate and global, not per-user — one leaked token bypasses or exhausts the household's daily cap
- **Boyut:** Worker auth & abuse (`worker-security`) · **Turlar:** 1, 2, 3
- **Yer:** `workers/brain/src/index.ts:23-35,110`
- **Ne:** The cost-guard stores DAILY_CAP in module-level variables (capDay/capCount) inside overCap(). Three compounding defects all rounds caught: (1) the 200-call cap is GLOBAL to the isolate, not per Clerk userId, so one housemate or leaked token burns the whole household's budget; (2) state lives only in per-isolate memory, so under load N isolates each get a fresh counter (effective limit 200*N — runaway bills), as the code comment admits; (3) the counter resets on redeploy/idle eviction, so an attacker resets the cap by triggering idle timeouts. The verified userId is available at line 107 but unused for limiting.
- **Etki:** A leaked/shared JWT can exhaust the household's 200-call/day quota (denying Brain to all roommates) or bypass the cap by distributing across isolates/edge locations — leading to a runaway Groq bill. Both a household DoS and an uncapped-cost risk.
- **Fix:** Move limiting off per-isolate memory to a persistent globally-shared store keyed per userId (Cloudflare KV or Durable Objects). After verifyClerkJwt: `const n = await env.KV.get('rate-'+userId)`, gate on a per-user daily cap, `await env.KV.put('rate-'+userId, n+1, { expirationTtl: 86400 })`. Add a household-aggregate cap and a short burst limit (5/min/user). Wire the KV namespace in wrangler.toml.
- **Neden bu sıra:** High + confidence 3. Real cost/DoS exposure on the only LLM-spending surface. Among the strongest high-tier signals.

#### #7 · 🟢 **3/3** · personalTasks have no permission rules — private to-do lists readable by anyone
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2, 3
- **Yer:** `instant.schema.ts:98-102 + links 192-199 / instant.perms.ts:15-21`
- **Ne:** personalTasks (owner→$users, household) has no rule. tasks-screen.tsx already filters client-side to the owner, signalling owner-only intent, but with no server rule any authenticated user can read every user's personal tasks across all households. Rounds disagree on view scope (owner-only vs household-readable per the schema comment) but agree writes must be owner-only.
- **Etki:** Personal to-dos may hold sensitive content (health, medication, finances, relationships); world-readability is a real privacy leak regardless of the final view scope.
- **Fix:** At minimum create/update/delete = "auth.id == data.ref('owner.id')". For view, default to owner-only ("auth.id == data.ref('owner.id')") until the planned 'need a favor' feature ships, then widen to household-readable.
- **Neden bu sıra:** High + confidence 3 within the perms cluster; privacy-sensitive and unanimously flagged. Ranked above the c2 perms entities.

#### #8 · 🟢 **3/3** · Index-as-key in draft-fragment list coupled with index-keyed amountDraft — edited amount applied to wrong/deleted expense
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/brain/brain-input.tsx:121`
- **Ne:** The draft-fragment list renders key={idx} while per-fragment amount edits live in amountDraft keyed by the SAME index; fragments are user-deletable mid-list (filter by index). DraftFragment has no id, so nothing stable exists. Deleting a fragment renumbers indices: a TextInput's uncontrolled defaultValue keeps the old display while amountDraft[idx] now points at a different fragment.
- **Etki:** User edits an amount, deletes an earlier fragment, then confirms — the edited amount is applied to the WRONG expense (or lost), creating incorrect expenses/debts in the shared ledger. Silent financial-data corruption, not just a console warning.
- **Fix:** Add a stable id to each DraftFragment at creation (id()/uid when the worker response is set into state). Key the list by f.id, key amountDraft by that id (Record<string,string>), and read it by id in onConfirm instead of by index.
- **Neden bu sıra:** High + confidence 3; the index-key anti-pattern here causes real money misattribution, not a cosmetic React warning. Belongs near the top of the high tier.

#### #9 · 🟢 **3/3** · Invalid edited expense amount silently reverts to original value with no feedback
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/brain/brain-input.tsx:75-78`
- **Ne:** In onConfirm, `const cents = parseAmountToCents(amountDraft[idx]); return cents ? {...f, amountCents: cents} : f;` — when the edit is invalid (e.g. 'abc', empty), parseAmountToCents returns null and the truthy ternary silently keeps the ORIGINAL fragment. The edit is discarded with no validation feedback; the original amount is written. The ternary is also truthy-brittle — a legitimate 0.00 would revert too.
- **Etki:** In a real-money app, an expense can be recorded with an amount the user didn't intend while believing their correction applied; wrong amounts feed directly into cost-splitting/debt math with no signal the edit failed.
- **Fix:** Distinguish 'no edit' (undefined) from 'invalid edit' (null). If any expense has amountDraft[idx] defined but parseAmountToCents returns null, disable Confirm and show an inline error, or report it under result.skipped. Use an explicit `cents !== null` check.
- **Neden bu sıra:** High + confidence 3; silent wrong-amount writes are exactly the failure a money app must not have. The display-inconsistency finding (rank 41) masks it further.

#### #10 · 🟢 **3/3** · Bare async db.transact handlers wired to onPress/onSubmitEditing with no error handling (Kitchen/Tasks/Money)
- **Boyut:** Error & edge handling (`error-handling`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:134,145,158,181,294,298,327; tasks-screen.tsx:130,151,164,168,172,235,242,294,304,309,330,355; money-screen.tsx:183,287`
- **Ne:** Cross-dimension merge of error-handling 'bare async handlers' (c3) and async-races 'no error handling / premature input-clear' (c2). Many async functions calling `await db.transact(...)` (plus logActivity) are invoked straight from onPress/onSubmitEditing with no await, try/catch or .catch(). Several (onAdd, onAddMine, onAddHouse) clear the input via setDraft('') BEFORE awaiting, so on failure the typed text is lost with no record saved. onSettle writes real debt settlements; onBridgeConfirm/onGotIt log after a separate transact so a failed log desyncs activity.
- **Etki:** Any failed DB write across Money/Kitchen/Tasks fails silently with no user feedback and a stale/inconsistent UI: a settlement may not record (ledger wrong), an item may stay 'in' when marked 'out', a chore turn may not advance (rotation breaks), or a typed task is cleared but never saved.
- **Fix:** Wrap each call in `void (async () => { try { await fn(...); } catch { Alert.alert('Error','Could not save. Try again.'); } })()` or a per-function try/catch with error/busy state (as money-screen onAdd already does). Move setDraft('') to AFTER the await succeeds; order logActivity after the primary transact and only on success.
- **Neden bu sıra:** High + confidence 3 and pervasive across the three core screens; the central error-handling gap. money-screen onAdd already shows the correct pattern, so the fix is well-understood.

#### #11 · 🟢 **3/3** · No double-submit guard or error handling on Settle — duplicate / silent debt settlements
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:183-197`
- **Ne:** onSettle creates and links a settlement with no busy/disabled flag and no try/catch (unlike onAdd in the same file). The Settle Pressable calls it directly with no pending state. Rapid taps before the first transact resolves create multiple settlement rows for the same debt; a failed transact throws uncaught with no feedback.
- **Etki:** Real money between housemates. Double-tapping records the same repayment 2-3x, overstating how much was paid and corrupting the ledger (a €100 debt could read as €300 settled). A failed settlement shows no error, so the user believes a debt was settled when it wasn't.
- **Fix:** Mirror onAdd: track a per-debt pending key (fromId+toId+amountCents), set at start and clear in finally, disable the Settle button while pending, and wrap transact + logActivity in try/catch that surfaces an error.
- **Neden bu sıra:** High + confidence 3; settle is the most financially consequential button in the app and is currently the least guarded. Distinct from the general bare-handler cluster by its money impact.

#### #12 · 🟢 **3/3** · No double-submit guard or error handling on Kitchen 'I'll get it' (onClaim) — concurrent claims overwrite
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:145-156`
- **Ne:** onClaim does a non-idempotent last-writer-wins `.link({ claimedBy: userId })` with no pending/disabled guard and no try/catch. Two roommates who both see claimedBy=null can tap simultaneously; both transacts run, the DB keeps the last writer, but each client optimistically shows 'you are getting it'. A failed transact throws uncaught.
- **Etki:** Two users both believe they own the same shopping item — they double-buy or both assume the other has it and nobody buys it, defeating the whole 'kills double-buying' purpose of claims. Errors are invisible.
- **Fix:** Track claiming item ids in pending state and disable the claim button while in flight; prefer a conditional/atomic write that only sets claimedBy when currently null so a concurrent loser is rejected. Wrap transact in try/catch with feedback.
- **Neden bu sıra:** High + confidence 3; directly undermines the core claim feature and is a genuine concurrency race in a multi-user app.

#### #13 · 🟢 **3/3** · Brain chore matching uses order-dependent bidirectional substring matching — wrong chore marked done
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/brain/apply.ts:120-123`
- **Ne:** Cross-dimension merge of testing-gaps 'loose bidirectional substring' (high, c3) and brain-correctness 'order-dependent bidirectional substring' (medium, c1) — same root, keep higher. chore_done resolves the target with `name.includes(needle) || needle.includes(name)`, matching in BOTH directions, and find() returns the first array hit. A short/common token (e.g. 'bath', 'dishes', 'the') can match multiple chores, so 'I did the laundry' can mark the wrong chore done and advance that chore's turn.
- **Etki:** The wrong chore is marked done and its turn pointer rotates, silently breaking chore-rotation fairness and misattributing whose turn is next. Residents lose trust that their note was understood.
- **Fix:** Replace bidirectional substring with one-way matching (chore name must contain the spoken phrase), require meaningful length (>2 chars), rank exact > prefix > substring and pick the best, or use fuzzy matching with a threshold. Add tests against STARTER_CHORES/CHORE_LIBRARY covering exact, partial, ambiguous, no-match.
- **Neden bu sıra:** High + confidence 3 after merge; a fairness-corrupting brain bug. Ranked above the c2/c1 highs.

#### #14 · 🟢 **3/3** · Zero test coverage for kitchen normalize.ts (normalizeItemName, resolveItem, levenshtein, foldDiacritics, stripPlural)
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/kitchen/normalize.ts`
- **Ne:** No test exists for normalize.ts. normalizeItemName/resolveItem implement multi-stage alias matching (exact, singular, prefix, edit-distance) plus diacritic folding and plural stripping, all production code used by kitchen-screen. Untested: empty/whitespace, Turkish/Unicode (ş, ç, ü, ö, ı; 'süt' vs 'milk'), multi-word items, plural stripping, Levenshtein cap, alias lookup, unknown fallback. The stripPlural mangling bug (rank 35) lives here.
- **Etki:** Item normalization is unverified, so dedup, shopping-list aggregation and shelf-life assignment can silently break: 'eggs'/'egg' may land on different rows, non-English/typo input may not resolve, unknown items get the wrong shelf life — degrading shared-pantry management.
- **Fix:** Add normalize.test.ts covering normalizeItemName (empty/whitespace, diacritics, plurals, exact/singular/prefix aliases, multi-word, edit-distance hits, unknown fallback), resolveItem, and levenshtein edge cases.
- **Neden bu sıra:** High + confidence 3; an entire matching subsystem with zero verification and a known mangling bug. High because kitchen dedup is a core promise.

#### #15 · 🟢 **3/3** · Zero test coverage for kitchen aging.ts ageOf() state machine
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/kitchen/aging.ts:41-54`
- **Ne:** No test for aging.ts despite its doc comment promising deterministic boundary testing. ageOf is a pure four-state machine with boundaries at 1.0x/1.5x/2.0x shelfLifeDays. Null/non-finite/≤0 guards exist but boundaries and clock-skew are untested; negative elapsed (clock back) silently returns 'fresh', undocumented.
- **Etki:** Pantry items may fail to fade, prompt, or auto-archive at the right time — users aren't reminded about stale groceries (food waste); clock-skew silently resets aging with no test pinning the behavior.
- **Fix:** Add aging.test.ts exercising exact boundaries (1.0x/1.5x/2.0x), the null/non-finite/≤0 guards, and negative-elapsed clock-skew. Optionally add explicit `if (elapsedDays < 0) return 'fresh'` with a comment.
- **Neden bu sıra:** High + confidence 3; a pure, easily-testable state machine left fully unverified, directly tied to the kitchen aging feature.

#### #16 · 🟢 **3/3** · Zero test coverage for brain apply.ts applyFragments() DB writer
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/brain/apply.ts`
- **Ne:** No test for apply.ts. applyFragments (~150 lines) is the confirm-time writer turning approved fragments into real DB records across five targets (expense, pantry_add/out/shopping_add, chore_done, personal_task) with complex branching: resolveItem lookup, pantry merge-by-normalizedName, the chore substring matching above, turn advancement, activity logging. None of the success paths, merge behavior, chore matching, turn advancement, empty-orderedMembers edge, or error handling are tested.
- **Etki:** The function writes real money (expenses), pantry items, chores, settlements, personal tasks with no automated verification. Bugs in merging (duplicate pantry rows), chore matching, or turn advancement reach production silently and corrupt shared state.
- **Fix:** Add apply.test.ts with mocked InstantDB and logActivity. Test each target (expense amount+participants, pantry new-vs-merge, pantry_out, shopping_add, chore_done match+advancement, personal_task) and the empty-orderedMembers edge, asserting the exact db calls.
- **Neden bu sıra:** High + confidence 3; the most consequential untested writer in the app, sitting on top of multiple confirmed apply-path bugs.

#### #17 · 🟢 **3/3** · Zero test coverage for worker schema.ts parseDraft() validation boundary
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1, 2, 3
- **Yer:** `workers/brain/src/schema.ts:67-90`
- **Ne:** No test for schema.ts (it lives in workers/brain, outside the app's vitest run). parseDraft is the input-validation boundary for all LLM output: parses JSON, slices to the first 8 fragments, drops fragments failing fragmentSchema while counting, and auto-generates a clarifying question when an amountless expense is dropped. Untested: malformed/non-JSON throw, dropped invalid fragments, mixed valid/invalid, the >8 cap, and the auto-question logic.
- **Etki:** The boundary protecting the app from malformed AI output is unverified. Model JSON could be silently partially lost, or the salvage/auto-question logic could fail, losing the user's money intent unnoticed.
- **Fix:** Add workers/brain/src/schema.test.ts (vitest) covering valid draft, malformed JSON (throws), fragments missing required fields (dropped+counted), mixed valid/invalid, the 8-fragment cap, amountless-expense auto-question generation, and preservation of an existing question.
- **Neden bu sıra:** High + confidence 3; the LLM-output validation boundary with zero tests. Lower than apply.ts only because worker code is one step removed from direct DB writes.

#### #18 · 🟢 **3/3** · Interactive Pressables (settle, pass, done, claim, chips, auth, brain) lack accessibilityLabel/Role
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:223-290; tasks-screen.tsx:233-245; kitchen-screen.tsx:294-327; auth-screen.tsx:212-226; brain-input.tsx:109-148; household.tsx`
- **Ne:** Only delete/remove buttons carry an accessibilityLabel. Every other Pressable — add-expense '+', settle, payer/participant chips, tasks pass/done, kitchen claim/got-it/out, auth sign-in/sign-up/verify, brain send/cancel/confirm, household copy-code/leave — has neither accessibilityLabel nor accessibilityRole. No accessibilityRole='button'/'radio'/'switch' exists anywhere in src.
- **Etki:** Screen-reader users cannot identify or safely activate the app's core actions — settling debts, claiming groceries, completing chores, signing in. Violates WCAG 2.1 A 4.1.2 and 1.3.1; effectively unusable via VoiceOver/TalkBack.
- **Fix:** Add accessibilityRole='button' (or 'radio'/'checkbox' with accessibilityState={{selected}} for chips, 'switch' for toggles) plus a context-rich accessibilityLabel to every interactive Pressable (e.g. settle → `Settle debt ${amount}`, claim → `I'll get ${it.name}`).
- **Neden bu sıra:** High + confidence 3; the app is unusable for blind users, a Level-A failure across every core flow. Highest a11y priority.

#### #19 · 🟡 2/3 · Caught exception cast to GroqHttpError/Error without type narrowing in draft fallback
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 2, 3
- **Yer:** `workers/brain/src/index.ts:70`
- **Ne:** In the catch block, `e` (unknown) is cast twice — `(e as GroqHttpError).status` and `(e as Error).message?.slice(...)` — with no instanceof/in check. groqChat() throws GroqHttpError, but the same try runs parseDraft, which can throw plain JSON/parse errors with neither a typed `.status` nor a guaranteed `.message`.
- **Etki:** For a non-HTTP error, `.status` resolves to undefined, so the intent to detect recoverable 429s is silently lost and the wrong telemetry is logged. Optional chaining prevents a crash but the cast masks the real type.
- **Fix:** Narrow before access: `const err = e instanceof Error ? e : new Error(String(e)); const status = (err as GroqHttpError).status;` and read `err.message?.slice(0,200)` from the narrowed value.
- **Neden bu sıra:** High + confidence 2; affects the brain worker's 429/fallback decision logic, so the misread can change retry/tier behavior — more than a cosmetic cast.

#### #20 · 🟡 2/3 · Settlement activity log attributes the wrong actor — always logs the debtor (fromId) regardless of who clicked Settle
- **Boyut:** Money debt/settlement math (`money-correctness`) · **Turlar:** 1, 3
- **Yer:** `src/features/money/money-screen.tsx:190-196 (button at :287)`
- **Ne:** onSettle hardcodes actorId: fromId / actorName: nameById[fromId] when writing the debt_settled log, but the Settle button is rendered for every debt the user is part of — both owed-by-them and owed-to-them (the youPay branch). onSettle never receives who pressed it. So when a creditor (toId) clicks Settle on money owed to them, the log records the debtor (fromId) as the actor.
- **Etki:** (1) Audit-trail corruption: Alice settling a debt Bob owes her produces a log saying Bob settled it. (2) Misattribution that reads as fraud: a creditor can manufacture a settlement record falsely showing the debtor paid. The 'who actually did this' trail — the whole point of a shared-money audit log — is wrong.
- **Fix:** Add an actorId parameter: `onSettle(fromId, toId, amountCents, actorId)`, use actorId in logActivity, and pass userId from the button. Optionally restrict Settle to the debtor (youPay===true) if only debtors should record payments.
- **Neden bu sıra:** High + confidence 2; corrupts the money audit trail and enables a fraud-shaped misattribution. Lower than the duplicate-settlement race only because it doesn't change balances, just attribution.

#### #21 · 🟡 2/3 · Confirm button not disabled during apply + apply itself non-idempotent on retry — duplicate writes
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 1, 2
- **Yer:** `src/features/brain/brain-input.tsx:146 (button) + apply.ts:53-150 (loop)`
- **Ne:** The Confirm Pressable has no disabled prop (unlike the send button). onConfirm sets phase='applying' then awaits applyFragments; a rapid second tap re-enters and runs a second concurrent apply with the same fragments. Separately, applyFragments writes each fragment in its own transact with fresh id() and no idempotency key; a mid-loop failure leaves fragments in state, and editing the input to reset phase re-applies all of them. Pantry items dedupe by normalizedName, but expenses, purchases, choreEvents and personalTasks all duplicate.
- **Etki:** Duplicate expense records corrupt cost-splitting, duplicate choreEvents corrupt rotation, duplicate purchases corrupt replenishment cadence. A partial failure leaves inconsistent state that a retry compounds.
- **Fix:** Immediate: add `disabled={phase === 'applying'}` to the Confirm Pressable. Structural: wrap all fragment writes in a single db.transact for atomicity and/or derive an idempotency key (draft hash) so a repeated apply skips already-written fragments; on error clear fragments or move to a non-recoverable state.
- **Neden bu sıra:** High + confidence 2; duplicate real-money/chore records from a missing one-line guard plus a deeper non-idempotency. Closely related to the bare-handler and apply-atomicity clusters.

#### #22 · 🟡 2/3 · CORS wildcard origin combined with Authorization header allows any site to send authed cross-origin requests
- **Boyut:** Worker auth & abuse (`worker-security`) · **Turlar:** 1, 3
- **Yer:** `workers/brain/src/index.ts:37-41`
- **Ne:** The CORS block sets 'access-control-allow-origin': '*' together with 'access-control-allow-headers': 'authorization, content-type'. Pairing a wildcard origin with an allowed Authorization header means any malicious website can script a cross-origin POST to /draft carrying a victim's Bearer token and read the JSON response. Mitigated by still requiring a valid Bearer token, hence high not critical.
- **Etki:** Cross-site pages can issue authenticated requests using a victim's token and read the result, enabling token-leveraged abuse and quota burn from arbitrary origins instead of only the Roomie client.
- **Fix:** Replace the wildcard with an explicit allow-list and echo back only matched origins. Don't advertise 'authorization' under allow-headers for a wildcard origin. Prefer a custom auth header (forces preflight) or pinned-origin cookies.
- **Neden bu sıra:** High + confidence 2; widens the worker's attack surface to any origin. Ranks with the other worker-security highs.

#### #23 · 🔘 1/3 · Rate-limit counter increments BEFORE body validation — invalid requests still consume quota
- **Boyut:** Worker auth & abuse (`worker-security`) · **Turlar:** 2
- **Yer:** `workers/brain/src/index.ts:110`
- **Ne:** overCap() (which increments capCount) is called before the body is parsed/validated. Requests with missing text, invalid JSON, or text over 500 chars all return 400 yet have already consumed a cap slot. An authed attacker can exhaust the daily quota with cheap malformed requests that never reach classify().
- **Etki:** An authed attacker or buggy client can deplete the entire daily allowance with invalid requests, locking legitimate users out of Brain without any real LLM work — the cost cap becomes a self-inflicted DoS vector.
- **Fix:** Move the overCap() increment to AFTER body validation so a request only consumes quota once it has valid text bound for classify(). Combine with the per-user KV counter (rank 6).
- **Neden bu sıra:** High + confidence 1; compounds the rate-limiter design flaw. Lower within the high tier due to single-round confidence.

#### #24 · 🟡 2/3 · applyFragments writes are non-atomic; logActivity rejections abort whole fragment / leave partial writes
- **Boyut:** Error & edge handling (`error-handling`) · **Turlar:** 1, 3
- **Yer:** `src/features/brain/apply.ts:57,62,75,83,101,106,108,130,134,140,144`
- **Ne:** Cross-dimension merge of error-handling 'applyFragments non-atomic' (c2) and async-races 'sequential no partial-result' (c2). applyFragments runs a loop of independent awaited db.transact calls interleaved with awaited log() calls, none in try/catch. brain-input onConfirm wraps the whole call but a mid-loop rejection leaves the DB partially mutated while the user sees a generic 'Brain couldn't read that' error. A failed logActivity (audit-only) aborts a fragment even after the real data write committed; accumulated applied/skipped are discarded by the throw.
- **Etki:** Brain confirmation can half-apply: some records written, the rest skipped, with no indication which succeeded. A transient failure in a non-critical activity-log write discards a successful data write from the user's perspective; the activity feed desyncs from data.
- **Fix:** Wrap each transact in its own try/catch, collect failures into skipped[], let every fragment attempt independently, and return the partial ApplyResult. Make logActivity fire-and-forget so an audit-log failure never discards a committed data write; batch a fragment's related writes into one transact where possible.
- **Neden bu sıra:** High + confidence 2; partial-write corruption in the brain pipeline with misleading errors. Sits with the apply-idempotency and bare-handler findings as the brain write-safety cluster.

#### #25 · 🟡 2/3 · Chore rotation race + stale closure — anyone can advance from a render-time snapshot, skipping a turn
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/tasks/tasks-screen.tsx:172-194`
- **Ne:** Cross-dimension merge of tasks-correctness 'advance computes from stale holder' (high, c1), async-races 'rotation race + stale closure' (high, c2), and the state-management memberIds variant (low, c1). advance() computes `next = nextTurn(memberIds, holderId)` from render-time closures and writes `.link({ turn: next })` with no server-side read-then-write and no try/catch. The Done button is rendered for everyone, so two users can advance the same chore concurrently: both read the same holderId, compute the same next, and the rotation skips a person (Alice→Bob→Bob, skipping Charlie) plus records a duplicate choreEvent. Stale memberIds can also route a turn to a departed member. effectiveTurn() self-heals the missing-member case but not the concurrent-advance skip.
- **Etki:** Under concurrent taps the fairness-critical rotation advances incorrectly — skipping a roommate's turn or double-recording a completion — silently corrupting whose turn is next, the invariant the module exists to enforce. Silent transact failure also gives no feedback.
- **Fix:** Re-read the chore's current turn (and active memberIds) server-side inside advance before computing next; use optimistic-locking/conditional update with retry to serialize concurrent advances and make it idempotent for the same logical turn. Wrap transact+log in try/catch and disable Done/Pass while pending.
- **Neden bu sıra:** High + confidence 2 (merged, found in all rounds across dimensions); breaks the core fairness contract under concurrency. Among the strongest tasks findings.

#### #26 · 🟡 2/3 · No error handling / premature input-clear across kitchen, tasks, brain async writes (silent failures, lost input)
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 2, 3
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:93-212; tasks-screen.tsx:114-194`
- **Ne:** Most write handlers outside money-screen onAdd lack try/catch and several clear the input before the await: kitchen onAdd clears draft before the transact, onOut, onClaim, onGotIt, onBridgeConfirm; tasks onAddSuggestion, onAddHouse/onAddMine (clear before write), onMineDone/Delete, advance. On a network/permission error the transact throws uncaught (can crash/hang the component) and, where input was cleared, the user's text is lost with no error shown.
- **Etki:** Adds, claims, out, got-it, bridge expense, chore add/done/pass, and personal-task done/delete fail silently. Users believe a chore/item/task was saved when it wasn't (forgotten groceries, dropped chores), retype lost input, or re-send creating duplicates.
- **Fix:** Wrap each transact(+log) in try/catch; only clear the input inside the try after success; surface an error and busy/disabled state, matching money-screen onAdd. onMineDelete should tolerate an already-deleted row.
- **Neden bu sıra:** High + confidence 2; overlaps the rank-10 bare-handler cluster but adds the lost-input dimension. Kept distinct because it specifically flags the clear-before-await data-loss pattern.

#### #27 · 🟡 2/3 · Unhandled rejection in Alert-confirmed delete/leave callbacks (void async IIFE has no catch)
- **Boyut:** Error & edge handling (`error-handling`) · **Turlar:** 1, 3
- **Yer:** `src/features/money/money-screen.tsx:168-177 (also kitchen-screen.tsx:221-230, tasks-screen.tsx:203-212, household.tsx:246-254)`
- **Ne:** Destructive Alert confirmation callbacks fire `void (async () => { await db.transact(...delete/update...); await logActivity(...); })()` with no try/catch or .catch(). onLeave additionally logs against `code` as householdId rather than the household id (a latent bug in the same block). The two awaits are sequential and non-atomic: the delete can commit while logActivity fails, desyncing the feed.
- **Etki:** If the delete/leave transact or the following log rejects (network, permission, DB error), the rejection is silently swallowed. The user sees no error and believes the item was removed or they left the household, while the DB may be unchanged or half-written.
- **Fix:** Wrap each IIFE body in try/catch and surface an error. Order writes so the log only fires after the primary mutation succeeds, and consider batching delete+log into one transact for atomicity. Fix onLeave to log against the real household id.
- **Neden bu sıra:** High + confidence 2; destructive actions failing silently is high-impact, and the onLeave householdId bug rides along. Distinct from rank 10 by being the Alert-confirmed destructive path.

#### #28 · 🟡 2/3 · TextInputs rely on placeholder only; no accessibilityLabel for screen readers
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2
- **Yer:** `src/features/auth/auth-screen.tsx:119-172; money-screen.tsx:206-220; kitchen-screen.tsx:242-268; tasks-screen.tsx:285-332`
- **Ne:** TextInputs use only placeholder text as their label, with no accessibilityLabel. Auth code/username/email/password, money 'What for?'/'Amount (€)', kitchen and tasks add-item inputs all lack a programmatic label. Screen readers may not reliably announce a placeholder, and once text is entered the field's purpose is ambiguous.
- **Etki:** Blind/low-vision users cannot distinguish username vs email vs password vs code, or what an amount/title input expects — making the auth and data-entry flows inaccessible.
- **Fix:** Add a descriptive accessibilityLabel to every TextInput independent of the placeholder (e.g. 'Enter the 6-digit verification code', 'Expense amount in euros'); consider accessibilityHint for required/optional.
- **Neden bu sıra:** High + confidence 2; auth and data entry are unusable via screen reader without labels. Pairs with rank 18 as the a11y blockers.

#### #29 · 🔘 1/3 · applyFragments turn fallback links to userId even when userId is not an active member
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1
- **Yer:** `src/features/brain/apply.ts:128-131`
- **Ne:** When orderedMembers is empty or the holder isn't found, nextTurn() returns null and the code falls back to `.link({ turn: next ?? userId })`. If userId isn't in active memberships, this links the chore's turn to a non-member, creating a dangling reference.
- **Etki:** A chore can be assigned to someone who is not an active member — a data-integrity breach that corrupts rotation and can surface a 'turn' pointing at no valid member.
- **Fix:** Validate userId is in orderedMembers before applyFragments (return early with a skipped reason if not), and ensure `next` resolves to a valid member id before linking rather than blindly falling back to userId.
- **Neden bu sıra:** High + confidence 1; creates dangling rotation references. Single-round, so ranked at the bottom of the high tier among brain/rotation issues.

#### #30 · 🟡 2/3 · chores and choreEvents have no permission rules — cross-household rotation tampering + forged effort history
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2
- **Yer:** `instant.schema.ts:83-94 / instant.perms.ts:15-21`
- **Ne:** chores (household, turn) and choreEvents (chore→household, by) have no rules. tasks-screen writes chores and computes the holder via effectiveTurn; both turn assignment and choreEvent.by credit are unprotected.
- **Etki:** Any user can read/modify any household's chore list and rotation: change whose turn it is, mark chores done/passed for others (credit fraud), inject fake chores, or forge the effort diary.
- **Fix:** chores: view/create/update/delete = "auth.id in data.ref('household.memberships.user.id')". choreEvents (traverse the chore): view/create = "auth.id in data.ref('chore.household.memberships.user.id')", delete:false (append-only).
- **Neden bu sıra:** High + confidence 2 in the perms cluster; rotation/credit tampering. Grouped with the other per-entity perms highs.

#### #31 · 🟡 2/3 · pantryItems and purchases have no permission rules — cross-household kitchen read/tamper + corrupted prediction log
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2
- **Yer:** `instant.schema.ts:63-79 / instant.perms.ts:15-21`
- **Ne:** pantryItems (household, claimedBy) and purchases (household, by) have no rules. kitchen-screen mutates pantry rows under only a client filter; purchases is the append-only log feeding cadence/'running low' predictions.
- **Etki:** Any user can read any household's pantry/shopping list (dietary/lifestyle info) and add/claim/delete items, manipulate the claimedBy accountability link, or forge/erase purchase records — silently breaking future replenishment predictions.
- **Fix:** pantryItems: view/create/update/delete = household-member scope. purchases: view/create = household-member scope, update:false, delete:false (immutable audit log).
- **Neden bu sıra:** High + confidence 2 in the perms cluster; privacy leak plus prediction-log corruption.

#### #32 · 🟡 2/3 · activityEvents (and profiles) have no permission rules — world-readable + forgeable audit trail; any user can edit any profile
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2
- **Yer:** `instant.schema.ts:40-44 (activityEvents), 19-23 (profiles) / instant.perms.ts:15-21`
- **Ne:** activityEvents (household, actor) has no rule; activity-feed filters by household.id client-side only. profiles ($user) also has no rule. The activity feed is the cross-module audit trail of fairness decisions.
- **Etki:** Any user can read every household's activity stream (spending/chore/pantry actions, join/leave) — a system-wide privacy leak — and forge events ('Alice added a €5000 expense') to frame users or mask tampering. For profiles, any user could overwrite another's displayName/avatarUrl (impersonation).
- **Fix:** activityEvents: view = household-member scope, create = "auth.id == data.ref('actor.id')", update:false, delete:false. profiles: view public, update = "auth.id == data.ref('$user.id')" (owner-only), create system-managed.
- **Neden bu sıra:** High + confidence 2 in the perms cluster; audit-trail forgery plus profile impersonation.

#### #33 · 🟡 2/3 · households entity has no permission rules — enumeration, metadata tampering, no creation guard
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2
- **Yer:** `instant.schema.ts:26-29 / instant.perms.ts:15-21 / household.tsx:170-181`
- **Ne:** households (root entity) has no rule. household.tsx onJoin queryOnce-checks a home exists then self-joins. With no view rule any user can enumerate households to discover IDs/names; with no create/update rule any user can spam fake households or rewrite a household's name/creator.
- **Etki:** Enables household-ID discovery (feeding the cross-household leak), creation spam, and metadata tampering on name/creator. Household names can leak private info.
- **Fix:** households: view = "auth.id in data.ref('memberships.user.id')", update restricted to members/owner, delete owner-only, gate create. Design the rule so legitimate code-based joining still works (narrow lookup path) while blocking enumeration.
- **Neden bu sıra:** High + confidence 2 in the perms cluster; enumeration is the discovery primitive for the whole breach.

#### #34 · 🟡 2/3 · memberships entity has no permission rules — self-join any household, self-escalate to owner, alter other members
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`) · **Turlar:** 1, 2
- **Yer:** `instant.schema.ts:32-37 / instant.perms.ts:15-21 / household.tsx:177-182`
- **Ne:** memberships (household, user; role owner|member, status active|invited|removed) has no rule. household.tsx writes a membership immediately after a user pastes a household ID, with no server-side check that they may join.
- **Etki:** Any user who knows or guesses a household ID can self-join and gain full access; with no update rule they can self-promote to 'owner' (locking out real owners), revive their 'removed' status, or remove/downgrade real members. Household isolation collapses.
- **Fix:** memberships: view = household-member or self; restrict update/delete (role/status, removal) to existing owners; for create, enforce the new membership's user is the authed actor and add an invite-token/owner-approval guard so a leaked ID alone can't grant entry.
- **Neden bu sıra:** High + confidence 2 in the perms cluster; the privilege-escalation/self-join attack that turns an ID leak into full access.

#### #87 · 🟢 **3/3** · Index-as-key in derived debts list
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:282`
- **Ne:** debts.map((d, idx) => <View key={idx} ...>) uses the array index as key. The debts array is recomputed every render from simplifyDebts(net).filter(...), so its membership and order change when an expense is added/deleted or a debt is settled. Each row carries a Settle button.
- **Etki:** When debts reorder or shrink (e.g. after settling one), React keyed by index misassociates rows with View nodes, causing wrong labels/amounts, lost row state/animations, and incorrect reconciliation. The onSettle closure is freshly bound each render so the click is usually correct, but the visual mismatch can lead a user to settle a debt they didn't intend to.
- **Fix:** Derive a stable key from the debt relationship, e.g. key={`${d.fromId}-${d.toId}-${d.amountCents}`}, or carry an id through simplifyDebts.
- **Neden bu sıra:** High + confidence 3; index-key on a reordering money list can show wrong amounts on the Settle row, a real money-UX risk. Note: ranked within the high tier among the c3 highs (its position reflects merge ordering).

### 🟡 MEDIUM — 38 bulgu

#### #35 · 🔘 1/3 · stripPlural mangles already-singular words ending in vowel+s (e.g. 'cheeses' -> 'chees')
- **Boyut:** Kitchen normalize/alias/aging (`kitchen-correctness`) · **Turlar:** 3
- **Yer:** `src/features/kitchen/normalize.ts:43`
- **Ne:** stripPlural's second branch uses /(?:[^aeiou]es|sses|shes|ches)$/ then strips 'es'. The [^aeiou]es alternative matches any consonant+'es', so 'cheeses' matches via 'ses' and becomes 'chees' instead of 'cheese'. Intended only for box→boxes / dish→dishes / match→matches.
- **Etki:** A plural not in the alias table is mangled, so the high-confidence singular alias match is missed, falling to the low-confidence edit-distance fallback. Today dedup still works ('chees' is distance 1 from 'cheese'), so the effect is a confidence downgrade — latent risk if a future alias sits closer to the mangled form.
- **Fix:** Tighten the regex so it doesn't over-match bases ending in 'e': handle the 'vowel...e + s' family by stripping only trailing 's', restrict [^aeiou]es to true sibilant patterns (x/s/z/sh/ch). Add unit tests for cheeses, apples, boxes, dishes, matches, classes.
- **Neden bu sıra:** Medium + confidence 1; a real normalization bug currently masked by the edit-distance backstop. Top of the medium tier within kitchen because it's a concrete confirmed defect.

#### #36 · 🔘 1/3 · Unconditional unlink with empty-string claimedBy id when reviving an unclaimed item
- **Boyut:** Kitchen normalize/alias/aging (`kitchen-correctness`) · **Turlar:** 1
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:106`
- **Ne:** In onAdd, reviving an 'out' shopping-list item unconditionally calls `.unlink({ claimedBy: existing.claimedBy?.id ?? '' })`. For the dominant unclaimed case (claimedBy null) this passes '' as the link target. The unlink should be conditional on an actual claim. (Same root as the error-handling cluster's kitchen onAdd unlink finding.)
- **Etki:** For unclaimed items the unlink is meaningless — it targets a non-existent link with an empty-string id. In InstantDB it's effectively a no-op for the dominant path so the main flow isn't corrupted, but it's incorrect, fragile, and runs an invalid op inside the status-flip transaction.
- **Fix:** Only chain .unlink when existing.claimedBy?.id is truthy; otherwise just .update({ status:'in', ... }). Build the tx conditionally.
- **Neden bu sıra:** Medium + confidence 1; a fragile invalid mutation that is currently a no-op. Concrete and confirmed, hence near the top of the medium tier.

#### #37 · 🔘 1/3 · Departed member's name lost in chore history (active-only membership query)
- **Boyut:** Tasks rotation fairness (`tasks-correctness`) · **Turlar:** 1
- **Yer:** `src/features/tasks/tasks-screen.tsx:264`
- **Ne:** The membership query loads only active memberships, so orderedMembers/nameById are built solely from active members. History rows resolve a doer via nameById[ev.by?.id ?? ''] with a 'Someone' fallback. When the doer has left, their id is absent and their past contribution shows as 'Someone did it'.
- **Etki:** Violates the module's 'credit goes to the doer' rule. A roommate who did chores then moved out has their accountability erased — viewers see anonymous 'Someone' instead of who did the work. Degrades the historical record, not live rotation.
- **Fix:** Snapshot the doer's display name onto the choreEvent at creation (store byName in advance()), so history never depends on the member staying active; or run a second name-lookup over all memberships purely for display.
- **Neden bu sıra:** Medium + confidence 1; degrades credit attribution (a stated fairness value) but doesn't corrupt live state.

#### #38 · 🟢 **3/3** · Hardcoded colors in money.tsx tab guard instead of Roomie theme constants
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`) · **Turlar:** 1, 2, 3
- **Yer:** `src/app/money.tsx:12-14`
- **Ne:** Cross-dimension merge of rn-expo-idioms 'hardcoded colors in money.tsx tab guard' (medium, c3), architecture 'money.tsx #fff' (low, c1), and the rn-expo low 'money.tsx #fff' (c1) — same root. The 'Sign in first' fallback hardcodes backgroundColor:'#fff' and color:'#9b9b9b' while sibling Tasks/Kitchen guards use Roomie.canvas ('#FBF7F0') and Roomie.sub ('#97897A'). The hardcoded values aren't even visually equal, rendering a stark white background and cooler gray that breaks the warm-linen system. This is the only Money-tab surface not following the theme.
- **Etki:** Visual inconsistency on the Money tab's signed-out state; if dark mode or a theme change ships, this screen won't update and the white-on-gray fallback becomes off-theme/unreadable.
- **Fix:** Replace backgroundColor:'#fff' with Roomie.canvas and color:'#9b9b9b' with Roomie.sub, matching tasks.tsx and kitchen.tsx, and add the theme import.
- **Neden bu sıra:** Medium + confidence 3 (merged across three dimensions); the clearest, fully-confirmed theming outlier. Highest-confidence item in the medium tier so it leads the cosmetic findings.

#### #39 · 🟢 **3/3** · Hardcoded #9b9b9b placeholder color across auth, money, household (not themed; low contrast)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/auth/auth-screen.tsx:122,147,157,168; money-screen.tsx:209,216; household.tsx:145,203`
- **Ne:** Cross-dimension merge of accessibility-i18n 'hardcoded #9b9b9b placeholder' (c3), clean-code 'placeholderTextColor #9b9b9b' (c3), and the rn-expo low placeholder findings (money/auth, c1). Eight TextInputs hardcode placeholderTextColor='#9b9b9b' instead of Roomie.sub (kitchen/tasks use the constant). Both a theme-consistency defect and a contrast defect: #9b9b9b yields ~2.6-2.74:1 on the input/canvas backgrounds, below the 3.0 floor.
- **Etki:** Placeholder guidance in login/signup, expense entry, and household join/create is hard to read for low-vision users or in bright light, and the hardcoding makes a single a11y fix require edits in 3+ files.
- **Fix:** Define a dedicated themed placeholder color in theme.ts (e.g. Roomie.placeholder, ~#6B6660 for true AA) and replace all 8 hardcoded #9b9b9b with it.
- **Neden bu sıra:** Medium + confidence 3 (merged); a genuine contrast failure plus theming debt across the most-seen forms. Strong consensus, hence high in the medium tier.

#### #40 · 🟢 **3/3** · Hardcoded colors in money-screen styles (#9b9b9b, #c0392b, #fff) bypass theme
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:403,406,408,409`
- **Ne:** Cross-dimension merge of accessibility-i18n 'hardcoded money-screen styles' (c3), clean-code 'hardcoded hex bypass theme' (c3), rn-expo 'settleLabel #fff + raw fontWeight' (c2), and the rn-expo lows (#9b9b9b expenseMeta, #c0392b deleteLabel/error). settleLabel '#fff' + fontWeight '600', expenseMeta '#9b9b9b', deleteLabel/error '#c0392b' instead of Roomie.onAccent/sub/danger and RoomieFonts. expenseMeta at 12px is ~2.6:1 (fails the 3.0 small-text floor); #c0392b is a different red than Roomie.danger (#B5543B).
- **Etki:** Secondary expense metadata is hard to read; the destructive/error red is inconsistent with the app; none adapt to palette/dark-mode changes. Contrast failure on expenseMeta plus maintenance burden.
- **Fix:** Replace '#fff'→Roomie.onAccent, '#9b9b9b'→a darker themed secondary color, both '#c0392b'→Roomie.danger, and settleLabel fontWeight '600'→fontFamily RoomieFonts.bodyBold. Verify expenseMeta meets the 3.0+ floor.
- **Neden bu sıra:** Medium + confidence 3 (merged across four dimensions); combines a real contrast failure with theme/font drift in the money styles. High medium-tier confidence.

#### #41 · 🔘 1/3 · Amount draft display inconsistency hides the silent-revert failure
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 3
- **Yer:** `src/features/brain/brain-input.tsx:121-130`
- **Ne:** The fragment summary line and the amount TextInput (defaultValue) both render from f.amountCents and never reflect amountDraft[idx] as the user types. The TextInput is uncontrolled, so the typed value lives only in amountDraft while the summary keeps showing the original. Combined with the silent-revert bug (rank 9), the user sees the same original amount and believes their edit took effect.
- **Etki:** Masks the silent-revert correctness issue: the UI gives a false sense the edit succeeded, degrading the user's ability to verify inputs before confirming. Even alone, summary and edit field can show two different numbers.
- **Fix:** Make the displayed amount reflect the in-progress edit: show amountDraft[idx] when defined (e.g. 'milk — €5.00 → €10.00'), falling back to f.amountCents.
- **Neden bu sıra:** Medium + confidence 1; amplifies a high-severity correctness bug by hiding it. Ranked here for its coupling to rank 9.

#### #42 · 🟡 2/3 · Apply failure shows brain-parse error copy and drops the error detail (onConfirm catch omits setErrorDetail)
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 1, 2
- **Yer:** `src/features/brain/brain-input.tsx:89-91 (catch) + 166-170 (error UI)`
- **Ne:** Cross-dimension merge of brain-correctness 'apply failure shows parse error copy' (c2), state-management 'onConfirm catch omits setErrorDetail' (c1), and async-races 'BrainInput catch omits setErrorDetail' (c1). The onConfirm catch is bare `} catch { setPhase('error'); }` — never captures errorDetail (unlike onSend). The single error surface hardcodes 'Brain couldn't read that — nothing was saved.', a parse-phase message, and errorDetail may hold a stale value from a prior onSend failure. When applyFragments throws, the user sees a misleading message and no detail.
- **Etki:** The user can't tell whether the input was misunderstood or the write failed, and gets no detail. 'Nothing was saved' can also be false after a partial apply (rank 24). Inconsistent with the send path.
- **Fix:** Capture the error in the apply catch (`catch (e) { setErrorDetail((e as Error)?.message ?? String(e)); setPhase('error'); }`) and use a separate flag for apply vs parse failures so the UI shows 'Couldn't save — try again' for write errors. Clear errorDetail at confirm-start.
- **Neden bu sıra:** Medium + confidence 2 (merged); misleading/undebuggable error on a money-write path, compounded by the partial-apply 'nothing saved' lie.

#### #43 · 🔘 1/3 · shopping_add fragments logged as 'pantry_out', conflating 'we need X' with 'X ran out'
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 1
- **Yer:** `src/features/brain/apply.ts:72,107-108`
- **Ne:** In the pantry branch, both pantry_out and shopping_add map to status 'out', and the activity log uses pantry_got vs pantry_out — so shopping_add ('we need X') is logged as 'pantry_out'. The ActivityType union has no shopping_add type, and describeEvent renders pantry_out as '<who> says <item> is out'. The applied ack says '→ shopping list', so confirm and feed disagree.
- **Etki:** The activity feed shows semantically wrong history: a 'we need X' intent looks identical to 'X ran out', confusing housemates and conflating future-need with immediate depletion.
- **Fix:** Add a distinct activity type (shopping_needed) to the ActivityType union with its own describeEvent line and log it for shopping_add; or disambiguate via metadata.
- **Neden bu sıra:** Medium + confidence 1; semantic corruption of the shared activity log. Concrete and confirmed.

#### #44 · 🟡 2/3 · Brain draft API response is type-cast without runtime validation, risking a feature-blocking crash
- **Boyut:** API request/response validation (`api-validation`) · **Turlar:** 1, 2
- **Yer:** `src/features/brain/brain-input.tsx:58-62`
- **Ne:** The /draft response is consumed with `const body = (await res.json()) as DraftResponse`, a cast with zero runtime checking. Code reads `body.fragments.length` and passes fragments/question into state and applyFragments. A missing/malformed fragments field (server bug, proxy, MITM) throws 'Cannot read property length of undefined' at the only brain fetch point. No client re-validation means out-of-range data could flow into apply if server zod were bypassed. In normal operation the worker validates+clamps before responding, so this needs an upstream failure.
- **Etki:** A malformed/missing-field response crashes the brain feature with an unhandled TypeError instead of an error state; in the server-bug/MITM case, unvalidated out-of-constraint values could reach the confirm/write flow.
- **Fix:** Validate the response with zod at the client boundary (mirror the worker contract): `const validated = draftResponseSchema.safeParse(body)` with an explicit error branch, then read validated.fragments/question.
- **Neden bu sıra:** Medium + confidence 2; a crash/validation gap at the brain boundary, mitigated by the worker normally validating. Concrete with a clear fix.

#### #45 · 🟡 2/3 · CLERK_SECRET_KEY (server secret) present in client-side .env.local
- **Boyut:** Secrets & config hygiene (`secrets-config`) · **Turlar:** 1, 2
- **Yer:** `.env.local:2`
- **Ne:** The Clerk backend secret (sk_test_...) is stored in the Expo client's .env.local. Wrong scope: a server-only secret in a client env file. It is never referenced in src/ or workers/, confirming a mistake. .env.local is gitignored but IS git-tracked; the secret line is currently local-only and NOT in committed history, so no live exposure yet — but a future commit of the tracked file could capture it.
- **Etki:** Incorrect secret scope creates an unnecessary leakage trap: because .env.local is tracked, the ignore is fragile and a future commit would capture the secret into history. Replicating this in production would leak real backend credentials. Mitigated: it's a test key, unused, and not in committed history.
- **Fix:** Remove the CLERK_SECRET_KEY line — the client needs only EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. If backend verification is ever needed, store it via `wrangler secret put` like GROQ_API_KEY. Also `git rm --cached .env.local` so the ignore actually takes effect.
- **Neden bu sıra:** Medium + confidence 2; a real leakage trap, kept below critical because the key is a test key, unused, and not yet in history.

#### #46 · 🟡 2/3 · Caught exception cast to Error in brain-input error handler
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 2, 3
- **Yer:** `src/features/brain/brain-input.tsx:68`
- **Ne:** `setErrorDetail((e as Error)?.message ?? String(e));` casts the unknown caught value to Error before reading `.message`. Optional chaining and String(e) make it functionally safe, but the cast bypasses the type check and hides that `e` is genuinely unknown.
- **Etki:** No crash today thanks to optional chaining, but the pattern is fragile and could mask bugs if surrounding code is refactored to assume `e` is an Error.
- **Fix:** Use a type guard: `const msg = e instanceof Error ? e.message : String(e); setErrorDetail(msg);`
- **Neden bu sıra:** Medium + confidence 2; a safe-today but fragile cast on an error path. Quick fix, no current user impact.

#### #47 · 🟡 2/3 · Caught exception cast to Error and re-cast to CfAiError with property mutation
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 2, 3
- **Yer:** `workers/brain/src/cloudflare-ai.ts:62`
- **Ne:** `const err = new Error(`${label} cloudflare-ai: ${(e as Error)?.message ?? e}`) as CfAiError; err.status = 429;` — unknown `e` cast to Error to read `.message`, then a fresh Error cast to CfAiError and mutated. Two unsafe casts plus construct-then-mutate in one block.
- **Etki:** Optional chaining keeps message construction from crashing, but if `e` isn't an Error the interpolated message can mislead, and the cast-then-assign silently breaks if CfAiError's shape changes.
- **Fix:** Extract the message safely and build the typed error in one shot: `const msg = e instanceof Error ? e.message : String(e); const err = Object.assign(new Error(`${label} cloudflare-ai: ${msg}`), { status: 429 }) as CfAiError; throw err;`
- **Neden bu sıra:** Medium + confidence 2; same fragile-cast family in the worker fallback path.

#### #48 · 🔘 1/3 · applyFragments creates expense with empty participants when no active members
- **Boyut:** Error & edge handling (`error-handling`) · **Turlar:** 2
- **Yer:** `src/features/brain/apply.ts:45-60`
- **Ne:** orderedMembers is built from active memberships. If empty, the expense fragment still creates an expense linked with participants: []. computeNetCents skips zero-participant expenses, so the expense exists but is invisible to the debt math.
- **Etki:** An expense can be written that splits among nobody — the amount is recorded but never attributed, yielding incomplete debts. Edge case: stale auth or a fully-emptied household hitting the brain endpoint.
- **Fix:** Guard the expense branch: if orderedMembers.length === 0, push a skipped[] note and continue instead of writing an unsplittable expense.
- **Neden bu sıra:** Medium + confidence 1; a money-invisibility edge case in the brain writer. Concrete and confirmed.

#### #49 · 🔘 1/3 · applyFragments assumes nested query arrays (memberships/pantryItems/chores) are defined
- **Boyut:** Error & edge handling (`error-handling`) · **Turlar:** 3
- **Yer:** `src/features/brain/apply.ts:45,69,120`
- **Ne:** After null-checking only household, the code spreads/iterates household.memberships, .pantryItems.find, and .chores.find assuming they're present. If InstantDB returns the household but nulls a nested relation, .sort/.find throws.
- **Etki:** A brain input with a pantry or chore fragment can throw a TypeError if the household query hasn't fully loaded those nested entities, bubbling to the generic onConfirm catch with no recovery.
- **Fix:** Default the accessors: `(household.memberships ?? [])`, `household.pantryItems?.find(...)`, `household.chores?.find(...)`.
- **Neden bu sıra:** Medium + confidence 1; a defensive gap in the brain writer. Lower-likelihood than the higher clusters.

#### #50 · 🟢 **3/3** · Stale household/pantry snapshot allows duplicate pantry items (kitchen onAdd + brain applyFragments)
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:88-124 (also brain apply.ts:34,69)`
- **Ne:** The dedup check 'does this normalizedName already exist?' runs against a render-time (kitchen onAdd) or single-queryOnce (brain apply) snapshot, while the create/revive transact happens later. If another roommate adds the same normalized item between check and write, both take the create branch and produce two rows. In apply.ts fragment 2 can't see a row created by fragment 1's own transact (intra-batch staleness).
- **Etki:** Duplicate pantry rows with identical normalizedName accumulate, confusing inventory and defeating the normalizer's dedup guarantee; cadence/prediction keyed on a canonical row degrades. Brain-applied items can duplicate manual items and each other.
- **Fix:** Perform the existence check at write time: re-query the pantry inside onAdd / per-fragment immediately before the transact, or enforce a unique (household, normalizedName) constraint and handle conflict, or fold dedup into an atomic conditional write. In apply.ts re-query per fragment or batch into one transact tracking earlier-created items.
- **Neden bu sıra:** Medium + confidence 3; a confirmed multi-user race that erodes the kitchen dedup promise. Highest-confidence medium race, ranked above the c1/c2 mediums.

#### #51 · 🟢 **3/3** · Hardcoded #9b9b9b placeholderTextColor instead of Roomie.sub across multiple screens
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:209,216 (also household.tsx:145,203; auth-screen.tsx:122,147,157,168)`
- **Ne:** money-screen and household.tsx pass placeholderTextColor='#9b9b9b' while tasks/kitchen use Roomie.sub. auth-screen also hardcodes it. Roomie.sub is '#97897A' — '#9b9b9b' isn't even the same value, so it's a genuine inconsistency, not just a source nit. (Theming/maintainability framing of the same lines as the a11y placeholder cluster at rank 39; kept distinct as the clean-code dimension's record but it is the same root.)
- **Etki:** Some screens get the theme placeholder color and others a different hardcoded grey, creating subtle visual inconsistency and breaking centralized theming / dark-mode support.
- **Fix:** Replace '#9b9b9b' with {Roomie.sub} (or the new Roomie.placeholder from rank 39) in money-screen, household.tsx, and auth-screen.
- **Neden bu sıra:** Medium + confidence 3; theming-maintainability view of the placeholder cluster. Overlaps rank 39 but recorded separately per the clean-code dimension's elevated severity.

#### #52 · 🟡 2/3 · Small action/delete buttons fall below 44x44pt touch-target minimum
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2
- **Yer:** `src/features/tasks/tasks-screen.tsx:442-453; money-screen.tsx; kitchen-screen.tsx:425-444`
- **Ne:** Delete buttons use padding:4 (~23pt) and padding:6 (~27pt); pass/done/claim/got-it/out chips use paddingVertical:7 with ~13px text (~27-30pt). All below the 44x44pt iOS/48dp Android minimum. Delete buttons carry hitSlop=8 (partial mitigation), but action chips have none.
- **Etki:** Users with motor impairments or large fingers, or on small devices, struggle to tap delete and the action buttons accurately — risking accidental data deletion and failed core interactions.
- **Fix:** Raise targets to >=44pt via minHeight/minWidth:44 or paddingVertical:12+, or hitSlop>=18 where keeping the compact size. Apply to delete buttons and all small action chips.
- **Neden bu sıra:** Medium + confidence 2; a tappability barrier on core actions, partially mitigated by existing hitSlop on delete.

#### #53 · 🟢 **3/3** · No i18n/localization infrastructure; all UI strings hardcoded in English
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:274; tasks-screen.tsx:335; kitchen-screen.tsx:317; auth-screen.tsx:59,117; src/app/index.tsx:20,23,27`
- **Ne:** Every user-facing string is hardcoded English. No src/i18n directory and no i18n library in package.json. Turkish placeholder examples ('süt aldım 5€') signal intent to serve non-English roommates, but no localization mechanism exists.
- **Etki:** The app is English-only; non-English-speaking roommates — the literal target users of a shared-house app — cannot use it in their language.
- **Fix:** Introduce an i18n layer (react-i18next or expo-localization + i18n-js), create locale JSON files, and replace hardcoded strings with keys, supporting EN plus the household's languages.
- **Neden bu sıra:** Medium + confidence 3; a structural gap against the stated multilingual ambition. High confidence but lower urgency than security/correctness, hence mid-medium.

#### #54 · 🟢 **3/3** · No dynamic type / font scaling support (allowFontScaling, maxFontSizeMultiplier)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2, 3
- **Yer:** `src/constants/theme.ts; all screen style definitions`
- **Ne:** All font sizes are hardcoded px and no Text sets allowFontScaling or maxFontSizeMultiplier. RN scaling is on by default, but the absence of explicit handling means no guard against layout breakage and no validation that large-text users benefit.
- **Etki:** Users relying on Larger Accessibility Sizes may see no usable benefit and small text stays hard to read. Risks WCAG 2.1 AA 1.4.4.
- **Fix:** Confirm allowFontScaling stays enabled and add maxFontSizeMultiplier (~1.5) to prevent overflow; consider bumping base sizes when large-text/screen-reader settings are active.
- **Neden bu sıra:** Medium + confidence 3; a standard a11y gap with broad consensus but modest immediate impact.

#### #55 · 🟡 2/3 · Roomie.sub secondary text contrast borderline on canvas (labels, hints, activity feed)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1, 2
- **Yer:** `src/constants/theme.ts:18; activity-feed.tsx:41,60-62; auth-screen.tsx`
- **Ne:** Roomie.sub (#97897A) on Roomie.canvas (#FBF7F0) computes to ~3.18-4.2:1 — at or below the 4.5:1 AA threshold for the 12-14px normal text it's used for (labels, auth hints, activity-feed text). Passes the 3.0 large-text floor but not normal-text AA. Distinct from the #9b9b9b clusters: this is the theme's own legitimate secondary color being marginal.
- **Etki:** Secondary/metadata text — instructions, field labels, the activity feed — is hard to read for low-vision/color-deficient users and on dim/bright displays. Thin-to-failing compliance margin.
- **Fix:** Darken Roomie.sub toward ~4.5:1, or reserve it strictly for non-critical hints and use Roomie.ink for body-level secondary text. Verify with a simulator.
- **Neden bu sıra:** Medium + confidence 2; a borderline AA failure on the theme's own token, affecting widely-used secondary text.

#### #56 · 🔘 1/3 · Collapsible toggle lacks accessibilityRole/Label/Expanded state
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 1
- **Yer:** `src/components/ui/collapsible.tsx:17-19`
- **Ne:** The Pressable toggling collapsed state has no accessibilityRole='button', accessibilityLabel, or accessibilityExpanded. Screen-reader users get no announcement of the section title, that it's a toggle, or its open/closed state.
- **Etki:** Blind/low-vision users can't tell sections are expandable or know their current state, degrading navigation of the app's structure.
- **Fix:** Add accessibilityRole='button', accessibilityLabel={title}, accessibilityExpanded={isOpen}, and an accessibilityHint.
- **Neden bu sıra:** Medium + confidence 1; a focused a11y gap on a reusable component.

#### #57 · 🔘 1/3 · Error messages lack accessibilityRole='alert' / live region
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 2
- **Yer:** `src/features/auth/auth-screen.tsx:128,174; money-screen.tsx (error :409); kitchen/tasks screens`
- **Ne:** Inline error Text carries no accessibilityRole='alert' or accessibilityLiveRegion. The same untagged pattern repeats across auth, money, kitchen, tasks. When errors appear/change, screen readers aren't notified.
- **Etki:** Screen-reader users may never hear validation/sign-in failures, leaving them stuck on a form with no feedback.
- **Fix:** Add accessibilityRole='alert' and accessibilityLiveRegion='assertive' to all error Text components.
- **Neden bu sıra:** Medium + confidence 1; silent errors for screen-reader users on the most failure-prone flows (auth).

#### #58 · 🔘 1/3 · ActivityIndicator / loading states lack accessibility announcement
- **Boyut:** Accessibility & i18n (`accessibility-i18n`) · **Turlar:** 2
- **Yer:** `src/features/brain/brain-input.tsx:110-111,154`
- **Ne:** The ActivityIndicator shown during brain 'thinking' and 'applying' has no accessibilityLabel and no live region. Screen-reader users get no signal the app is processing.
- **Etki:** Blind/low-vision users don't know an action is in progress and may assume the app froze or retry prematurely.
- **Fix:** Add accessibilityLabel='Processing your request' and accessibilityLiveRegion='polite' to the ActivityIndicator (or announce via the triggering button's hint).
- **Neden bu sıra:** Medium + confidence 1; a processing-state a11y gap on the brain flow.

#### #59 · 🔘 1/3 · Chore lookup uses order-dependent bidirectional substring matching (medium variant)
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 2
- **Yer:** `src/features/brain/apply.ts:120-123`
- **Ne:** Brain-correctness dimension's own record of the chore substring matching issue (see rank 13, where it merges with the testing-gaps high-confidence finding). chore_done resolves with `name.includes(needle) || needle.includes(name)` and find() returns the first array match; overlapping names make selection order-dependent.
- **Etki:** A brain-driven chore completion can mark the wrong chore as done, advancing the wrong rotation turn — non-deterministic, hinging on chores array ordering.
- **Fix:** Rank candidates (exact > prefix > substring) and pick the best, or require exact/prefix match. (Same fix as rank 13.)
- **Neden bu sıra:** Medium + confidence 1; this is the lower-confidence dimension record of the merged rank-13 issue, retained for traceability. Its real priority is captured at rank 13.

#### #60 · 🔘 1/3 · Stale render-time timestamp `now` reused for all delayed kitchen writes
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 1
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:91`
- **Ne:** `const now = nowMs()` is computed once at render and used inside async onAdd for addedAt/createdAt/updatedAt. Because onAdd runs after render, stamps reflect render time, not action time. onOut/onClaim/onGotIt correctly call nowMs() at call time, so this is specific to onAdd.
- **Etki:** If the screen sits open 30s before an add, the item's timestamps are stamped 30s in the past. Item-aging (ageOf) and cadence/freshness calculations are skewed; items added in one render share the same wrong stamp.
- **Fix:** Remove the render-scoped `const now = nowMs()` and call `const ts = nowMs()` at the top of onAdd; verify each async write uses a call-time timestamp.
- **Neden bu sıra:** Medium + confidence 1; skews aging/cadence data feeding the kitchen predictions. Concrete and confirmed.

#### #61 · 🔘 1/3 · No double-submit guard on remaining kitchen/tasks action buttons (Out, Got it, Done, Delete, Suggestion add)
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 2
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:134-179`
- **Ne:** Beyond claim/settle, several action buttons are wired to async handlers with no busy/disabled flag: kitchen onOut and onGotIt, tasks onMineDone/onMineDelete, onAddSuggestion. onGotIt is most consequential: each tap inserts a purchases row, so a double-tap writes duplicate purchase events into the cadence log.
- **Etki:** Double-tapping 'Got it' pollutes the purchases/cadence-prediction log with false duplicate events; double-tapping Out re-fires status writes; double-tapping Delete operates on an already-deleted row.
- **Fix:** Add per-action pending state (id-keyed) and disable each button while its async op is in flight.
- **Neden bu sıra:** Medium + confidence 1; cadence-log corruption from double-taps. Lower than the settle/claim double-submits by financial impact.

#### #62 · 🟡 2/3 · applyFragments processes brain fragments sequentially with no per-fragment error handling or partial-result reporting
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 2, 3
- **Yer:** `src/features/brain/apply.ts:53-152`
- **Ne:** The for-loop runs awaited transacts per fragment with no try/catch. If fragment 2 fails, fragment 1 is persisted, the loop throws, and applyFragments never returns its accumulated applied/skipped — all-or-nothing with no partial credit. (Closely related to the rank-24 atomicity merge; this is the async-races framing of the same loop, emphasizing lost partial results.)
- **Etki:** On a 5-fragment dump where fragment 2 fails, fragment 1 is written but 3-5 never run and the caller sees a single top-level error instead of 'applied 1, failed 1, skipped 3'. The user may re-send and create duplicates.
- **Fix:** Wrap each fragment's transacts in try/catch, collect failures, let every fragment attempt independently, and return the partial ApplyResult; or batch all fragments into one multi-statement transact.
- **Neden bu sıra:** Medium + confidence 2; the partial-result reporting view of the apply loop. Overlaps rank 24 but recorded for the per-fragment reporting angle.

#### #63 · 🔘 1/3 · BrainInput onConfirm catch block omits setErrorDetail, leaving a stale/empty error message
- **Boyut:** State management patterns (`state-management`) · **Turlar:** 2
- **Yer:** `src/features/brain/brain-input.tsx:89`
- **Ne:** State-management dimension's record of the onConfirm catch omitting setErrorDetail (merged into rank 42). The catch is `catch { setPhase('error'); }`, inconsistent with onSend; errorDetail can be stale from a prior failure, and the shared errorDetail is only populated by one path.
- **Etki:** When a DB write fails during confirm, users get an unhelpful and possibly stale error, undebuggable from the UI and inconsistent with the send path.
- **Fix:** Capture and set the error in the onConfirm catch, and clear errorDetail at confirm-start. (Same fix as rank 42.)
- **Neden bu sıra:** Medium + confidence 1; the state-management record of the merged rank-42 issue, retained for traceability.

#### #64 · 🔘 1/3 · TOCTOU between household-existence check and membership creation in Join
- **Boyut:** Async & race conditions (`async-races`) · **Turlar:** 3
- **Yer:** `src/features/household/household.tsx:161-194`
- **Ne:** onJoin queryOnce-checks the household exists, then in a separate transact creates a membership linked to that id. Between the two, the household could be deleted, so the membership links to a non-existent household. Check and write aren't in one transaction.
- **Etki:** A user can create a membership row pointing at a deleted household, producing orphaned data and an inconsistent join state.
- **Fix:** Fold the existence assertion and the membership link into one transaction, or re-validate immediately before linking, or detect/clean up the orphaned membership when the link resolves against a missing household.
- **Neden bu sıra:** Medium + confidence 1; a real but rare/recoverable TOCTOU in the join flow.

#### #65 · 🔘 1/3 · InstantClerkBridge swallows auth-sync failures with only console.warn
- **Boyut:** Error & edge handling (`error-handling`) · **Turlar:** 3
- **Yer:** `src/features/auth/instant-clerk-bridge.tsx:32-34`
- **Ne:** The Clerk→Instant token bridge catches errors with only `console.warn(...)`. No retry, no user-visible state. If signInWithIdToken or getToken fails, the user stays signed into Clerk but is never authenticated to InstantDB.
- **Etki:** On bridge failure the user appears logged in but every InstantDB query/transaction fails or returns nothing with no UI signal to retry or sign out — the whole app silently goes offline for that session.
- **Fix:** Surface bridge state to the app root (context) and show a retry banner on failure; retry with exponential backoff instead of a single warn-only attempt.
- **Neden bu sıra:** Medium + confidence 1; a silent total-failure mode for the session, mitigated by being a narrow auth-window event.

#### #67 · 🟢 **3/3** · Generic utility functions misplaced in money-logic.ts, causing cross-feature coupling
- **Boyut:** File structure & architecture (`architecture`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-logic.ts:72-80`
- **Ne:** nowMs() (a Date.now() wrapper) and parseAmountToCents() (currency string parsing) are exported from the Money domain module but are generic. The module comment confirms nowMs addresses a general React-Compiler concern. They're imported by four non-Money files: brain-input.tsx, kitchen-screen.tsx, brain/apply.ts, tasks-screen.tsx.
- **Etki:** Inappropriate coupling: kitchen, tasks and brain depend on money merely for shared utilities. money-logic becomes a catch-all, obscuring module boundaries; if it is later refactored/moved, these unrelated features break.
- **Fix:** Extract nowMs and parseAmountToCents into a feature-neutral module (e.g. src/lib/utils.ts) and update the four importers.
- **Neden bu sıra:** Medium + confidence 3; the strongest architecture finding — a real boundary violation, though non-functional. Leads the architecture/maintainability group within its severity.

#### #68 · 🟢 **3/3** · emailName() helper defined identically in three screen files
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-screen.tsx:33-36; kitchen-screen.tsx:35-38; tasks-screen.tsx:38-41`
- **Ne:** Cross-dimension merge of clean-code (c3), lint-deadcode (c1), wheel-reinvention (c2), and state-management (c1) — same root. The identical emailName(email?) helper (split on '@', strip +tag) is defined verbatim in money/kitchen/tasks screens.
- **Etki:** DRY violation: a change to email-to-display-name parsing must be made in three places, risking drift in how roommate names render across Money/Kitchen/Tasks.
- **Fix:** Extract emailName() to a shared utility (e.g. src/lib/email.ts) and import it in all three screens, deleting the copies.
- **Neden bu sıra:** Medium + confidence 3 (merged across four dimensions); the most-confirmed duplication, spanning three call sites. Leads the dedup findings.

#### #69 · 🟢 **3/3** · Centered loading/error component duplicated identically across three screen files
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/tasks/tasks-screen.tsx:369-375; money-screen.tsx:326-332; kitchen-screen.tsx:347-353`
- **Ne:** Cross-dimension merge of clean-code (c3) and wheel-reinvention (c1). The same Centered({ children }) component (SafeAreaView wrapping a centered View for loading/error) is defined verbatim in tasks/money/kitchen. Relies on local styles.safe/styles.center in each file, so extraction also consolidates those styles.
- **Etki:** DRY violation plus marginal bundle weight: any change to safe-area handling or centering must be replicated three times.
- **Fix:** Extract Centered to a shared component (src/components/centered.tsx) with self-contained safe/center styles and import it in all three screens.
- **Neden bu sıra:** Medium + confidence 3 (merged); a clean, fully-confirmed extraction across three files.

#### #70 · 🔘 1/3 · Duplicate emailName flagged as dead-code/lint debt
- **Boyut:** Dead code & lint debt (`lint-deadcode`) · **Turlar:** 1
- **Yer:** `src/features/tasks/tasks-screen.tsx:38; money-screen.tsx:33; kitchen-screen.tsx:35`
- **Ne:** Lint-deadcode dimension's own record of the triplicated emailName helper (merged into rank 68). Identical function copy-pasted into three screens, each consumed locally.
- **Etki:** DRY violation across three call sites with drift risk; slightly larger bundle.
- **Fix:** Extract to a shared module and import in all three screens (same fix as rank 68).
- **Neden bu sıra:** Medium + confidence 1; the lint-dimension record of the merged rank-68 issue, retained for traceability.

#### #84 · 🔘 1/3 · Effect re-runs on every render due to unstable getToken dependency
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 1, 3
- **Yer:** `src/features/auth/instant-clerk-bridge.tsx:40`
- **Ne:** Cross-dimension merge of react-perf (c1) and state-management (c1). The InstantClerkBridge effect lists getToken in its deps; if Clerk returns a new function reference per render, the effect re-runs even when isSignedIn/user are unchanged. The `if (user) return` guard limits damage, but the cleanup/re-subscribe cycle still churns.
- **Etki:** Repeated effect setup/teardown can trigger redundant getToken() calls and db.auth.signInWithIdToken attempts before the bridge settles, producing warning-log noise and unnecessary InstantDB re-subscriptions during the auth window.
- **Fix:** Drop getToken from the deps (rely on the existing user guard and read it lazily), or capture it via a ref so its identity doesn't drive re-runs.
- **Neden bu sıra:** Medium + confidence 1 (merged); auth-window churn, bounded by the user guard. Mid-low because effect is partly self-guarded.

#### #85 · 🔘 1/3 · O(n) array.includes() in Split-between chip render loop (O(n^2) total)
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 1
- **Yer:** `src/features/money/money-screen.tsx:242`
- **Ne:** In the 'Split between' chip row, members.map((m) => participantIds.includes(m.userId)) runs a linear scan for every member, making selection-state O(n^2) per render. participantIds is derived each render; no Set/useMemo is used.
- **Etki:** For a household with many members the quadratic check runs on every keystroke in the amount field and every toggle, causing jank on slower devices. Small for typical 2-5 person homes.
- **Fix:** Build a Set once before the map: `const participantSet = new Set(participantIds);` then participantSet.has(m.userId). Optionally memoize with useMemo.
- **Neden bu sıra:** Medium + confidence 1; quadratic render, negligible at typical household sizes.

#### #86 · 🔘 1/3 · setTimeout without cleanup can set state after unmount (HouseholdMember copy button)
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 1
- **Yer:** `src/features/household/household.tsx:236`
- **Ne:** onCopy calls setTimeout(() => setCopied(false), 1500) without retaining or clearing the timer. If the component unmounts within 1.5s of pressing Copy, the timer fires setCopied on an unmounted component.
- **Etki:** React 'state update on an unmounted component' warning / wasted update and a minor leak pattern; not a crash. Low real-world frequency.
- **Fix:** Move the reset into an effect tied to the copied flag and clear on cleanup: `useEffect(() => { if (!copied) return; const t = setTimeout(...); return () => clearTimeout(t); }, [copied])`.
- **Neden bu sıra:** Medium + confidence 1; a classic unmount-leak, low frequency.

### ⚪ LOW — 22 bulgu

#### #66 · 🔘 1/3 · Brain applyFragments truthy guard would silently skip a zero-amount expense
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`) · **Turlar:** 1
- **Yer:** `src/features/brain/apply.ts:56`
- **Ne:** The expense guard `if (f.target === 'expense' && f.title && f.amountCents)` relies on truthiness; 0 is falsy. The schema ensures amountCents>0 today, but if zero-amount expenses ever become valid, such fragments would silently fall through and be reported as 'couldn't place: expense'.
- **Etki:** Latent correctness/resilience risk: a future schema change allowing zero amounts would cause silent skips. No current user-facing impact.
- **Fix:** Use an explicit `f.amountCents != null` presence check.
- **Neden bu sıra:** Low + confidence 1; latent, gated by current schema. Top of the low tier among brain items because it's a concrete future-proofing fix.

#### #71 · 🟡 2/3 · EUR formatting duplicated across 4-5 files instead of using formatEur()
- **Boyut:** Reinvented wheels (`wheel-reinvention`) · **Turlar:** 1, 2
- **Yer:** `src/features/money/money-logic.ts:66-68 (canonical); duplicated at activity.ts:34, brain/types.ts:35, brain/apply.ts:63, brain-input.tsx:127`
- **Ne:** Cross-dimension merge of wheel-reinvention (c2) and clean-code (c1). money-logic exports the canonical formatEur(cents), but the `€${(cents/100).toFixed(2)}` pattern is inlined in activity.ts, brain/types.ts, brain/apply.ts, and a bare-number variant in brain-input.tsx. money-screen already imports formatEur, proving the intended single source.
- **Etki:** DRY violation in money-handling code; if precision, symbol placement, or rounding changes, it must be updated in 4-5 places, risking inconsistent currency display across the activity feed, brain suggestions, and money screen.
- **Fix:** Reuse formatEur in activity.ts, brain/types.ts, brain/apply.ts; for brain-input.tsx's bare-number default add a small centsToDecimal(cents) helper in money-logic so the division+rounding lives in one place.
- **Neden bu sıra:** Low + confidence 2 (merged); money-display DRY debt with consistency risk but no current bug.

#### #72 · 🔘 1/3 · Web tab bar shows stale 'Expo Starter' scaffold branding
- **Boyut:** File structure & architecture (`architecture`) · **Turlar:** 2
- **Yer:** `src/components/app-tabs.web.tsx:65`
- **Ne:** The web-only CustomTabList renders hardcoded 'Expo Starter' brand text, leftover scaffold copy never replaced with the Roomie brand.
- **Etki:** Web users see 'Expo Starter' instead of 'Roomie' in the tab bar. Minor UX/branding issue; web is a secondary surface.
- **Fix:** Replace 'Expo Starter' with 'Roomie', or remove the brand ThemedText if branding isn't needed in the web layout.
- **Neden bu sıra:** Low + confidence 1; cosmetic branding leftover on a secondary surface.

#### #73 · 🔘 1/3 · Centered layout wrapper flagged under wheel-reinvention
- **Boyut:** Reinvented wheels (`wheel-reinvention`) · **Turlar:** 3
- **Yer:** `src/features/tasks/tasks-screen.tsx:369-375; money-screen.tsx:326-332; kitchen-screen.tsx:347-353`
- **Ne:** Wheel-reinvention dimension's record of the triplicated Centered wrapper (merged into rank 69). Same SafeAreaView+centered-View component reimplemented in three screens, relying on local styles.
- **Etki:** DRY violation: the same empty/loading-state wrapper maintained in three places. Purely presentational.
- **Fix:** Extract Centered to a shared component with self-contained styles (same fix as rank 69).
- **Neden bu sıra:** Low + confidence 1; the wheel-reinvention record of the merged rank-69 issue, retained for traceability.

#### #74 · 🟡 2/3 · Invalid keyframe keypoint DURATION/1000 (0.3) in animated-icon.web.tsx glowKeyframe
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`) · **Turlar:** 1, 2
- **Yer:** `src/components/animated-icon.web.tsx:47`
- **Ne:** In glowKeyframe, the middle keypoint is [DURATION/1000] where DURATION=300, evaluating to 0.3. Reanimated Keyframe keypoints must be integer percentages on a 0-100 timeline (neighbors are 0 and 100). 0.3 collapses onto the 0% frame, so the intended mid-animation glow waypoint never plays — the glow jumps from 0% toward 100% (rotateZ 7200deg) without the waypoint.
- **Etki:** The web startup glow animation renders incorrectly, a platform-specific UX difference vs native. Web-only, cosmetic, hence low despite the high-ish label in its dimension.
- **Fix:** Replace [DURATION/1000] with a valid integer percentage expressing the intended timing (e.g. 30) and re-verify the glow.
- **Neden bu sıra:** Low (cosmetic, web-only) + confidence 2; a confirmed animation bug but no functional impact. Note: its dimension labeled it high, downgraded here per cosmetic/secondary-surface impact.

#### #75 · 🟡 2/3 · Redundant `as string` assertion on body.model in groq telemetry
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 2, 3
- **Yer:** `workers/brain/src/groq.ts:131`
- **Ne:** `model: (body.model as string) ?? GROQ_MODEL` casts body.model (unknown, from Record<string, unknown>) before the ?? fallback. The cast is functionally redundant; the real root is the overly broad body typing.
- **Etki:** Purely a readability/type-discipline issue — code is correct. The broad Record typing loses narrowing for body throughout the function.
- **Fix:** Drop the redundant cast once body is typed, or give body an explicit shape type so the assertion is unnecessary.
- **Neden bu sıra:** Low + confidence 2; type-hygiene only, no behavior change.

#### #76 · 🟡 2/3 · ActivityIndicator color hardcoded as #fff instead of Roomie.onAccent
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 2, 3
- **Yer:** `src/features/money/money-screen.tsx:265 (also household.tsx:302; auth-screen.tsx:217)`
- **Ne:** Cross-dimension merge of clean-code (c2/c3) and rn-expo 'ActivityIndicator #fff' (c1). ActivityIndicator color='#fff' is hardcoded in money-screen, household, and auth-screen while the theme defines Roomie.onAccent for on-accent foreground.
- **Etki:** If onAccent/theme changes (dark mode or a lighter button), these spinners stay white and won't follow the theme.
- **Fix:** Replace color='#fff' with color={Roomie.onAccent} in money-screen:265, household.tsx:302, auth-screen.tsx:217.
- **Neden bu sıra:** Low + confidence 2 (merged); theming consistency on in-button spinners.

#### #77 · 🟡 2/3 · settleLabel uses inline fontWeight '600' instead of RoomieFonts font family
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2
- **Yer:** `src/features/money/money-screen.tsx:403`
- **Ne:** settleLabel is styled with fontWeight:'600' while the rest of the codebase sets weight via RoomieFonts font-family constants. (Also captured within the rank-40 money-styles cluster; recorded here as the typography-specific clean-code record.)
- **Etki:** Breaks the theme's font abstraction; on custom-font platforms a raw fontWeight can render a different system face than RoomieFonts, causing inconsistent typography.
- **Fix:** Replace fontWeight:'600' with fontFamily: RoomieFonts.bodySemi (or bodyBold).
- **Neden bu sıra:** Low + confidence 2; typography-token consistency, overlaps rank 40.

#### #78 · 🟡 2/3 · Magic number 999 borderRadius for pill shape without named constant
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2
- **Yer:** `src/features/tasks/tasks-screen.tsx:427 (also money-screen.tsx:366)`
- **Ne:** borderRadius:999 forces a fully-rounded pill on tasks turnPill and money chip. The intent isn't self-documenting from the literal, and it's duplicated.
- **Etki:** Low: a harmless idiom, but undocumented and duplicated, so the pill-radius decision isn't captured in one place.
- **Fix:** Define a named constant (e.g. PILL_BORDER_RADIUS = 999 in theme.ts) and reuse it, or add an inline comment.
- **Neden bu sıra:** Low + confidence 2; pure readability/maintainability nit.

#### #79 · 🟡 2/3 · Inconsistent nameById construction pattern across the three screens
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2
- **Yer:** `src/features/money/money-screen.tsx:82-90 (cf. tasks-screen.tsx, kitchen-screen.tsx)`
- **Ne:** Each screen builds the userId→name lookup differently: money builds an intermediate members array then Object.fromEntries; tasks builds orderedMembers then nameById; kitchen inlines it. money-screen's intermediate members array is largely discarded after building nameById.
- **Etki:** Three divergent patterns for the same operation raise cognitive load; a reader must trace different logic per screen.
- **Fix:** Standardize one helper/pattern for building nameById from household.memberships and reuse it across all three screens (build nameById directly).
- **Neden bu sıra:** Low + confidence 2; consistency/maintainability nit across screens.

#### #80 · 🔘 1/3 · Caught exception cast to GroqHttpError and mutated (groq.ts non-OK response)
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 3
- **Yer:** `workers/brain/src/groq.ts:114`
- **Ne:** `const err = new Error(...) as GroqHttpError; err.status = res.status;` — a plain Error cast to GroqHttpError then assigned .status. TS permits it but the construct-then-mutate-after-cast is fragile; if GroqHttpError gains required fields the cast won't catch them. Distinct from cloudflare-ai.ts:62 (different file, raised on a non-OK HTTP response).
- **Etki:** Low — correct today, but the pattern decouples the cast from the actual shape, so a future GroqHttpError change could pass typecheck while producing an incomplete error.
- **Fix:** Build with the correct shape in one expression: `Object.assign(new Error(...), { status: res.status }) as GroqHttpError`.
- **Neden bu sıra:** Low + confidence 1; type-hygiene only.

#### #81 · 🔘 1/3 · Cast after `in` narrowing of unknown fragment in schema dropped-target check
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 2
- **Yer:** `workers/brain/src/schema.ts:79`
- **Ne:** `const t = (f as { target?: unknown })?.target;` — f is unknown (from z.array(z.unknown())) and is cast to read .target. Optional chaining guards null/undefined but the cast asserts an unverified shape.
- **Etki:** Low — used only for `t === 'expense'`, so a non-matching value leaves the flag false. No crash, but the cast hides that f was never confirmed to be an object.
- **Fix:** Guard explicitly: `const t = (typeof f === 'object' && f !== null && 'target' in f) ? (f as { target?: unknown }).target : undefined;`
- **Neden bu sıra:** Low + confidence 1; type-hygiene only.

#### #82 · 🔘 1/3 · Cast after `in` narrowing in eur() metadata helper
- **Boyut:** TypeScript type safety (`typescript-safety`) · **Turlar:** 3
- **Yer:** `src/features/activity/activity.ts:31`
- **Ne:** In eur(), after `typeof metadata === 'object' && 'amountCents' in metadata`, the code still casts `(metadata as { amountCents?: unknown }).amountCents` instead of relying on narrowing. metaString() uses the same pattern.
- **Etki:** Low — functionally correct (Number + isFinite handle bad values), but the cast adds noise and could hide a bug if the guard changes without updating the cast.
- **Fix:** Let narrowing carry the type, or type the metadata parameter precisely at the call site.
- **Neden bu sıra:** Low + confidence 1; type-hygiene only.

#### #83 · 🟡 2/3 · Groq upstream response is type-cast without schema validation; malformed choice can propagate to parseDraft
- **Boyut:** API request/response validation (`api-validation`) · **Turlar:** 1, 2
- **Yer:** `workers/brain/src/groq.ts:119-139`
- **Ne:** The Groq body is consumed with a cast `as { choices?: GroqChoice[]; usage?: GroqUsage }`. A guard exists for a missing first choice, but a malformed choice (message absent, content non-string) is returned as-is; the caller does parseDraft(choice.message.content ?? ''), and JSON.parse('') throws. Both malformed and empty cases are caught by classify()'s try/catch and fall through to the Cloudflare AI tier, so user impact is contained.
- **Etki:** Low: error handling and the Cloudflare fallback absorb a malformed/empty Groq response, so users still get a draft. Cost is a wasted upstream request and reliance on a downstream throw rather than validating at receipt.
- **Fix:** Validate the Groq response with zod at receipt; optionally make the empty-content case explicit in index.ts instead of leaning on `?? ''`.
- **Neden bu sıra:** Low + confidence 2; contained by existing fallback, a best-practice validation gap.

#### #88 · 🟢 **3/3** · Index-as-key in ephemeral acknowledgement messages list
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/brain/brain-input.tsx:159`
- **Ne:** ack.map((line, i) => <Text key={i}>{line}</Text>) keys plain ack strings by index. These are immutable text-only items appended sequentially, shown briefly while phase==='done' and then cleared; no internal state.
- **Etki:** Minimal in practice — stateless strings shown momentarily, never reordered or filtered. Still an anti-pattern that becomes a latent bug if ack ever becomes mutable.
- **Fix:** Key by a stable identifier (cheapest key={`${i}-${line}`}; cleaner: model ack as {id, message} and key by id).
- **Neden bu sıra:** Low + confidence 3; benign index-key on ephemeral text. High confidence but genuinely low impact.

#### #89 · 🔘 1/3 · money-screen participantIds default creates a new array reference every render
- **Boyut:** State management patterns (`state-management`) · **Turlar:** 2
- **Yer:** `src/features/money/money-screen.tsx:111`
- **Ne:** `const participantIds = pickedIds ?? members.map((m) => m.userId);` — when pickedIds is null (the default), members.map allocates a fresh array every render. Consumed by the split-chip render and at submit; unmemoized.
- **Etki:** Minor referential-stability nit: each render produces a new participantIds reference, so any memoized child relying on shallow equality re-renders. Negligible for small member lists.
- **Fix:** Memoize: `const participantIds = useMemo(() => pickedIds ?? members.map(...), [pickedIds, members]);`.
- **Neden bu sıra:** Low + confidence 1; micro-perf only.

#### #90 · 🔘 1/3 · Inline object/style literals created every render in Collapsible
- **Boyut:** React render performance (`react-perf`) · **Turlar:** 2
- **Yer:** `src/components/ui/collapsible.tsx:23`
- **Ne:** SymbolView receives a fresh name object literal on every render and a fresh transform style object. New allocations each render.
- **Etki:** Negligible runtime cost, but the new identities defeat React.memo/prop-equality if SymbolView or Collapsible is ever memoized, and add minor GC pressure.
- **Fix:** Hoist the constant name object to module scope; predefine two StyleSheet entries (rotateOpen/rotateClosed) and select by isOpen.
- **Neden bu sıra:** Low + confidence 1; micro-perf/allocation nit.

#### #91 · 🟢 **3/3** · Unused View import in auth-screen.tsx
- **Boyut:** Dead code & lint debt (`lint-deadcode`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/auth/auth-screen.tsx:21`
- **Ne:** Cross-dimension merge of lint-deadcode (c3) and rn-expo (c1). View is imported from 'react-native' but never rendered (only KeyboardAvoidingView and SafeAreaView are used). Dead import, matching the known baseline lint warning.
- **Etki:** Lint debt; negligible bundle impact since tree-shaking typically removes it. No functional effect.
- **Fix:** Remove View from the react-native import on line 21.
- **Neden bu sıra:** Low + confidence 3 (merged); a confirmed standing lint warning, trivial fix.

#### #92 · 🟡 2/3 · Unused styles/props/exports dead code (container style, ThemedView props, Fonts.*, BottomTabInset)
- **Boyut:** Dead code & lint debt (`lint-deadcode`) · **Turlar:** 1, 2, 3
- **Yer:** `src/components/animated-icon.web.tsx:76-82; themed-view.tsx:12; constants/theme.ts:55-78,90`
- **Ne:** Cluster of confirmed dead code: the `container` style in animated-icon.web.tsx StyleSheet is never referenced (c2); lightColor/darkColor props in ThemedView are declared/destructured but never read (c2); Fonts.sans/serif/rounded are exported but only mono is consumed (c1); BottomTabInset is exported but never imported (c1). All template/leftover surface.
- **Etki:** Dead code and misleading public APIs (ThemedView advertises capabilities it doesn't implement, Fonts exposes unwired tokens). No runtime effect.
- **Fix:** Remove the unused container style, the lightColor/darkColor props from ThemedViewProps and the destructure, the sans/serif/rounded Font keys (keep mono), and the BottomTabInset export — or keep deliberately as documented future tokens.
- **Neden bu sıra:** Low + confidence 2 (cluster); harmless dead code, batched as cleanup.

#### #93 · 🔘 1/3 · Repeated lookup/fallback, capitalization, shadow, spacing, and magic-number maintainability nits
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/tasks/tasks-screen.tsx:229,264,409-413,380; money-screen.tsx:195,279-280; activity.ts:89; household.tsx:236; brain-input.tsx:198; auth-screen.tsx:258; kitchen-screen.tsx:358,380`
- **Ne:** Cluster of low clean-code nits: the nameById[id ?? ''] ?? fallback lookup lacks a shared getDisplayName helper (c1); fallback-name capitalization is inconsistent ('someone' vs 'Someone') across call sites (c1); the accent-button shadow block (shadowOpacity 0.25 etc.) is duplicated across ~6 components (c1); container gap values differ (12/14/16) with no shared spacing token (c1); the 1500ms copied-feedback timeout is a magic number (c1).
- **Etki:** Cognitive load and drift risk: ad-hoc lookups already produced the 'someone'/'Someone' inconsistency; shadow/spacing changes must be edited in many places; magic numbers aren't captured centrally.
- **Fix:** Add a getDisplayName(id, nameById, fallback='Someone') helper for consistent lookups/capitalization; extract a Roomie.buttonShadow constant and a Spacing.containerGap token in theme.ts; name the COPY_FEEDBACK_DURATION_MS constant.
- **Neden bu sıra:** Low + confidence 1 (cluster); maintainability polish, batched. The capitalization nit is the only user-visible one.

#### #94 · 🔘 1/3 · Long applyFragments() with repetitive per-fragment-type branching
- **Boyut:** Clean code & maintainability (`clean-code`) · **Turlar:** 3
- **Yer:** `src/features/brain/apply.ts:25-153`
- **Ne:** applyFragments (~129 lines) loops over fragments with four sequential if-blocks (expense / pantry ops / chore_done / personal_task), each following the same validation → transact → log → applied.push shape.
- **Etki:** Deep branching and copy-pasted structure reduce readability; adding a fragment type means duplicating the whole pattern, raising the chance of an inconsistent handler.
- **Fix:** Extract each branch into a dedicated async handler (handleExpense/handlePantry/handleChore/handleTask) and dispatch via a Map<target, handler>, keeping applyFragments to validation + dispatch + aggregation.
- **Neden bu sıra:** Low + confidence 1; a refactor that would also make the rank-24/62 atomicity fixes cleaner, but cosmetic on its own.

#### #95 · 🟡 2/3 · Test-coverage gaps and exhaustiveness on money/activity/types helpers (formatEur, nowMs, fragmentLine, multi-expense, simple-pair, describeEvent/timeAgo)
- **Boyut:** Test coverage & quality (`testing-gaps`) · **Turlar:** 1, 2, 3
- **Yer:** `src/features/money/money-logic.test.ts:14-100; src/features/money/money-logic.ts:66-72; src/features/brain/types.ts:32-47; src/features/activity/activity.ts:64-143`
- **Ne:** Cluster of lower-severity coverage gaps: activity.ts describeEvent/timeAgo have no test (c3, but medium dimension severity, low here for the residual edge cases) — missing/null metadata and timeAgo edge times (negative/future, 0/44/45/59s, invalid ISO) are unverified, and timeAgo returns 'just now' for future seconds and NaN; fragmentLine has no exhaustive default/final return so a malformed target returns undefined (c1); formatEur/nowMs are untested (c1); computeNetCents is never tested with multiple expenses in one call so compounding remainder pennies are unverified (c1); simplifyDebts lacks the simplest two-party exact-pair test (c1).
- **Etki:** Edge-case money/activity rendering and the validation salvage paths are unverified: currency could mis-format for €0.01/negatives/large totals, a malformed fragment renders literal 'undefined', corrupted timestamps silently show 'just now', and a future refactor could break the single-pair debt case or drift the ledger by a penny across multiple expenses unnoticed.
- **Fix:** Add activity.test.ts (describeEvent across all types with present/missing metadata; timeAgo full range + invalid/future, documenting the NaN/future → 'just now' behavior); add a default/exhaustiveness guard + test to fragmentLine; add formatEur cases (0/1/negative/large) and a nowMs assertion; add a multi-expense computeNetCents test asserting sum-to-zero; add the simplifyDebts {a:500,b:-500} pair test.
- **Neden bu sıra:** Low + confidence 2 (cluster); coverage polish on already-mostly-tested helpers. Batched as the final test-hardening pass. Note the timeAgo NaN/future masking overlaps the rank-65-area error-handling theme but is captured here as a test gap.

---

## Ek: boyut başına uzlaştırılmış bulgu

| Boyut | Uzlaştırılmış | 🟢3/3 | 🟡2/3 | 🔘1/3 |
|---|---|---|---|---|
| File structure & architecture | 3 | 1 | 0 | 2 |
| Reinvented wheels | 3 | 0 | 2 | 1 |
| React Native / Expo idioms | 9 | 1 | 2 | 6 |
| TypeScript type safety | 11 | 1 | 4 | 6 |
| Money debt/settlement math | 3 | 0 | 1 | 2 |
| Kitchen normalize/alias/aging | 2 | 0 | 0 | 2 |
| Tasks rotation fairness | 2 | 0 | 0 | 2 |
| Brain LLM apply pipeline | 7 | 1 | 2 | 4 |
| API request/response validation | 2 | 0 | 2 | 0 |
| Worker auth & abuse | 7 | 1 | 1 | 5 |
| InstantDB schema & permissions | 10 | 2 | 7 | 1 |
| React render performance | 7 | 3 | 0 | 4 |
| Error & edge handling | 9 | 1 | 2 | 6 |
| Async & race conditions | 9 | 3 | 3 | 3 |
| State management patterns | 5 | 0 | 0 | 5 |
| Secrets & config hygiene | 1 | 0 | 1 | 0 |
| Accessibility & i18n | 15 | 5 | 3 | 7 |
| Dead code & lint debt | 6 | 1 | 2 | 3 |
| Clean code & maintainability | 15 | 4 | 4 | 7 |
| Test coverage & quality | 12 | 6 | 0 | 6 |

_Toplam uzlaştırılmış (çapraz-eleme öncesi): 138 · Final (çapraz-eleme sonrası): 95_
