# Roomie

Shared-house operating system for roommates. Tracks **fairness in two currencies**:

- 💸 **Money** — who paid for what, who owes whom (in EUR), à la Splitwise.
- 🧹 **Effort** — whose turn it is for shopping / cleaning / cooking, and who actually did it.

Same job both ways: _"is everyone pulling their weight?"_ — without points, leaderboards, or shame.

**Wedge:** one sentence → many places. _"Bought milk, €5"_ → adds milk to the shared pantry **and** logs the expense, in one go.

## Status

Early. Dogfood-first: built for one real flat (Rotterdam) before it ships to anyone else.

## Stack

- Vite + React + TypeScript (strict)
- ESLint (flat config, mirrors the Ollie repo so vendored modules drop in clean) + Prettier
- pnpm

## Scripts

```bash
pnpm install
pnpm dev           # local dev server
pnpm typecheck     # tsc
pnpm lint          # eslint
pnpm format        # prettier --write
pnpm build         # typecheck + production build
```

## Scope (v1)

In: expense split (EUR) · shared pantry/groceries (+ Feed Me recipe vote) · chore/shopping/cooking rota with "who did it".
Out (for now): rent/bills, calendar, separate chat, gamification, in-app payments.
