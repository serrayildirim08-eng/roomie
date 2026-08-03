# Pantry redesign — direction

**Date:** 2026-07-03
**Trigger:** Serra: the pantry "biraz karışık, düzenlemek lazım" (feels messy, needs tidying).
**Status:** DESIGN PROPOSAL ONLY. No app code touched. Serra signs off before we build.

Mock: `./mock.html` (open in a browser, ~390px phone width).

---

## 1. Why it feels messy today

Looking at the current `kitchen-screen.tsx`, the mess is real and has concrete causes:

1. **Everything is on one long scroll at once.** Add row, "Start shopping" button, Money-bridge
   card (when active), *full* Shopping list, *full* In-the-pantry list — all stacked. On a real
   house with 20+ items you scroll past a big to-buy block just to see what's in the cupboard.
   Two different jobs ("what do we need to grab" vs "what do we have") share one crowded column.

2. **Rows are cramped — up to 4 things fighting for one line.** An In-pantry row is
   `emoji · name · aging-dot · Out · ✕`. A Shopping row is `emoji · name · claim-button · ✕`.
   Small tap targets sit right next to a destructive ✕, so a mis-tap deletes the item. The
   secondary destructive action has the same visual weight as the primary one.

3. **The aging dot is unexplained.** A tiny gold dot appears next to a name with no label. A
   roommate has no idea it means "getting old" — it reads like decoration or a bug. The state
   machine behind it (fresh → faded → still-here → archive) is good; the *surface* wastes it.

4. **"Out" is ambiguous.** The button says "Out" — out of what? It actually means "we ran out,
   put it on the shopping list." New users read it as "remove/hide." The word does too much work.

5. **No order, no grouping.** Items are a flat A→Z list. The 2 things running low are buried
   alphabetically between fresh items, so the one signal that matters (what's low) is invisible
   at a glance — you have to hunt for faded ink.

6. **The Money bridge card shoves the lists down.** When it appears it pops in above both
   sections and reflows everything, adding to the "jumpy / busy" feeling.

---

## 2. Proposed layout — calmer, split, one job at a time

Keep the forest-green editorial hero and the white floating cards. Change the middle.

### A. Split the two jobs with a segmented control (recommended)
Directly under the hero, one pill segmented control: **To buy** · **In pantry**. You see *one*
list at a time, not both stacked. The hero title already leads with the shopping count, so
"To buy" is the natural default when something's needed; otherwise open on "In pantry."
- Alternative considered: keep both sections but collapse "In pantry" by default. Rejected —
  a segment is clearer and matches the app's tab language.

### B. Calmer rows — bigger targets, ONE primary action
Each row becomes a roomier tile:
- Emoji sits in a soft `sageSoft` rounded chip (same treatment as the grocery-scan mock), name
  on the first line, a quiet freshness/status caption on the second line ("still fresh",
  "getting low", "on the list").
- **One primary action per row**, right-aligned, clearly labelled:
  - To buy → **I'll get it** (or **Got it ✓** once it's yours; "…is getting it" when claimed).
  - In pantry → **Ran out** (renamed from "Out" — plain-language, no ambiguity; moves it to
    To buy).
- **Remove (✕) is demoted.** It leaves the main row and lives behind a swipe-left / long-press
  reveal (shown in the mock as a slid-open row). This kills the mis-tap-deletes problem and
  de-clutters every line. Delete keeps its existing confirm Alert.

### C. Light grouping by freshness (In pantry)
Inside "In pantry," a tiny sub-head splits **Running low** from **Well stocked**. Low items
float to the top where they belong. No counts-as-pressure — just "here's what needs attention,
here's the rest." Category grouping (Fridge / Cupboard) is an open question below.

### D. A freshness affordance that explains itself
Retire the bare dot. Replace with a small, labelled soft pill on the right of the row:
- fresh → no pill (silence = fine).
- faded → soft coral pill **"getting low"**.
- still_here_prompt → the existing inline **"Still need this?" Yes / Ran out** strip, unchanged
  logic, just calmer spacing.
This maps 1:1 onto the current `ageOf` states — no new states, no schema change.

### E. Quieter density
- Add row + "Start shopping" move into a compact top block; the big green "Start shopping"
  button keeps its drop-edge weight (it's the main verb) but the manual add row is smaller and
  secondary.
- Money bridge appears as a calm inline card *within* the To-buy context right after "Got it,"
  same copy and split logic — it no longer jumps the whole screen.

---

## 3. What STAYS (do not touch)

- **Claim / "I'll get it" / "Got it ✓"** flow and its activity logging — unchanged logic.
- **Money bridge** ("Add X to Money?", €, equal split among members) — same behavior, calmer placement.
- **The normalizer** (`resolveItem`) so "süt" and "milk" land on one row — untouched.
- **The aging state machine** (`aging.ts`, fresh/faded/still_here_prompt/should_archive at
  1.0/1.5/2.0× shelf life) — we only restyle its *surface*, no rule changes.
- **Purchase-log events** on restock (invisible cadence fuel) — unchanged.
- **No-shame tone:** no counts-as-guilt, no streaks, no "overdue/late." Aging stays a quiet
  nudge. Empty states stay warm.
- **Grocery scan** ("Start shopping") entry point — unchanged.

---

## 4. Open questions for Serra

1. **Default segment:** open on "To buy" when something's needed, else "In pantry"? Or always
   remember the last tab?
2. **Grouping axis:** group In-pantry by **freshness** (Running low / Well stocked, as mocked)
   or by **area** (Fridge / Cupboard / Freezer)? Area needs a per-item field we don't store yet
   — freshness is free today. Pick one; not both in v1.
3. **Remove gesture:** swipe-left to reveal Remove (iOS-native feel) vs long-press? Swipe is
   mocked.
4. **"Ran out" wording:** is "Ran out" the right rename for "Out," or do you prefer
   "Add to list"? Both remove the ambiguity; tone differs slightly.
5. **Aging pill copy:** "getting low" vs "getting old" vs "use soon" — which reads least like a
   scold?
