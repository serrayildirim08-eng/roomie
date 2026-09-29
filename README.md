# Roomie

A shared-house operating system for roommates. One React Native (Expo) app for iOS and Android
that keeps a household fair in two currencies:

- **Money**: who paid for what and who owes whom (EUR, integer cents).
- **Effort**: whose turn it is for chores and who actually did them.

Capture is formless (a one-line note, a receipt photo, a barcode), but **nothing the AI reads is
ever written until a person confirms it**. The money and rotation logic that decides balances and
turns is plain, pure, tested code: the model drafts, code decides.

---

## Architecture

```
┌──────────────────────────── Expo app (iOS / Android) ────────────────────────────┐
│  expo-router screens (src/app)      feature modules (src/features/*)             │
│                                                                                  │
│  pure logic: money-logic · bills-logic · rotation · chore-state   (no I/O)       │
│                                                                                  │
│  draft → review → Confirm ──► the only write path for AI output (brain/apply.ts) │
└───────────────┬───────────────────────────────────────────────┬──────────────────┘
                │ InstantDB (realtime DB + auth)                │ HTTPS, Clerk JWT
                │ permission rules: instant.perms.ts            ▼
                │                                 ┌──────── workers/brain (Cloudflare) ───────┐
                │                                 │ /draft           note → typed draft       │
                ▼                                 │ /receipt-itemize receipt → line items     │
      household-scoped data                       │ ingest           whitelisted telemetry    │
                                                  │ Groq (JSON mode) → Workers AI fallback    │
                                                  │ zod validation · KV rate limits           │
                                                  │ stateless: never persists user content    │
                                                  └───────────────────────────────────────────┘
```

| Layer | Technology |
| --- | --- |
| App | TypeScript (strict), Expo SDK 56, expo-router, React Native 0.85, React 19 |
| Data, realtime, authorization | [InstantDB](https://instantdb.com) (`instant.schema.ts`, `instant.perms.ts`) |
| Identity | Clerk, bridged into InstantDB with `signInWithIdToken` (`src/features/auth/instant-clerk-bridge.tsx`) |
| AI worker | Cloudflare Workers, zod, jose (`workers/brain`) |
| Models | Groq `openai/gpt-oss-120b` (JSON mode) with Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` as fallback; Groq `meta-llama/llama-4-scout-17b-16e-instruct` for receipt vision |
| Product data | Open Food Facts (barcode lookup) |

---

## Data protection

Roomie is **server-first**: household data lives in InstantDB so that every roommate sees the same
ledger in real time. Protection comes from authorization rules enforced on the server, not from
client filters.

**Authorization is declared, not scattered.** `instant.perms.ts` spells out
`view / create / update / delete` for every entity. InstantDB defaults an entity with no rule to
*allow*, so each one is written out explicitly. The per-screen `where` clauses in the app are
convenience only and are documented as *not* a security boundary.

- Household rows are readable and writable only by members of that household, resolved server-side
  through `household.memberships.user`.
- Joining a household requires its invite code.
- `personalTasks` are visible to their owner only; `nudges` only to their recipient.
- Amounts are capped at €10,000 in the rules as well as in the client.

**The AI worker keeps nothing.** `workers/brain` receives a note (capped at 500 characters) or a
receipt image URL, returns a draft, and persists no user content. The receipt prompt instructs the
model to ignore names, card digits and addresses.

**Telemetry is minimal by construction.** Events are gated on the user's consent, columns are
whitelisted in the worker, and the user identifier is a salted SHA-256 hash computed server-side
(`workers/brain/src/ingest.ts`), so the client can never send a raw identifier.

---

## Deterministic core, probabilistic edge

LLM output is treated as untrusted input to deterministic code.

1. **Temperature 0 and JSON mode** on every model call.
2. **Schema validation.** Drafts are parsed with zod (`workers/brain/src/schema.ts`): six allowed
   targets, required fields per target, `amountCents ≤ 500,000`, at most eight fragments. Parsing
   *salvages* rather than fails: an invalid fragment is dropped on its own, and an expense that lost
   its amount becomes a question ("How much was it?") instead of a guess.
3. **Bounded fallback.** A Groq error, malformed JSON or a 12-second timeout falls through once to
   Workers AI. If both fail, the worker returns `502` and nothing is written.
4. **Draft first, human commit.** The only write path for AI output is `src/features/brain/apply.ts`,
   which runs after the user taps Confirm.
5. **Pure decision logic.** Balances, debt simplification, bill splits and chore rotation are pure
   functions with no I/O (`money-logic.ts`, `bills-logic.ts`, `rotation.ts`). Money is integer cents;
   leftover cents are distributed deterministically, so the same inputs always produce the same
   ledger.

### Append-only records

History that matters for fairness cannot be rewritten. These entities are append-only at the
permission layer (`update: 'false'`, `delete: 'false'`), so no client, including a buggy one, can
alter them:

| Entity | Rule |
| --- | --- |
| `purchases` | append-only purchase log |
| `activityEvents` | append-only household feed |
| `choreEvents` | append-only chore history |
| `settlements` | immutable; deletable only by the payer |
| `$files` | cannot be deleted |

Every model call also emits one structured log line with the model, latency, token counts and an
estimated cost.

---

## Security

- **Worker authentication**: Clerk JWTs verified against Clerk's published JWKS with an issuer check
  (`workers/brain/src/clerk-verify.ts`).
- **Rate limiting**: 200 AI calls per user per day and 10 telemetry events per minute, backed by
  Workers KV, with an in-memory global cap if KV is unavailable.
- **Secrets** live in Wrangler secrets only. The InstantDB App ID in `src/lib/db.ts` is a public
  identifier; access is governed by the permission rules above.
- **Dependencies**: Dependabot security updates.

---

## Testing

Vitest, 11 test files, 97 cases:

- App logic: money, bills, rotation, chore state, calendar, weekly recap, pulse, tiny wins, off-map.
- Worker: Clerk token verification and rate limiting.

CI (`.github/workflows/ci.yml`, Node 20) runs `npm ci`, typecheck, lint, tests and a format check on
every push and pull request.

---

## Getting started

```bash
npm install
npm start            # Expo dev server
npm run ios          # iOS simulator
npm run android      # Android emulator
npm run typecheck && npm run lint && npm test
```

App environment (`.env`): `EXPO_PUBLIC_INSTANT_APP_ID`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`EXPO_PUBLIC_BRAIN_URL`.

Worker (`workers/brain`):

```bash
npx wrangler dev        # local
npx wrangler deploy     # production
```

Worker secrets: `GROQ_API_KEY`, `CLERK_ISSUER`, `USER_HASH_SALT`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`. Bindings: `AI`, `RATE_LIMIT`.

Permission rules are deployed with `npx instant-cli@latest push perms`.

---

## Repository layout

```
src/app/            expo-router screens
src/features/       feature modules and their pure logic + tests
src/lib/db.ts       InstantDB client
instant.schema.ts   data model
instant.perms.ts    server-side authorization rules
workers/brain/      Cloudflare Worker: AI drafts, receipt itemizing, telemetry ingest
docs/               roadmap, product specs, audits
```

## Status

Dogfooding in one real shared flat before a wider release.
