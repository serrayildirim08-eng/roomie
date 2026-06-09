# Roomie

Shared-house operating system for roommates — a **React Native (Expo)** phone app
for iPhone + Android. Tracks **fairness in two currencies**:

- 💸 **Money** — who paid for what, who owes whom (EUR), à la Splitwise.
- 🧹 **Effort** — whose turn it is for chores / shopping / cooking, and who actually did it.

Same job both ways: _"is everyone pulling their weight?"_ — without points, streaks, or shame.
Photo/OCR and one-line text capture are **facilitators** (formless input), not the point.

## Status

Early — Foundation phase. Dogfood-first: built for one real flat (Rotterdam) before anyone else.
Build order is foundation-first (see `docs/ROADMAP_ELI5.md`): get a working shared app, then
layer the richer features (calendar, personal tasks, favors, OCR) on top.

## Stack

- **React Native + Expo** (expo-router, TypeScript strict) — one codebase, iPhone + Android
- **InstantDB** — shared backend: database + auth + realtime sync (set up in Phase 1)
- ESLint (eslint-config-expo, flat) + Prettier
- npm

## Scripts

```bash
npm install
npm start          # Expo dev server (open in Expo Go on your phone)
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
npm run format     # prettier --write
```

## v1 scope (foundation)

In: users · households · invite link · activity feed · manual expense split (EUR, equal) ·
shared pantry + shopping list · basic chores with rotation + history · AI/OCR **drafts that
require confirmation before saving**.

Later (post-foundation): personal tasks · need-a-favor · absence delegation · advanced
calendar · payback/fairness logic · meal voting · advanced Feed Me · rent/bills · native
store release.

The full plan, in plain English: [`docs/ROADMAP_ELI5.md`](docs/ROADMAP_ELI5.md).
