# Roomie Improvement Roadmap — 2026-07-01

Source of decisions: the no-shame brief (borrow best mechanics from Tody/Sweepy/Nipto/OurHome/Splitwise) + a read-only code audit.

## Two findings that shaped this roadmap
1. **Grocery Scan is already built** (`src/features/kitchen/grocery-scan.tsx`, wired via Kitchen "🛒 Start shopping"). It is confirm-first and matches the PRD. → This is a **hardening** task, not a build.
2. **Chores have no schedule/time data** (`rotation.ts` is event-driven only; no `dueAt`/cadence/`area`). → Honest "due soon" / soft chore states need a small schema decision. **Deferred until after dogfood.**

## Guardrails (apply to every ticket)
- No schema changes. No new dependencies. No perms/security changes. No commits (Serra ships).
- Copy stays English, warm, no-shame, no-scoreboard, no-nagging.
- Confirm-first everywhere (Grocery Scan + Brain Dump stay confirm-first).
- Each work item owns **disjoint files** so parallel agents never collide.

---

## Wave 1 — Smallest Lovable bundle (no schema, before dogfood)

| # | Ticket | Files (owned, disjoint) | Risk |
|---|---|---|---|
| W1 | **Home Pulse v0** — calm "is our home okay?" card on Home | NEW `src/features/home/pulse.ts`, NEW `src/features/home/home-pulse.tsx`, NEW `src/features/home/pulse.test.ts`, EDIT `src/features/household/household.tsx` | Low |
| W2 | **Grocery Scan hardening** — fetch timeout + rename-in-review | EDIT `src/features/kitchen/grocery-scan.tsx`, EDIT `src/features/kitchen/barcode-lookup.ts` | Low |
| W3 | **Tasks polish** — calm completion copy + subtle done feedback (reanimated only) + fix stale "four classics" comment | EDIT `src/features/tasks/tasks-screen.tsx` | Low |
| W4 | **Kitchen polish** — calm completion/claim copy + subtle "Got it" feedback | EDIT `src/features/kitchen/kitchen-screen.tsx` | Low |
| W5 | **Money/Activity/Brain copy pass** — tone alignment, reinforce "nothing saves until you confirm" | EDIT `src/features/money/money-screen.tsx`, `src/features/activity/activity.ts`, `src/features/brain/brain-input.tsx` | Low |

**Verify (barrier):** `npm run typecheck && npm run lint && npm test` must stay green.

### Home Pulse v0 — spec
A card under the Home hero, 3–4 plain lines, no scores/colors-as-grades:
- Money: "Money is clear." / "Kai owes you €12.40." / "You owe Kai €8.00."
- Kitchen: "Pantry's stocked 🌿" / "2 things to grab next run." / "Someone's getting the milk."
- Chores: "All caught up 🌿" / "It's your turn for 1 thing."
- Today: "3 things got handled today." (empty home → "Home feels okay. 🌿")
Derive from existing pure fns: `computeNetCents`/`simplifyDebts` (money), `ageOf` (kitchen low), `effectiveTurn` (my turn), today's `activityEvents`. Pure `pulseSummary()` is unit-tested.

---

## Wave 2 — after one week of dogfood (mostly no schema)
- Kitchen: surface existing `still_here_prompt` aging state as a quiet "Still need this?".
- Low-Energy Wins: a "Tiny wins" row built from existing data.
- Money clarity line on Money screen.
- Starter templates by home type (preset picker at create).
- Neutral visibility copy ("Today at home" / "This week at home").

## Wave 3 — needs a schema decision (defer)
- Soft Chore States / "due soon" → light cadence or `dueAt` on chores.
- Room/Area grouping → optional flat `chores.area`.
- Effort size labels → optional `chores.effort`.
- Definition of Done → optional `chores.doneNote`.
- Snooze → needs a date field. Weekly Home Recap → a new surface.

---

## Do NOT build now
Unequal splits · receipt/price OCR · banking/payments · push (not needed for scan) · dark mode · AI feed summaries · leaderboards/points/badges/streaks · advanced profiles · B2B/multi-flat · landlord portal · roommate matching · heavy onboarding · full pantry inventory · complex room management · nutrition UI · auto scan→expense · auto-save without review.

## Launch safety gate (separate track — still open, blocks any real launch)
Push+verify InstantDB perms live · two-account stranger test · money-trust live (impersonation / removed-member balance / owner-eviction) · account deletion+export · remove `CLERK_SECRET_KEY` from app + rotate secrets · strip Expo-starter boilerplate · AI worker timeout · drop stale Vite/Supabase docs.
