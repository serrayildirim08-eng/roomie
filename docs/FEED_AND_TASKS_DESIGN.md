# Roomie — Activity Feed + Tasks Design

_Last updated: 9 June 2026. Design doc (not built yet beyond the feed BODY)._
_All in-app copy + AI instructions are English._

---

## Part 1 — The Activity Feed (the home diary)

A curated, calm timeline of what's happening in the home. **Not** a dumb log.

### Body vs Brain (deterministic vs judgment)

- **Body (deterministic, built):** every meaningful action writes one raw event,
  always. This is the source of truth. Cheap, reliable, never skipped.
- **Brain (judgment, not built):** decides what to *surface*, how to group,
  phrase, and rank. It NEVER mutates the stored truth — it's a view over
  immutable raw events. If the AI is down/slow/wrong → fall back to deterministic
  rules → fall back to raw lines. **Non-blocking; the feed never breaks.**

This is the constitution's brain-vs-body rule: AI touches judgment only; storage
and truth are deterministic and AI can't override them.

### Three tiers (what to do with each event)

- 🟢 **T1 — always show** (meaningful, low-frequency)
- 🟡 **T2 — group / summarize** (noisy, high-frequency) — AI lives here
- 🔴 **T3 — store but hide** (trivial)

### Build strategy: AI-first, then distill into rules

1. Start with the **AI** doing the Brain, guided by our written instructions.
2. **Log every AI decision** (input events → output). This is the learning fuel.
3. Spot recurring patterns ("same person, same type, within 1h → always merges").
4. **Hard-code** those patterns as free deterministic rules.
5. Runtime: if a rule matches → free; else → fall back to AI. AI cost drops over
   time; the app speeds up. AI becomes the fallback for the long tail.

Caveats: needs a small worker (reuse Ollie's `ai-proxy`) + a cheap model
(Groq / Gemini Flash), low temperature + caching (compute once, not per view).
Pattern-finding needs data volume — with a few roommates it takes patience.

### AI instructions (draft)

> **Your job:** turn raw household events into a calm, readable home diary.
> **Always show:** money paid / debt settled · someone joined/left · "X asked a
> favor" · "tonight X is cooking".
> **Group into one line:** same person, same kind, within ~1h →
> "Ayşe added 12 items", "Mert did 3 chores".
> **Hide:** edits, undos, tiny status changes.
> **Tone (most important):** calm, friendly, factual. NO shame, NO ranking, NO
> "who did the most", NO blame. Never make anyone look bad.
> **Phrasing:** short, human, one line; use the name; include amounts/counts.
> **Never:** invent events (use only the given raw events); merge different
> people; add judgment.
> **Output:** a list the app can render — each item `{ icon, text,
> sourceEventIds, tier }`.

### No-shame principle (public vs private)

> **Public feed = about the house, neutral. Private = a gentle nudge to the person.**
> Shame is never public.

Applied to **missed / skipped** (decision: B + C together):
- 🌐 Public feed: person-less, neutral — "Trash didn't get done this week."
- 🔔 Private push (only to the turn-owner): "Heads up — trash was your turn this week."

---

## Part 2 — Tasks: three separate systems

Separated on purpose so they can **cross-check** each other. Built incrementally,
but designed apart from day one.

### 1. Chores — the catalog ("what")

Just definitions. Each chore:
- `name` (trash, dishes, cook dinner, grocery run, water plants…)
- `type` (cleaning · cooking · shopping · errand)
- `frequency` (daily / weekly / custom / one-off)
- `boundDay?` (e.g. trash → Wednesday; grocery → flexible)

### 2. Turns + Schedule — the engine ("who + when") — SHARED INFRA

Decides whose turn and when. Not a plain rotation — it reads several inputs:
- **rotation** (fairness — who's next)
- **schedule** (the chore's bound day — trash Wed, grocery day)
- **availability** (who's away → delegate the turn)
- **payback** (covered turns owed — extra turn the week *after* return)

Output: assignments like "trash → Mert, Wednesday".

**Shared:** both Chores (cleaning/errands) AND Kitchen (cooking turn, shopping
turn) use this one engine. One brain assigns all turns — that's where the
cross-checking lives.

### 3. Swaps / Offers — the change

People can propose changes to turns:
- offer to take someone's turn ("I'll do your trash")
- offer to swap ("you take dishes, I take trash")
- the other person accepts / declines

Swaps modify the engine's assignments.

### How they cross-check

```
Schedule (days) ───┐
Availability ──────┼──→  Turn Engine  ──→  "whose turn"
Payback ───────────┤          ▲
Chores catalog ────┘          │
                         Swaps change it
```

---

## Part 3 — Event vocabulary (English, tiered)

🟢 always show · 🟡 group/summarize · 🔴 store but hide · 🔔 notification (not feed)

### 🏠 House (foundation — live now)
- `home_created` · 🟢
- `member_joined` · 🟢
- `member_left` · 🟢

### 💸 Money
- `expense_added` · 🟢
- `debt_settled` · 🟢
- `subscription_added` · 🟡
- `recurring_payment_logged` · 🟡

### 🍳 Kitchen
- `pantry_item_added` · 🟡
- `pantry_item_ran_out` · 🟡
- `groceries_bought` · 🟡 (→ "Big shop — €42")
- `shopping_item_added` · 🟡
- `meal_voted` · 🟢
- `meal_chosen` · 🟢
- `meal_cooked` · 🟢

### 📋 Chores (catalog)
- `chore_created` · 🔴

### 🔄 Turns (engine)
- `chore_done` · 🟡 (→ "Mert did 3 chores")
- `turn_assigned` (chore / cooking / shopping) · 🔔
- `turn_delegated` (away) · 🟢 ("Mert covered Ayşe's trash")
- `payback_assigned` · 🟡
- `turn_missed` · 🌐 neutral public line + 🔔 private nudge (B+C)
- `away_set` · 🟢
- `back_available` · 🟢

### 🤝 Swaps
- `swap_offered` · 🔔 (to the other person)
- `swap_accepted` · 🟢
- `swap_declined` · 🔴

### 🙏 Favors
- `favor_requested` · 🟢 + 🔔
- `favor_done` · 🟢

### 👤 Personal
- `personal_task_added` · 🔴 (personal — never in shared feed)
- `personal_task_done` · 🔴

---

## Build order (when we get to it)

Feed BODY ✅ → Feed BRAIN (AI-first → distill) → Chores catalog → Turn engine →
Swaps → wire Kitchen turns into the engine. Money module can proceed in parallel
(it only needs the feed BODY, already done).
