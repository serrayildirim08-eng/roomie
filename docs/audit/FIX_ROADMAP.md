# Roomie — Fix Roadmap (YAŞAYAN DOSYA)

_Kaynak denetim: 2026-06-14 · [AUDIT_REPORT.md](./AUDIT_REPORT.md) · 95 bulgu_

Bu dosya **düzelttikçe işaretlenir**. Her madde:
- ⬜ = yapılmadı · 🔶 = fix yazıldı ama doğrulanmadı (test/telefon) · ✅ = fix yazıldı **ve** doğrulandı
- Bir maddeyi ✅ yapmak için: kodu düzelt + (varsa) test ekle/güncelle + yeşil gör. Test/doğrulama yoksa ✅ yok.
- Detay (kanıt/etki/tam fix) için #rank ile [AUDIT_REPORT.md](./AUDIT_REPORT.md)'ye bak.

**Sıra:** P0 critical → P1 high → P2 medium → P3 low. Aynı kök nedene değen maddeler birlikte kapanır (aşağıdaki kümelere bak).

## Kök-neden kümeleri (önce bunları çöz, çoğu madde birlikte kapanır)

| Tema (boyut) | crit+high madde |
|---|---|
| InstantDB schema & permissions (`db-schema-perms`) | 9 |
| Test coverage & quality (`testing-gaps`) | 6 |
| Async & race conditions (`async-races`) | 4 |
| Worker auth & abuse (`worker-security`) | 3 |
| Error & edge handling (`error-handling`) | 3 |
| Money debt/settlement math (`money-correctness`) | 2 |
| TypeScript type safety (`typescript-safety`) | 2 |
| React render performance (`react-perf`) | 2 |
| Brain LLM apply pipeline (`brain-correctness`) | 2 |
| Accessibility & i18n (`accessibility-i18n`) | 2 |

> En yüksek kaldıraç: **InstantDB perms (T5)** ve **write-path guard/atomicity** — ikisi tek tek dosyada toplanıp birden çok critical/high'ı aynı anda kapatır.

## İlerleme

- P0 critical: 0/4 ✅
- P1 high: 0/31 ✅
- P2 medium: 0/38 ✅
- P3 low: 0/22 ✅

---

## P0 — 🔴 CRITICAL — 4 madde

- ⬜ **#1** 🟢3/3 — No InstantDB permission rules for any non-$users entity — all household data world-readable and world-writable to any authenticated user
  - `instant.perms.ts:15-21` · *InstantDB schema & permissions*
  - **Fix:** Add household-scoped allow rules to instant.perms.ts for every entity using a reusable template: view/create/update/delete = "auth.id in data.ref('household.memberships.user.id')". Tighten per entity: immutable audit logs (settlements/choreEvents/purchases/activityEvents: update:false, delete:false), owner-only personal tasks (auth.id == data.ref('owner.id')), owner-only membership role/status changes, members-only household view. choreEvents traverse via 'chore.household'. Push with `npx instant-cli@latest push perms`. This is T5 in docs/CHECKLIST.md and must land before the app opens beyond the test flat.
- ⬜ **#2** 🔘1/3 — Removed-member expenses silently lose money — computeNetCents drops the non-member payer's credit so the ledger stops summing to zero (and a test codifies the loss)
  - `src/features/money/money-logic.ts:25-34 (fed empty strings from money-screen.tsx:95,100-101)` · *Money debt/settlement math*
  - **Fix:** Before passing to computeNetCents, drop/repair rows referencing non-members instead of coercing nulls to '': filter expenses to current-member payers and settlements where both legs are members; OR make computeNetCents defensive — throw/flag when paidById∉net or a settlement leg∉net so 'net sums to 0' can never break silently; OR redistribute a departed payer's credit across remaining participants. Rewrite the test to assert balances sum to zero for the removed-user case.
- ⬜ **#3** 🔘1/3 — Client-side query filtering used as the security boundary instead of server-side rules
  - `src/features/money/money-screen.tsx:39-48 (same pattern in kitchen-screen.tsx, tasks-screen.tsx, activity-feed.tsx)` · *InstantDB schema & permissions*
  - **Fix:** Treat instant.perms.ts as the only real enforcement; once per-entity rules (rank 1) are added, keep client where-clauses purely as UX/perf. Add a regression test that issues an unscoped queryOnce as a non-member and asserts it returns nothing.
- ⬜ **#4** 🟡2/3 — expenses / settlements entities have no permission rules — cross-household financial read + tamper, breaks debt math
  - `instant.schema.ts:47-59 (expenses, settlements) / instant.perms.ts:15-21 (missing rule)` · *InstantDB schema & permissions*
  - **Fix:** expenses: view/create = "auth.id in data.ref('household.memberships.user.id')", update:false (audit trail), delete restricted to creator with recency guard or disallowed. settlements: same view/create, update:false, delete:false; allow correction only via a short recency window on fromUser.

## P1 — 🟠 HIGH — 31 madde

- ⬜ **#5** 🟢3/3 — Non-null assertion on EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY without runtime validation
  - `src/app/_layout.tsx:20` · *TypeScript type safety*
  - **Fix:** Read without the assertion and throw at module load: `const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY; if (!publishableKey) throw new Error('Missing required env var: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY...');`
- ⬜ **#6** 🟢3/3 — Rate limiter is per-isolate and global, not per-user — one leaked token bypasses or exhausts the household's daily cap
  - `workers/brain/src/index.ts:23-35,110` · *Worker auth & abuse*
  - **Fix:** Move limiting off per-isolate memory to a persistent globally-shared store keyed per userId (Cloudflare KV or Durable Objects). After verifyClerkJwt: `const n = await env.KV.get('rate-'+userId)`, gate on a per-user daily cap, `await env.KV.put('rate-'+userId, n+1, { expirationTtl: 86400 })`. Add a household-aggregate cap and a short burst limit (5/min/user). Wire the KV namespace in wrangler.toml.
- ⬜ **#7** 🟢3/3 — personalTasks have no permission rules — private to-do lists readable by anyone
  - `instant.schema.ts:98-102 + links 192-199 / instant.perms.ts:15-21` · *InstantDB schema & permissions*
  - **Fix:** At minimum create/update/delete = "auth.id == data.ref('owner.id')". For view, default to owner-only ("auth.id == data.ref('owner.id')") until the planned 'need a favor' feature ships, then widen to household-readable.
- ⬜ **#8** 🟢3/3 — Index-as-key in draft-fragment list coupled with index-keyed amountDraft — edited amount applied to wrong/deleted expense
  - `src/features/brain/brain-input.tsx:121` · *React render performance*
  - **Fix:** Add a stable id to each DraftFragment at creation (id()/uid when the worker response is set into state). Key the list by f.id, key amountDraft by that id (Record<string,string>), and read it by id in onConfirm instead of by index.
- ⬜ **#9** 🟢3/3 — Invalid edited expense amount silently reverts to original value with no feedback
  - `src/features/brain/brain-input.tsx:75-78` · *Brain LLM apply pipeline*
  - **Fix:** Distinguish 'no edit' (undefined) from 'invalid edit' (null). If any expense has amountDraft[idx] defined but parseAmountToCents returns null, disable Confirm and show an inline error, or report it under result.skipped. Use an explicit `cents !== null` check.
- ⬜ **#10** 🟢3/3 — Bare async db.transact handlers wired to onPress/onSubmitEditing with no error handling (Kitchen/Tasks/Money)
  - `src/features/kitchen/kitchen-screen.tsx:134,145,158,181,294,298,327; tasks-screen.tsx:130,151,164,168,172,235,242,294,304,309,330,355; money-screen.tsx:183,287` · *Error & edge handling*
  - **Fix:** Wrap each call in `void (async () => { try { await fn(...); } catch { Alert.alert('Error','Could not save. Try again.'); } })()` or a per-function try/catch with error/busy state (as money-screen onAdd already does). Move setDraft('') to AFTER the await succeeds; order logActivity after the primary transact and only on success.
- ⬜ **#11** 🟢3/3 — No double-submit guard or error handling on Settle — duplicate / silent debt settlements
  - `src/features/money/money-screen.tsx:183-197` · *Async & race conditions*
  - **Fix:** Mirror onAdd: track a per-debt pending key (fromId+toId+amountCents), set at start and clear in finally, disable the Settle button while pending, and wrap transact + logActivity in try/catch that surfaces an error.
- ⬜ **#12** 🟢3/3 — No double-submit guard or error handling on Kitchen 'I'll get it' (onClaim) — concurrent claims overwrite
  - `src/features/kitchen/kitchen-screen.tsx:145-156` · *Async & race conditions*
  - **Fix:** Track claiming item ids in pending state and disable the claim button while in flight; prefer a conditional/atomic write that only sets claimedBy when currently null so a concurrent loser is rejected. Wrap transact in try/catch with feedback.
- ⬜ **#13** 🟢3/3 — Brain chore matching uses order-dependent bidirectional substring matching — wrong chore marked done
  - `src/features/brain/apply.ts:120-123` · *Test coverage & quality*
  - **Fix:** Replace bidirectional substring with one-way matching (chore name must contain the spoken phrase), require meaningful length (>2 chars), rank exact > prefix > substring and pick the best, or use fuzzy matching with a threshold. Add tests against STARTER_CHORES/CHORE_LIBRARY covering exact, partial, ambiguous, no-match.
- ⬜ **#14** 🟢3/3 — Zero test coverage for kitchen normalize.ts (normalizeItemName, resolveItem, levenshtein, foldDiacritics, stripPlural)
  - `src/features/kitchen/normalize.ts` · *Test coverage & quality*
  - **Fix:** Add normalize.test.ts covering normalizeItemName (empty/whitespace, diacritics, plurals, exact/singular/prefix aliases, multi-word, edit-distance hits, unknown fallback), resolveItem, and levenshtein edge cases.
- ⬜ **#15** 🟢3/3 — Zero test coverage for kitchen aging.ts ageOf() state machine
  - `src/features/kitchen/aging.ts:41-54` · *Test coverage & quality*
  - **Fix:** Add aging.test.ts exercising exact boundaries (1.0x/1.5x/2.0x), the null/non-finite/≤0 guards, and negative-elapsed clock-skew. Optionally add explicit `if (elapsedDays < 0) return 'fresh'` with a comment.
- ⬜ **#16** 🟢3/3 — Zero test coverage for brain apply.ts applyFragments() DB writer
  - `src/features/brain/apply.ts` · *Test coverage & quality*
  - **Fix:** Add apply.test.ts with mocked InstantDB and logActivity. Test each target (expense amount+participants, pantry new-vs-merge, pantry_out, shopping_add, chore_done match+advancement, personal_task) and the empty-orderedMembers edge, asserting the exact db calls.
- ⬜ **#17** 🟢3/3 — Zero test coverage for worker schema.ts parseDraft() validation boundary
  - `workers/brain/src/schema.ts:67-90` · *Test coverage & quality*
  - **Fix:** Add workers/brain/src/schema.test.ts (vitest) covering valid draft, malformed JSON (throws), fragments missing required fields (dropped+counted), mixed valid/invalid, the 8-fragment cap, amountless-expense auto-question generation, and preservation of an existing question.
- ⬜ **#18** 🟢3/3 — Interactive Pressables (settle, pass, done, claim, chips, auth, brain) lack accessibilityLabel/Role
  - `src/features/money/money-screen.tsx:223-290; tasks-screen.tsx:233-245; kitchen-screen.tsx:294-327; auth-screen.tsx:212-226; brain-input.tsx:109-148; household.tsx` · *Accessibility & i18n*
  - **Fix:** Add accessibilityRole='button' (or 'radio'/'checkbox' with accessibilityState={{selected}} for chips, 'switch' for toggles) plus a context-rich accessibilityLabel to every interactive Pressable (e.g. settle → `Settle debt ${amount}`, claim → `I'll get ${it.name}`).
- ⬜ **#19** 🟡2/3 — Caught exception cast to GroqHttpError/Error without type narrowing in draft fallback
  - `workers/brain/src/index.ts:70` · *TypeScript type safety*
  - **Fix:** Narrow before access: `const err = e instanceof Error ? e : new Error(String(e)); const status = (err as GroqHttpError).status;` and read `err.message?.slice(0,200)` from the narrowed value.
- ⬜ **#20** 🟡2/3 — Settlement activity log attributes the wrong actor — always logs the debtor (fromId) regardless of who clicked Settle
  - `src/features/money/money-screen.tsx:190-196 (button at :287)` · *Money debt/settlement math*
  - **Fix:** Add an actorId parameter: `onSettle(fromId, toId, amountCents, actorId)`, use actorId in logActivity, and pass userId from the button. Optionally restrict Settle to the debtor (youPay===true) if only debtors should record payments.
- ⬜ **#21** 🟡2/3 — Confirm button not disabled during apply + apply itself non-idempotent on retry — duplicate writes
  - `src/features/brain/brain-input.tsx:146 (button) + apply.ts:53-150 (loop)` · *Brain LLM apply pipeline*
  - **Fix:** Immediate: add `disabled={phase === 'applying'}` to the Confirm Pressable. Structural: wrap all fragment writes in a single db.transact for atomicity and/or derive an idempotency key (draft hash) so a repeated apply skips already-written fragments; on error clear fragments or move to a non-recoverable state.
- ⬜ **#22** 🟡2/3 — CORS wildcard origin combined with Authorization header allows any site to send authed cross-origin requests
  - `workers/brain/src/index.ts:37-41` · *Worker auth & abuse*
  - **Fix:** Replace the wildcard with an explicit allow-list and echo back only matched origins. Don't advertise 'authorization' under allow-headers for a wildcard origin. Prefer a custom auth header (forces preflight) or pinned-origin cookies.
- ⬜ **#23** 🔘1/3 — Rate-limit counter increments BEFORE body validation — invalid requests still consume quota
  - `workers/brain/src/index.ts:110` · *Worker auth & abuse*
  - **Fix:** Move the overCap() increment to AFTER body validation so a request only consumes quota once it has valid text bound for classify(). Combine with the per-user KV counter (rank 6).
- ⬜ **#24** 🟡2/3 — applyFragments writes are non-atomic; logActivity rejections abort whole fragment / leave partial writes
  - `src/features/brain/apply.ts:57,62,75,83,101,106,108,130,134,140,144` · *Error & edge handling*
  - **Fix:** Wrap each transact in its own try/catch, collect failures into skipped[], let every fragment attempt independently, and return the partial ApplyResult. Make logActivity fire-and-forget so an audit-log failure never discards a committed data write; batch a fragment's related writes into one transact where possible.
- ⬜ **#25** 🟡2/3 — Chore rotation race + stale closure — anyone can advance from a render-time snapshot, skipping a turn
  - `src/features/tasks/tasks-screen.tsx:172-194` · *Async & race conditions*
  - **Fix:** Re-read the chore's current turn (and active memberIds) server-side inside advance before computing next; use optimistic-locking/conditional update with retry to serialize concurrent advances and make it idempotent for the same logical turn. Wrap transact+log in try/catch and disable Done/Pass while pending.
- ⬜ **#26** 🟡2/3 — No error handling / premature input-clear across kitchen, tasks, brain async writes (silent failures, lost input)
  - `src/features/kitchen/kitchen-screen.tsx:93-212; tasks-screen.tsx:114-194` · *Async & race conditions*
  - **Fix:** Wrap each transact(+log) in try/catch; only clear the input inside the try after success; surface an error and busy/disabled state, matching money-screen onAdd. onMineDelete should tolerate an already-deleted row.
- ⬜ **#27** 🟡2/3 — Unhandled rejection in Alert-confirmed delete/leave callbacks (void async IIFE has no catch)
  - `src/features/money/money-screen.tsx:168-177 (also kitchen-screen.tsx:221-230, tasks-screen.tsx:203-212, household.tsx:246-254)` · *Error & edge handling*
  - **Fix:** Wrap each IIFE body in try/catch and surface an error. Order writes so the log only fires after the primary mutation succeeds, and consider batching delete+log into one transact for atomicity. Fix onLeave to log against the real household id.
- ⬜ **#28** 🟡2/3 — TextInputs rely on placeholder only; no accessibilityLabel for screen readers
  - `src/features/auth/auth-screen.tsx:119-172; money-screen.tsx:206-220; kitchen-screen.tsx:242-268; tasks-screen.tsx:285-332` · *Accessibility & i18n*
  - **Fix:** Add a descriptive accessibilityLabel to every TextInput independent of the placeholder (e.g. 'Enter the 6-digit verification code', 'Expense amount in euros'); consider accessibilityHint for required/optional.
- ⬜ **#29** 🔘1/3 — applyFragments turn fallback links to userId even when userId is not an active member
  - `src/features/brain/apply.ts:128-131` · *Test coverage & quality*
  - **Fix:** Validate userId is in orderedMembers before applyFragments (return early with a skipped reason if not), and ensure `next` resolves to a valid member id before linking rather than blindly falling back to userId.
- ⬜ **#30** 🟡2/3 — chores and choreEvents have no permission rules — cross-household rotation tampering + forged effort history
  - `instant.schema.ts:83-94 / instant.perms.ts:15-21` · *InstantDB schema & permissions*
  - **Fix:** chores: view/create/update/delete = "auth.id in data.ref('household.memberships.user.id')". choreEvents (traverse the chore): view/create = "auth.id in data.ref('chore.household.memberships.user.id')", delete:false (append-only).
- ⬜ **#31** 🟡2/3 — pantryItems and purchases have no permission rules — cross-household kitchen read/tamper + corrupted prediction log
  - `instant.schema.ts:63-79 / instant.perms.ts:15-21` · *InstantDB schema & permissions*
  - **Fix:** pantryItems: view/create/update/delete = household-member scope. purchases: view/create = household-member scope, update:false, delete:false (immutable audit log).
- ⬜ **#32** 🟡2/3 — activityEvents (and profiles) have no permission rules — world-readable + forgeable audit trail; any user can edit any profile
  - `instant.schema.ts:40-44 (activityEvents), 19-23 (profiles) / instant.perms.ts:15-21` · *InstantDB schema & permissions*
  - **Fix:** activityEvents: view = household-member scope, create = "auth.id == data.ref('actor.id')", update:false, delete:false. profiles: view public, update = "auth.id == data.ref('$user.id')" (owner-only), create system-managed.
- ⬜ **#33** 🟡2/3 — households entity has no permission rules — enumeration, metadata tampering, no creation guard
  - `instant.schema.ts:26-29 / instant.perms.ts:15-21 / household.tsx:170-181` · *InstantDB schema & permissions*
  - **Fix:** households: view = "auth.id in data.ref('memberships.user.id')", update restricted to members/owner, delete owner-only, gate create. Design the rule so legitimate code-based joining still works (narrow lookup path) while blocking enumeration.
- ⬜ **#34** 🟡2/3 — memberships entity has no permission rules — self-join any household, self-escalate to owner, alter other members
  - `instant.schema.ts:32-37 / instant.perms.ts:15-21 / household.tsx:177-182` · *InstantDB schema & permissions*
  - **Fix:** memberships: view = household-member or self; restrict update/delete (role/status, removal) to existing owners; for create, enforce the new membership's user is the authed actor and add an invite-token/owner-approval guard so a leaked ID alone can't grant entry.
- ⬜ **#87** 🟢3/3 — Index-as-key in derived debts list
  - `src/features/money/money-screen.tsx:282` · *React render performance*
  - **Fix:** Derive a stable key from the debt relationship, e.g. key={`${d.fromId}-${d.toId}-${d.amountCents}`}, or carry an id through simplifyDebts.

## P2 — 🟡 MEDIUM — 38 madde

- ⬜ **#35** 🔘1/3 — stripPlural mangles already-singular words ending in vowel+s (e.g. 'cheeses' -> 'chees')
  - `src/features/kitchen/normalize.ts:43` · *Kitchen normalize/alias/aging*
  - **Fix:** Tighten the regex so it doesn't over-match bases ending in 'e': handle the 'vowel...e + s' family by stripping only trailing 's', restrict [^aeiou]es to true sibilant patterns (x/s/z/sh/ch).
- ⬜ **#36** 🔘1/3 — Unconditional unlink with empty-string claimedBy id when reviving an unclaimed item
  - `src/features/kitchen/kitchen-screen.tsx:106` · *Kitchen normalize/alias/aging*
  - **Fix:** Only chain .unlink when existing.claimedBy?.id is truthy; otherwise just .update({ status:'in', ...
- ⬜ **#37** 🔘1/3 — Departed member's name lost in chore history (active-only membership query)
  - `src/features/tasks/tasks-screen.tsx:264` · *Tasks rotation fairness*
  - **Fix:** Snapshot the doer's display name onto the choreEvent at creation (store byName in advance()), so history never depends on the member staying active; or run a second name-lookup over all memberships purely for display.
- ⬜ **#38** 🟢3/3 — Hardcoded colors in money.tsx tab guard instead of Roomie theme constants
  - `src/app/money.tsx:12-14` · *React Native / Expo idioms*
  - **Fix:** Replace backgroundColor:'#fff' with Roomie.canvas and color:'#9b9b9b' with Roomie.sub, matching tasks.tsx and kitchen.tsx, and add the theme import.
- ⬜ **#39** 🟢3/3 — Hardcoded #9b9b9b placeholder color across auth, money, household (not themed; low contrast)
  - `src/features/auth/auth-screen.tsx:122,147,157,168; money-screen.tsx:209,216; household.tsx:145,203` · *Accessibility & i18n*
  - **Fix:** Define a dedicated themed placeholder color in theme.ts (e.g.
- ⬜ **#40** 🟢3/3 — Hardcoded colors in money-screen styles (#9b9b9b, #c0392b, #fff) bypass theme
  - `src/features/money/money-screen.tsx:403,406,408,409` · *Accessibility & i18n*
  - **Fix:** Replace '#fff'→Roomie.onAccent, '#9b9b9b'→a darker themed secondary color, both '#c0392b'→Roomie.danger, and settleLabel fontWeight '600'→fontFamily RoomieFonts.bodyBold.
- ⬜ **#41** 🔘1/3 — Amount draft display inconsistency hides the silent-revert failure
  - `src/features/brain/brain-input.tsx:121-130` · *Brain LLM apply pipeline*
  - **Fix:** Make the displayed amount reflect the in-progress edit: show amountDraft[idx] when defined (e.g.
- ⬜ **#42** 🟡2/3 — Apply failure shows brain-parse error copy and drops the error detail (onConfirm catch omits setErrorDetail)
  - `src/features/brain/brain-input.tsx:89-91 (catch) + 166-170 (error UI)` · *Brain LLM apply pipeline*
  - **Fix:** Capture the error in the apply catch (`catch (e) { setErrorDetail((e as Error)?.message ??
- ⬜ **#43** 🔘1/3 — shopping_add fragments logged as 'pantry_out', conflating 'we need X' with 'X ran out'
  - `src/features/brain/apply.ts:72,107-108` · *Brain LLM apply pipeline*
  - **Fix:** Add a distinct activity type (shopping_needed) to the ActivityType union with its own describeEvent line and log it for shopping_add; or disambiguate via metadata.
- ⬜ **#44** 🟡2/3 — Brain draft API response is type-cast without runtime validation, risking a feature-blocking crash
  - `src/features/brain/brain-input.tsx:58-62` · *API request/response validation*
  - **Fix:** Validate the response with zod at the client boundary (mirror the worker contract): `const validated = draftResponseSchema.safeParse(body)` with an explicit error branch, then read validated.fragments/question.
- ⬜ **#45** 🟡2/3 — CLERK_SECRET_KEY (server secret) present in client-side .env.local
  - `.env.local:2` · *Secrets & config hygiene*
  - **Fix:** Remove the CLERK_SECRET_KEY line — the client needs only EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.
- ⬜ **#46** 🟡2/3 — Caught exception cast to Error in brain-input error handler
  - `src/features/brain/brain-input.tsx:68` · *TypeScript type safety*
  - **Fix:** Use a type guard: `const msg = e instanceof Error ?
- ⬜ **#47** 🟡2/3 — Caught exception cast to Error and re-cast to CfAiError with property mutation
  - `workers/brain/src/cloudflare-ai.ts:62` · *TypeScript type safety*
  - **Fix:** Extract the message safely and build the typed error in one shot: `const msg = e instanceof Error ?
- ⬜ **#48** 🔘1/3 — applyFragments creates expense with empty participants when no active members
  - `src/features/brain/apply.ts:45-60` · *Error & edge handling*
  - **Fix:** Guard the expense branch: if orderedMembers.length === 0, push a skipped[] note and continue instead of writing an unsplittable expense.
- ⬜ **#49** 🔘1/3 — applyFragments assumes nested query arrays (memberships/pantryItems/chores) are defined
  - `src/features/brain/apply.ts:45,69,120` · *Error & edge handling*
  - **Fix:** Default the accessors: `(household.memberships ??
- ⬜ **#50** 🟢3/3 — Stale household/pantry snapshot allows duplicate pantry items (kitchen onAdd + brain applyFragments)
  - `src/features/kitchen/kitchen-screen.tsx:88-124 (also brain apply.ts:34,69)` · *Async & race conditions*
  - **Fix:** Perform the existence check at write time: re-query the pantry inside onAdd / per-fragment immediately before the transact, or enforce a unique (household, normalizedName) constraint and handle conflict, or fold dedup into an atomic conditional write.
- ⬜ **#51** 🟢3/3 — Hardcoded #9b9b9b placeholderTextColor instead of Roomie.sub across multiple screens
  - `src/features/money/money-screen.tsx:209,216 (also household.tsx:145,203; auth-screen.tsx:122,147,157,168)` · *Clean code & maintainability*
  - **Fix:** Replace '#9b9b9b' with {Roomie.sub} (or the new Roomie.placeholder from rank 39) in money-screen, household.tsx, and auth-screen.
- ⬜ **#52** 🟡2/3 — Small action/delete buttons fall below 44x44pt touch-target minimum
  - `src/features/tasks/tasks-screen.tsx:442-453; money-screen.tsx; kitchen-screen.tsx:425-444` · *Accessibility & i18n*
  - **Fix:** Raise targets to >=44pt via minHeight/minWidth:44 or paddingVertical:12+, or hitSlop>=18 where keeping the compact size.
- ⬜ **#53** 🟢3/3 — No i18n/localization infrastructure; all UI strings hardcoded in English
  - `src/features/money/money-screen.tsx:274; tasks-screen.tsx:335; kitchen-screen.tsx:317; auth-screen.tsx:59,117; src/app/index.tsx:20,23,27` · *Accessibility & i18n*
  - **Fix:** Introduce an i18n layer (react-i18next or expo-localization + i18n-js), create locale JSON files, and replace hardcoded strings with keys, supporting EN plus the household's languages.
- ⬜ **#54** 🟢3/3 — No dynamic type / font scaling support (allowFontScaling, maxFontSizeMultiplier)
  - `src/constants/theme.ts; all screen style definitions` · *Accessibility & i18n*
  - **Fix:** Confirm allowFontScaling stays enabled and add maxFontSizeMultiplier (~1.5) to prevent overflow; consider bumping base sizes when large-text/screen-reader settings are active.
- ⬜ **#55** 🟡2/3 — Roomie.sub secondary text contrast borderline on canvas (labels, hints, activity feed)
  - `src/constants/theme.ts:18; activity-feed.tsx:41,60-62; auth-screen.tsx` · *Accessibility & i18n*
  - **Fix:** Darken Roomie.sub toward ~4.5:1, or reserve it strictly for non-critical hints and use Roomie.ink for body-level secondary text.
- ⬜ **#56** 🔘1/3 — Collapsible toggle lacks accessibilityRole/Label/Expanded state
  - `src/components/ui/collapsible.tsx:17-19` · *Accessibility & i18n*
  - **Fix:** Add accessibilityRole='button', accessibilityLabel={title}, accessibilityExpanded={isOpen}, and an accessibilityHint.
- ⬜ **#57** 🔘1/3 — Error messages lack accessibilityRole='alert' / live region
  - `src/features/auth/auth-screen.tsx:128,174; money-screen.tsx (error :409); kitchen/tasks screens` · *Accessibility & i18n*
  - **Fix:** Add accessibilityRole='alert' and accessibilityLiveRegion='assertive' to all error Text components.
- ⬜ **#58** 🔘1/3 — ActivityIndicator / loading states lack accessibility announcement
  - `src/features/brain/brain-input.tsx:110-111,154` · *Accessibility & i18n*
  - **Fix:** Add accessibilityLabel='Processing your request' and accessibilityLiveRegion='polite' to the ActivityIndicator (or announce via the triggering button's hint).
- ⬜ **#59** 🔘1/3 — Chore lookup uses order-dependent bidirectional substring matching (medium variant)
  - `src/features/brain/apply.ts:120-123` · *Brain LLM apply pipeline*
  - **Fix:** Rank candidates (exact > prefix > substring) and pick the best, or require exact/prefix match.
- ⬜ **#60** 🔘1/3 — Stale render-time timestamp `now` reused for all delayed kitchen writes
  - `src/features/kitchen/kitchen-screen.tsx:91` · *Async & race conditions*
  - **Fix:** Remove the render-scoped `const now = nowMs()` and call `const ts = nowMs()` at the top of onAdd; verify each async write uses a call-time timestamp.
- ⬜ **#61** 🔘1/3 — No double-submit guard on remaining kitchen/tasks action buttons (Out, Got it, Done, Delete, Suggestion add)
  - `src/features/kitchen/kitchen-screen.tsx:134-179` · *Async & race conditions*
  - **Fix:** Add per-action pending state (id-keyed) and disable each button while its async op is in flight.
- ⬜ **#62** 🟡2/3 — applyFragments processes brain fragments sequentially with no per-fragment error handling or partial-result reporting
  - `src/features/brain/apply.ts:53-152` · *Async & race conditions*
  - **Fix:** Wrap each fragment's transacts in try/catch, collect failures, let every fragment attempt independently, and return the partial ApplyResult; or batch all fragments into one multi-statement transact.
- ⬜ **#63** 🔘1/3 — BrainInput onConfirm catch block omits setErrorDetail, leaving a stale/empty error message
  - `src/features/brain/brain-input.tsx:89` · *State management patterns*
  - **Fix:** Capture and set the error in the onConfirm catch, and clear errorDetail at confirm-start.
- ⬜ **#64** 🔘1/3 — TOCTOU between household-existence check and membership creation in Join
  - `src/features/household/household.tsx:161-194` · *Async & race conditions*
  - **Fix:** Fold the existence assertion and the membership link into one transaction, or re-validate immediately before linking, or detect/clean up the orphaned membership when the link resolves against a missing household.
- ⬜ **#65** 🔘1/3 — InstantClerkBridge swallows auth-sync failures with only console.warn
  - `src/features/auth/instant-clerk-bridge.tsx:32-34` · *Error & edge handling*
  - **Fix:** Surface bridge state to the app root (context) and show a retry banner on failure; retry with exponential backoff instead of a single warn-only attempt.
- ⬜ **#67** 🟢3/3 — Generic utility functions misplaced in money-logic.ts, causing cross-feature coupling
  - `src/features/money/money-logic.ts:72-80` · *File structure & architecture*
  - **Fix:** Extract nowMs and parseAmountToCents into a feature-neutral module (e.g.
- ⬜ **#68** 🟢3/3 — emailName() helper defined identically in three screen files
  - `src/features/money/money-screen.tsx:33-36; kitchen-screen.tsx:35-38; tasks-screen.tsx:38-41` · *Clean code & maintainability*
  - **Fix:** Extract emailName() to a shared utility (e.g.
- ⬜ **#69** 🟢3/3 — Centered loading/error component duplicated identically across three screen files
  - `src/features/tasks/tasks-screen.tsx:369-375; money-screen.tsx:326-332; kitchen-screen.tsx:347-353` · *Clean code & maintainability*
  - **Fix:** Extract Centered to a shared component (src/components/centered.tsx) with self-contained safe/center styles and import it in all three screens.
- ⬜ **#70** 🔘1/3 — Duplicate emailName flagged as dead-code/lint debt
  - `src/features/tasks/tasks-screen.tsx:38; money-screen.tsx:33; kitchen-screen.tsx:35` · *Dead code & lint debt*
  - **Fix:** Extract to a shared module and import in all three screens (same fix as rank 68).
- ⬜ **#84** 🔘1/3 — Effect re-runs on every render due to unstable getToken dependency
  - `src/features/auth/instant-clerk-bridge.tsx:40` · *React render performance*
  - **Fix:** Drop getToken from the deps (rely on the existing user guard and read it lazily), or capture it via a ref so its identity doesn't drive re-runs.
- ⬜ **#85** 🔘1/3 — O(n) array.includes() in Split-between chip render loop (O(n^2) total)
  - `src/features/money/money-screen.tsx:242` · *React render performance*
  - **Fix:** Build a Set once before the map: `const participantSet = new Set(participantIds);` then participantSet.has(m.userId).
- ⬜ **#86** 🔘1/3 — setTimeout without cleanup can set state after unmount (HouseholdMember copy button)
  - `src/features/household/household.tsx:236` · *React render performance*
  - **Fix:** Move the reset into an effect tied to the copied flag and clear on cleanup: `useEffect(() => { if (!copied) return; const t = setTimeout(...); return () => clearTimeout(t); }, [copied])`.

## P3 — ⚪ LOW — 22 madde

- ⬜ **#66** 🔘1/3 — Brain applyFragments truthy guard would silently skip a zero-amount expense
  - `src/features/brain/apply.ts:56` · *Brain LLM apply pipeline*
  - **Fix:** Use an explicit `f.amountCents != null` presence check.
- ⬜ **#71** 🟡2/3 — EUR formatting duplicated across 4-5 files instead of using formatEur()
  - `src/features/money/money-logic.ts:66-68 (canonical); duplicated at activity.ts:34, brain/types.ts:35, brain/apply.ts:63, brain-input.tsx:127` · *Reinvented wheels*
  - **Fix:** Reuse formatEur in activity.ts, brain/types.ts, brain/apply.ts; for brain-input.tsx's bare-number default add a small centsToDecimal(cents) helper in money-logic so the division+rounding lives in one place.
- ⬜ **#72** 🔘1/3 — Web tab bar shows stale 'Expo Starter' scaffold branding
  - `src/components/app-tabs.web.tsx:65` · *File structure & architecture*
  - **Fix:** Replace 'Expo Starter' with 'Roomie', or remove the brand ThemedText if branding isn't needed in the web layout.
- ⬜ **#73** 🔘1/3 — Centered layout wrapper flagged under wheel-reinvention
  - `src/features/tasks/tasks-screen.tsx:369-375; money-screen.tsx:326-332; kitchen-screen.tsx:347-353` · *Reinvented wheels*
  - **Fix:** Extract Centered to a shared component with self-contained styles (same fix as rank 69).
- ⬜ **#74** 🟡2/3 — Invalid keyframe keypoint DURATION/1000 (0.3) in animated-icon.web.tsx glowKeyframe
  - `src/components/animated-icon.web.tsx:47` · *React Native / Expo idioms*
  - **Fix:** Replace [DURATION/1000] with a valid integer percentage expressing the intended timing (e.g.
- ⬜ **#75** 🟡2/3 — Redundant `as string` assertion on body.model in groq telemetry
  - `workers/brain/src/groq.ts:131` · *TypeScript type safety*
  - **Fix:** Drop the redundant cast once body is typed, or give body an explicit shape type so the assertion is unnecessary.
- ⬜ **#76** 🟡2/3 — ActivityIndicator color hardcoded as #fff instead of Roomie.onAccent
  - `src/features/money/money-screen.tsx:265 (also household.tsx:302; auth-screen.tsx:217)` · *Clean code & maintainability*
  - **Fix:** Replace color='#fff' with color={Roomie.onAccent} in money-screen:265, household.tsx:302, auth-screen.tsx:217.
- ⬜ **#77** 🟡2/3 — settleLabel uses inline fontWeight '600' instead of RoomieFonts font family
  - `src/features/money/money-screen.tsx:403` · *Clean code & maintainability*
  - **Fix:** Replace fontWeight:'600' with fontFamily: RoomieFonts.bodySemi (or bodyBold).
- ⬜ **#78** 🟡2/3 — Magic number 999 borderRadius for pill shape without named constant
  - `src/features/tasks/tasks-screen.tsx:427 (also money-screen.tsx:366)` · *Clean code & maintainability*
  - **Fix:** Define a named constant (e.g.
- ⬜ **#79** 🟡2/3 — Inconsistent nameById construction pattern across the three screens
  - `src/features/money/money-screen.tsx:82-90 (cf. tasks-screen.tsx, kitchen-screen.tsx)` · *Clean code & maintainability*
  - **Fix:** Standardize one helper/pattern for building nameById from household.memberships and reuse it across all three screens (build nameById directly).
- ⬜ **#80** 🔘1/3 — Caught exception cast to GroqHttpError and mutated (groq.ts non-OK response)
  - `workers/brain/src/groq.ts:114` · *TypeScript type safety*
  - **Fix:** Build with the correct shape in one expression: `Object.assign(new Error(...), { status: res.status }) as GroqHttpError`.
- ⬜ **#81** 🔘1/3 — Cast after `in` narrowing of unknown fragment in schema dropped-target check
  - `workers/brain/src/schema.ts:79` · *TypeScript type safety*
  - **Fix:** Guard explicitly: `const t = (typeof f === 'object' && f !== null && 'target' in f) ?
- ⬜ **#82** 🔘1/3 — Cast after `in` narrowing in eur() metadata helper
  - `src/features/activity/activity.ts:31` · *TypeScript type safety*
  - **Fix:** Let narrowing carry the type, or type the metadata parameter precisely at the call site.
- ⬜ **#83** 🟡2/3 — Groq upstream response is type-cast without schema validation; malformed choice can propagate to parseDraft
  - `workers/brain/src/groq.ts:119-139` · *API request/response validation*
  - **Fix:** Validate the Groq response with zod at receipt; optionally make the empty-content case explicit in index.ts instead of leaning on `??
- ⬜ **#88** 🟢3/3 — Index-as-key in ephemeral acknowledgement messages list
  - `src/features/brain/brain-input.tsx:159` · *React render performance*
  - **Fix:** Key by a stable identifier (cheapest key={`${i}-${line}`}; cleaner: model ack as {id, message} and key by id).
- ⬜ **#89** 🔘1/3 — money-screen participantIds default creates a new array reference every render
  - `src/features/money/money-screen.tsx:111` · *State management patterns*
  - **Fix:** Memoize: `const participantIds = useMemo(() => pickedIds ??
- ⬜ **#90** 🔘1/3 — Inline object/style literals created every render in Collapsible
  - `src/components/ui/collapsible.tsx:23` · *React render performance*
  - **Fix:** Hoist the constant name object to module scope; predefine two StyleSheet entries (rotateOpen/rotateClosed) and select by isOpen.
- ⬜ **#91** 🟢3/3 — Unused View import in auth-screen.tsx
  - `src/features/auth/auth-screen.tsx:21` · *Dead code & lint debt*
  - **Fix:** Remove View from the react-native import on line 21.
- ⬜ **#92** 🟡2/3 — Unused styles/props/exports dead code (container style, ThemedView props, Fonts.*, BottomTabInset)
  - `src/components/animated-icon.web.tsx:76-82; themed-view.tsx:12; constants/theme.ts:55-78,90` · *Dead code & lint debt*
  - **Fix:** Remove the unused container style, the lightColor/darkColor props from ThemedViewProps and the destructure, the sans/serif/rounded Font keys (keep mono), and the BottomTabInset export — or keep deliberately as documented future tokens.
- ⬜ **#93** 🔘1/3 — Repeated lookup/fallback, capitalization, shadow, spacing, and magic-number maintainability nits
  - `src/features/tasks/tasks-screen.tsx:229,264,409-413,380; money-screen.tsx:195,279-280; activity.ts:89; household.tsx:236; brain-input.tsx:198; auth-screen.tsx:258; kitchen-screen.tsx:358,380` · *Clean code & maintainability*
  - **Fix:** Add a getDisplayName(id, nameById, fallback='Someone') helper for consistent lookups/capitalization; extract a Roomie.buttonShadow constant and a Spacing.containerGap token in theme.ts; name the COPY_FEEDBACK_DURATION_MS constant.
- ⬜ **#94** 🔘1/3 — Long applyFragments() with repetitive per-fragment-type branching
  - `src/features/brain/apply.ts:25-153` · *Clean code & maintainability*
  - **Fix:** Extract each branch into a dedicated async handler (handleExpense/handlePantry/handleChore/handleTask) and dispatch via a Map<target, handler>, keeping applyFragments to validation + dispatch + aggregation.
- ⬜ **#95** 🟡2/3 — Test-coverage gaps and exhaustiveness on money/activity/types helpers (formatEur, nowMs, fragmentLine, multi-expense, simple-pair, describeEvent/timeAgo)
  - `src/features/money/money-logic.test.ts:14-100; src/features/money/money-logic.ts:66-72; src/features/brain/types.ts:32-47; src/features/activity/activity.ts:64-143` · *Test coverage & quality*
  - **Fix:** Add activity.test.ts (describeEvent across all types with present/missing metadata; timeAgo full range + invalid/future, documenting the NaN/future → 'just now' behavior); add a default/exhaustiveness guard + test to fragmentLine; add formatEur cases (0/1/negative/large) and a nowMs assertion; add a multi-expense computeNetCents test asserting sum-to-zero; add the simplifyDebts {a:500,b:-500} pair test.

---

_Not: medium/low için tek-cümle fix; tam adımlar AUDIT_REPORT.md'de #rank altında._
