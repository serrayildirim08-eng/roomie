# Kitchen dogfood feedback → roadmap (2026-07-03)

Source: Serra's first real-iPhone dogfood. App works on device (Release standalone), barcode scan works.

## The 3 notes
| # | Feedback | Approach | Ship? |
|---|---|---|---|
| 1 | Barcode missed Coca-Cola (Open Food Facts gap) | Add common packaged items (coke/cola/pepsi/fanta/chips/…) to the alias table so the typed-name fallback resolves them; optional tiny local barcode→name map for a few ultra-common products | **Code now** |
| 2 | "Pantry biraz karışık, düzenlemek lazım" | **Design proposal + HTML mock only** (discuss-first rule) — identify what's messy, propose a cleaner layout; Serra signs off before any code | **Mock only** |
| 3 | Tapping "Out" silently moves item to shopping list → should ask intent | Gate the "Out" button behind a small no-shame prompt ("Out of X? → Add to shopping list / Remove / Cancel"), reusing existing onOut/onDelete | **Code now** |

## Guardrails
No schema, no new deps, no perms, no commits, disjoint files, no-shame copy. #2 ships NO app code — mock + rationale only.

## Plan
- Fan-out: A=#3 (kitchen-screen.tsx), B=#1 (alias-data.ts + barcode-lookup.ts), C=#2 (design/pantry-redesign-2026-07-03/ mock+DIRECTION).
- Verify: typecheck + lint + tests green (covers A+B).
- Then: review #2 mock together → decide to build.
