# Roomie Audit — Round 1 (raw findings)

_Tarih: 2026-06-14 · Bağımsız tur 1/3 · 20 boyut · bu tur diğer turlardan habersiz yapıldı._

> Bu ham tur çıktısıdır. Güven puanı (3 tur kaç kez buldu) ve çapraz-eleme **sadece** [`AUDIT_REPORT.md`](./AUDIT_REPORT.md)'tedir. Buradaki bulgular önem (severity) sırasına dizilidir.

**Bu turda:** 94 bulgu — 🔴 4 critical · 🟠 39 high · 🟡 28 medium · ⚪ 23 low

---

### 1. 🔴 `critical` — No permission rules for shared entities - all authenticated users world-readable
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:1-23`
- **Kanıt:** instant.perms.ts defines rules ONLY for $users entity (lines 16-20). All other entities in instant.schema.ts (expenses, settlements, pantryItems, purchases, chores, choreEvents, personalTasks, activityEvents, households, memberships, profiles) have no explicit permission rules defined. Without rules, InstantDB defaults to allowing any authenticated user to view and modify all records in these entities.
- **Etki:** Any authenticated user in the system can read and modify data from ANY household - including expenses, debts, pantry items, chores, and personal tasks of other households they don't belong to. A user could: read all expenses from other households (privacy leak), modify expense amounts (money tampering), delete chores from other homes, read personal tasks marked private. This is a cross-household data breach for real money and private information.
- **Fix:** Add explicit permission rules to instant.perms.ts for every entity requiring household scoping. Example pattern for expenses:
```typescript
expenses: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')",
    update: "auth.id in data.ref('household.memberships.user.id')",
    delete: "auth.id in data.ref('household.memberships.user.id')"
  }
},
```
Repeat this pattern for: settlements, pantryItems, purchases, chores, choreEvents, personalTasks, activityEvents, households (view only), memberships (status-dependent), profiles (view only for housemates). Update instant.schema.ts comment (line 5) rule validation.

### 2. 🔴 `critical` — Expenses and settlements unprotected - cross-household financial data leak
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:46-59 and src/features/money/money-screen.tsx:39-48`
- **Kanıt:** expenses and settlements entities have no permission rules. MoneyScreen queries with household scoping via membership filter (money-screen.tsx lines 40-47), but without enforced permissions, a user can call db.queryOnce({ expenses: {} }) to fetch ALL expenses from all households, or modify/delete expenses from other homes via db.transact().
- **Etki:** Any authenticated user can read all financial data from all households: expense amounts, who paid, who owes. They can also modify or delete expenses from other households, corrupting financial records. In a real shared-house app, this means: user from Apartment A can see all debts in Apartment B, can edit amounts, can delete records to hide fraud. Critical for money security.
- **Fix:** Add permission rules for expenses and settlements:
```typescript
expenses: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')",
    update: "auth.id in data.ref('household.memberships.user.id')",
    delete: "auth.id in data.ref('household.memberships.user.id')"
  }
},
settlements: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')",
    update: "auth.id in data.ref('household.memberships.user.id')",
    delete: "auth.id in data.ref('household.memberships.user.id')"
  }
},
```

### 3. 🔴 `critical` — Invalid unlink with empty string ID on item revival
- **Boyut:** Kitchen normalize/alias/aging (`kitchen-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:106`
- **Kanıt:** .unlink({ claimedBy: existing.claimedBy?.id ?? '' })
- **Etki:** When an item on the shopping list (status='out') is not claimed by anyone (claimedBy is null), the code attempts to unlink with an empty string ID instead of conditionally unlinking. This causes incorrect database state or potential crashes when the transaction executes.
- **Fix:** Only unlink if claimedBy exists: if (existing.claimedBy?.id) { .unlink({ claimedBy: existing.claimedBy.id }) } else { just update without unlinking }

### 4. 🔴 `critical` — Non-null assertion on missing environment variable without runtime validation
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/app/_layout.tsx:20`
- **Kanıt:** const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
- **Etki:** The non-null assertion (!) claims the env var is always present, but in development, CI environments without proper setup, or misconfiguration, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY may be undefined. This will cause ClerkProvider to receive undefined as publishableKey, breaking authentication silently with a cryptic error. Since auth is the gating layer for the entire app, this is a critical correctness issue that should fail loudly at app startup.
- **Fix:** const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY; if (!publishableKey) throw new Error('Missing required env var: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Set it in .env.local or environment.');

### 5. 🟠 `high` — Hardcoded placeholder colors with insufficient contrast
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/auth/auth-screen.tsx:122,147,157,168`
- **Kanıt:** placeholderTextColor="#9b9b9b" used in TextInput fields. Contrast ratio: 2.74 on input bg (#FFFDF9), 2.60 on canvas (#FBF7F0). Fails WCAG AA minimum of 3.0 for normal text.
- **Etki:** Users with low vision or in bright lighting cannot read placeholder text guidance in auth forms (login/signup fields). Particularly affects username, email, password, and code entry fields.
- **Fix:** Replace all hardcoded #9b9b9b with Roomie.sub (#97897A) which achieves 3.35 contrast on input and 3.18 on canvas. Alternatively, darken placeholder color for better contrast.

### 6. 🟠 `high` — Hardcoded expense metadata color below minimum contrast
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:406`
- **Kanıt:** expenseMeta: { fontSize: 12, color: '#9b9b9b' } on recent expenses list. Contrast ratio: 2.60 on canvas. Fails WCAG AA 3.0 minimum for small text (12px).
- **Etki:** Users cannot reliably read secondary information about who paid and how many are sharing expenses. Particularly difficult for low-vision users and in outdoor/bright environments.
- **Fix:** Use Roomie.sub (#97897A) which provides 3.18 contrast, or use a darker color. This color already used successfully elsewhere in the app.

### 7. 🟠 `high` — Touch target sizing below 44x44pt minimum for delete buttons
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:453,src/features/money/money-screen.tsx:407,src/features/kitchen/kitchen-screen.tsx:444`
- **Kanıt:** Delete buttons have padding: 4 or 6 only, creating ~20-27pt touch targets. iOS/Android accessibility minimum is 44x44pt. Uses hitSlop={8} as partial workaround but this is insufficient.
- **Etki:** Users with motor impairments or those on small devices cannot reliably tap delete buttons. High risk of accidental data deletion. Non-compliant with Apple/Google accessibility guidelines.
- **Fix:** Increase touch targets: use paddingVertical: 12, paddingHorizontal: 16 minimum (44pt+), or ensure hitSlop={18} if keeping small button size. Match other action buttons (settle, claim, done) which use 14-16pt padding.

### 8. 🟠 `high` — Small action buttons below 44x44pt touch target minimum
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:442-450,src/features/money/money-screen.tsx:397-402,src/features/kitchen/kitchen-screen.tsx:420-441`
- **Kanıt:** Pass button (7px v, 12px h), Done button (7px v, 12px h), Settle button (8px v, 14px h), Claim/GotIt/Out buttons (7px v, 13px h) all create ~14-16pt touch targets with fontSize 13px. Minimum 44x44pt required.
- **Etki:** Users with reduced motor control cannot accurately activate chore actions, debt settlement, or shopping list management. Affects core functionality of the app for accessibility-dependent users.
- **Fix:** Increase all action button padding to minimum: paddingVertical: 12, paddingHorizontal: 16 (44pt+). Maintain visual hierarchy with larger minimum sizes rather than relying on precise small touches.

### 9. 🟠 `high` — Unvalidated API response body causes runtime crash
- **Boyut:** API request/response validation (`api-validation`)
- **Yer:** `src/features/brain/brain-input.tsx:62`
- **Kanıt:** const body = (await res.json()) as DraftResponse; ... setPhase(body.fragments.length > 0 || body.question ? 'draft' : 'done');
- **Etki:** If API response is missing 'fragments' field, accessing .length on undefined causes TypeError crash. This can occur if response is malformed, monkey-patched, or server has a bug returning wrong shape. Users see app crash instead of error message.
- **Fix:** Validate response shape with zod or explicit checks: if (!Array.isArray(body.fragments) || body.question == null) throw new Error('Invalid response')

### 10. 🟠 `high` — Stale timestamp in kitchen-screen onAdd - delayed async writes use render-time value
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:91`
- **Kanıt:** const now = nowMs();

const onAdd = async () => {
  ...
  await db.transact(
    db.tx.pantryItems[itemId]
      .update({
        ...
        addedAt: now,  // Line 119 uses stale value from line 91
        createdAt: now,
        updatedAt: now,
      })
  )
- **Etki:** If a user opens the kitchen screen, waits 30 seconds, then adds an item, the item's timestamps (addedAt, createdAt, updatedAt) will be 30 seconds in the past. This breaks item aging calculations which depend on accurate timestamps. Multiple items added at different times could all show the same wrong timestamps.
- **Fix:** Replace 'const now = nowMs();' at line 91 with individual nowMs() calls inside each async function: use 'const ts = nowMs();' inside onAdd, onOut, onClaim, and onGotIt functions.

### 11. 🟠 `high` — No double-submit guard on onSettle - multiple settlements can be created
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:183`
- **Kanıt:** const onSettle = async (fromId: string, toId: string, amountCents: number) => {
  const settlementId = id();
  await db.transact(...);
  await logActivity(...);
};

// Later, called without await or disabled check:
onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}
- **Etki:** User can rapidly tap the 'Settle' button while the async operation is pending. Each tap creates a new settlement record with the same amount, resulting in the debt being settled multiple times. For a €100 debt, user could create 3 settlements of €100 each by rapid clicking, overpaying by €200.
- **Fix:** Add pending state tracking: (1) Add 'const [settlingId, setSettlingId] = useState<string | null>(null);' (2) In onSettle, set pending at start, clear in finally block (3) Disable settle button when 'settlingId === d.fromId+d.toId+d.amountCents' or use a global pending flag

### 12. 🟠 `high` — No double-submit guard on onClaim - race between two roommates claiming same item
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:145`
- **Kanıt:** const onClaim = async (itemId: string, itemName: string) => {
  await db.transact(
    db.tx.pantryItems[itemId].update({ updatedAt: nowMs() }).link({ claimedBy: userId }),
  );
  ...
};

// Called without await:
onPress={() => onClaim(it.id, it.name)}
- **Etki:** Two roommates can tap 'I'll get it' on the same shopping item simultaneously. Both async operations execute in parallel. The database will record one of them as claimedBy (last write wins), but the UI on both clients will optimistically show different states. User A sees 'You are getting it', User B also sees 'You are getting it', but the database only recorded one. Causes double-buying or confusion about who's responsible.
- **Fix:** Add itemId to pending state: 'const [claimingIds, setClaimingIds] = useState<Set<string>>(new Set());' Track pending claims and disable claim button when 'claimingIds.has(it.id)'

### 13. 🟠 `high` — Silent revert of edited expense amounts on invalid input
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `src/features/brain/brain-input.tsx:78`
- **Kanıt:** const cents = parseAmountToCents(amountDraft[idx]);
return cents ? { ...f, amountCents: cents } : f;
- **Etki:** When a user edits an expense amount to an invalid value (e.g., 'abc'), parseAmountToCents returns null. The ternary operator then silently keeps the original fragment unchanged. The user's edited amount is discarded with no feedback, and the original brain-generated amount is applied instead. This violates the draft-first principle - changes made in the confirmation UI are lost.
- **Fix:** Replace the falsy check with an explicit null check to distinguish between 'no edit' (undefined) and 'invalid edit' (null). Show validation feedback for invalid edits: return cents !== null ? { ...f, amountCents: cents } : (cents === null && amountDraft[idx] !== undefined ? null : f), then handle null by showing an error instead of applying.

### 14. 🟠 `high` — Non-idempotent apply creates duplicate data on retry after failure
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `src/features/brain/apply.ts:53-153 (loop), brain-input.tsx:81-91 (error handling)`
- **Kanıt:** applyFragments iterates fragments creating NEW records (expenses, purchases, chore events, personal tasks) using id() for each. On database/network error during the loop, the catch block in onConfirm only sets phase='error'. Fragments remain in state. When user edits input text to reset phase to 'idle' and re-sends, applyFragments is called again with the same fragments, creating duplicates for all non-pantry targets.
- **Etki:** If any transact() call fails midway through applying fragments (e.g., network timeout on 3rd expense out of 5), the user will lose data consistency. Retrying (by editing input and re-sending) creates duplicate expenses, purchase logs, chore done events, and personal tasks. This breaks accounting and task rotation accuracy in a shared-house app where money and chores matter.
- **Fix:** Clear fragments on successful apply (already done line 86). More critically: either (1) wrap all fragment writes in a single transaction to atomicity, or (2) add idempotency keys (e.g., based on draft hash or timestamp) so duplicate apply calls detect and skip already-applied fragments, or (3) disable retry by clearing fragments on error and showing a non-recoverable error state.

### 15. 🟠 `high` — personalTasks marked private but not enforced by permissions
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:96-102 and src/features/tasks/tasks-screen.tsx:102-104`
- **Kanıt:** Schema defines personalTasks as "One owner, no rotation. Scoped to the household so 'need a favor' can read them later" (line 96-97). Code filters by owner.id client-side (tasks-screen.tsx lines 102-104: `myTasks.filter((t) => t.owner?.id === userId)`). However, with no permission rule, any user can query ALL personalTasks in a household via db.useQuery(), not just their own.
- **Etki:** Personal to-do lists are accessible to all housemates when querying the database directly. If a malicious housemate crafts a direct query without the client-side filter (e.g., via API console), they can read all personal tasks of everyone in the household. This violates privacy - personal tasks may contain sensitive information (health, financial, relationship details).
- **Fix:** Add permission rule for personalTasks:
```typescript
personalTasks: {
  allow: {
    view: "auth.id == data.ref('owner.id')",
    create: "auth.id == data.ref('owner.id')",
    update: "auth.id == data.ref('owner.id')",
    delete: "auth.id == data.ref('owner.id')"
  }
},
```

### 16. 🟠 `high` — No permissions on activityEvents - household activity logs world-readable
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:40-44 and src/features/activity/activity-feed.tsx:12-20`
- **Kanıt:** activityEvents has no permission rule defined. ActivityFeed queries with household.id filter: `where: { 'household.id': householdId }` (activity-feed.tsx line 15). However, without enforced permissions, any authenticated user can query activity events from any household using a raw queryOnce call with a different householdId.
- **Etki:** All household activity logs are visible to unauthorized users. Activity logs contain: expense titles/amounts, who paid whom, pantry purchases, chore history, member join/leave events. This is a privacy leak of financial activity and household member movements. An authorized user in household A could spy on household B's entire activity stream.
- **Fix:** Add permission rule for activityEvents:
```typescript
activityEvents: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')"
  }
},
```

### 17. 🟠 `high` — Kitchen items unprotected - pantry/shopping list accessible cross-household
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:63-79 and src/features/kitchen/kitchen-screen.tsx:41-49`
- **Kanıt:** pantryItems and purchases entities have no permission rules. KitchenScreen filters by household via membership query (kitchen-screen.tsx lines 42-48), but db.queryOnce({ pantryItems: {} }) would return all items from all households.
- **Etki:** Any user can read pantry/shopping lists of other households. While less critical than financial data, this is still a privacy leak: reveals what items a household buys/has (dietary preferences, lifestyle information). Users can also modify/delete items from other homes' kitchens.
- **Fix:** Add permission rules for pantryItems and purchases:
```typescript
pantryItems: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')",
    update: "auth.id in data.ref('household.memberships.user.id')",
    delete: "auth.id in data.ref('household.memberships.user.id')"
  }
},
purchases: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')"
  }
},
```

### 18. 🟠 `high` — Chores unprotected - rotation visibility and modification cross-household
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:83-94 and src/features/tasks/tasks-screen.tsx:44-56`
- **Kanıt:** chores and choreEvents have no permission rules. TasksScreen fetches via membership query (tasks-screen.tsx lines 45-56), but db.queryOnce({ chores: {} }) returns all chores from all households. Users can modify turn assignments or create false event history.
- **Etki:** Any user can read and modify chore assignments in other households: see who's assigned to what, change whose turn it is, log false history. While not financial, this can disrupt household management in other homes.
- **Fix:** Add permission rules for chores and choreEvents:
```typescript
chores: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')",
    update: "auth.id in data.ref('household.memberships.user.id')",
    delete: "auth.id in data.ref('household.memberships.user.id')"
  }
},
choreEvents: {
  allow: {
    view: "auth.id in data.ref('household.memberships.user.id')",
    create: "auth.id in data.ref('household.memberships.user.id')"
  }
},
```

### 19. 🟠 `high` — Unhandled promise rejections in Alert confirmation callbacks
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:168-177`
- **Kanıt:** void (async () => {
  await db.transact(db.tx.expenses[expenseId].delete());
  await logActivity(...);
})();
- **Etki:** If the expense deletion fails, the error is silently swallowed. The user receives no feedback that the operation failed, but the UI state may be inconsistent with the database.
- **Fix:** Wrap the async IIFE in try/catch and set a form error state, or use .catch() to log the error: `.catch(err => console.error('Delete failed:', err))`

### 20. 🟠 `high` — Unhandled promise rejections in Alert confirmation callbacks - Kitchen
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:221-230`
- **Kanıt:** void (async () => {
  await db.transact(db.tx.pantryItems[itemId].delete());
  await logActivity(...);
})();
- **Etki:** If the pantry item deletion fails, the error is silently swallowed. The user has no indication the operation failed.
- **Fix:** Add error handling: `.catch(err => console.error('Pantry delete failed:', err))`

### 21. 🟠 `high` — Unhandled promise rejections in Alert confirmation callbacks - Tasks
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:203-212`
- **Kanıt:** void (async () => {
  await db.transact(db.tx.chores[choreId].delete());
  await logActivity(...);
})();
- **Etki:** If the chore deletion fails, the error is silently swallowed. The user has no indication the operation failed.
- **Fix:** Add error handling: `.catch(err => console.error('Chore delete failed:', err))`

### 22. 🟠 `high` — Unhandled promise rejections in Alert confirmation callbacks - Household
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/household/household.tsx:246-254`
- **Kanıt:** void (async () => {
  await db.transact(db.tx.memberships[membershipId].update({ status: 'removed' }));
  await logActivity(...);
})();
- **Etki:** If leaving a household fails, the error is silently swallowed. The user may think they left when they didn't.
- **Fix:** Add error handling with user feedback or logging

### 23. 🟠 `high` — Async functions called from event handlers without error handling
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:327`
- **Kanıt:** <Pressable style={styles.outButton} onPress={() => onOut(it.id, it.name)}>
- **Etki:** onOut is an async function (line 134) called without await or error handling. If it fails, the error is unhandled and the app may crash.
- **Fix:** Wrap in try/catch: `onPress={() => onOut(it.id, it.name).catch(err => console.error('Out failed:', err))}`

### 24. 🟠 `high` — Async functions called from event handlers without error handling - Kitchen claim
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:298`
- **Kanıt:** <Pressable style={styles.claim} onPress={() => onClaim(it.id, it.name)}>
- **Etki:** onClaim is an async function (line 145) called without error handling. If it fails, the error is unhandled.
- **Fix:** Add error handling: `.catch(err => console.error('Claim failed:', err))`

### 25. 🟠 `high` — Async functions called from event handlers without error handling - Kitchen GotIt
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:294`
- **Kanıt:** <Pressable style={styles.gotIt} onPress={() => onGotIt(it.id, it.name, it.normalizedName)}>
- **Etki:** onGotIt is an async function (line 158) called without error handling. If it fails, the error is unhandled.
- **Fix:** Add error handling

### 26. 🟠 `high` — Async functions called from event handlers without error handling - Tasks advance
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:235,242`
- **Kanıt:** onPress={() => advance(chore.id, chore.name, holderId, 'pass')}
onPress={() => advance(chore.id, chore.name, holderId, 'done')}
- **Etki:** advance is an async function (line 172) called without error handling. If rotation advance fails, the error is unhandled.
- **Fix:** Add error handling to advance function calls

### 27. 🟠 `high` — Async functions called from event handlers without error handling - Tasks mineDone
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:304`
- **Kanıt:** <Pressable style={styles.done} onPress={() => onMineDone(t.id)}>
- **Etki:** onMineDone is an async function (line 164) called without error handling. If mark-done fails, the error is unhandled.
- **Fix:** Add error handling

### 28. 🟠 `high` — Async functions called from event handlers without error handling - Tasks mineDelete
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:309`
- **Kanıt:** <Pressable style={styles.delete} onPress={() => onMineDelete(t.id)}>
- **Etki:** onMineDelete is an async function (line 168) called without error handling. If delete fails, the error is unhandled.
- **Fix:** Add error handling

### 29. 🟠 `high` — Async functions called from event handlers without error handling - Money settle
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:287`
- **Kanıt:** onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}
- **Etki:** onSettle is an async function (line 183) called without error handling. If settlement fails, the error is unhandled.
- **Fix:** Add error handling to onSettle

### 30. 🟠 `high` — Async onAddHouse function called from multiple event handlers without error handling
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:327-331`
- **Kanıt:** onSubmitEditing={onAddHouse}
<Pressable style={styles.addButton} onPress={onAddHouse}>
- **Etki:** onAddHouse is an async function (line 130) called from both onSubmitEditing and onPress without error handling. If DB write fails, no error feedback.
- **Fix:** Add try/catch to onAddHouse or handle errors with user feedback

### 31. 🟠 `high` — Async kitchen onAdd function without error handling
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:248-251`
- **Kanıt:** onSubmitEditing={onAdd}
<Pressable style={styles.addButton} onPress={onAdd}>
- **Etki:** onAdd is an async function (line 93) without error handling. If DB write fails, the draft is cleared but no error feedback to user.
- **Fix:** Add try/catch with error state

### 32. 🟠 `high` — Async onAddMine function called without error handling
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:291-296`
- **Kanıt:** onSubmitEditing={onAddMine}
<Pressable style={styles.addButton} onPress={onAddMine}>
- **Etki:** onAddMine is an async function (line 151) called without error handling. If DB write fails, draft is cleared but no error feedback.
- **Fix:** Add try/catch with error state

### 33. 🟠 `high` — Async onAddSuggestion function without error handling
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:355`
- **Kanıt:** onPress={() => onAddSuggestion(s.name)}
- **Etki:** onAddSuggestion is an async function (line 114) called without error handling. If DB write fails, error is unhandled.
- **Fix:** Add error handling

### 34. 🟠 `high` — Settlement activity logs wrong actor when creditor initiates payment recording
- **Boyut:** Money debt/settlement math (`money-correctness`)
- **Yer:** `src/features/money/money-screen.tsx:192`
- **Kanıt:** const onSettle = async (fromId: string, toId: string, amountCents: number) => {
    // ...
    await logActivity({
      householdId: household.id,
      actorId: fromId,  // BUG: always logs fromId as actor
      actorName: nameById[fromId] ?? 'Someone',
      type: 'debt_settled',
      metadata: { amountCents, toName: nameById[toId] ?? 'someone' },
    });
- **Etki:** When a creditor (toId) clicks 'Settle' on a debt they are owed, the activity log incorrectly records the debtor (fromId) as the person who settled the debt. This breaks the audit trail and can cause trust issues in shared households about who actually performed the payment action. In real scenarios with 3+ roommates, this means Alice could settle money owed by Bob to her, but the log shows Bob settling it.
- **Fix:** Pass userId as a parameter to onSettle: `const onSettle = async (fromId: string, toId: string, amountCents: number, actorId: string)` and use `actorId: actorId` instead of `actorId: fromId`. Then update the call at line 287 to include userId: `onSettle(d.fromId, d.toId, d.amountCents, userId)`

### 35. 🟠 `high` — Index-as-key in debts list renders
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:282`
- **Kanıt:** debts.map((d, idx) => { ... <View key={idx} ... }) — using idx as key instead of a stable identifier from d object
- **Etki:** When debts list reorders (e.g., after settling a debt), React will misidentify which debt item is which, causing component state corruption, lost animations, and incorrect reconciliation. The Settle button's onPress handler may reference the wrong debt amount.
- **Fix:** Use a stable key from the debt object. Since debts are derived from expenses/settlements, construct a stable unique key like `key={`${d.fromId}-${d.toId}-${d.amountCents}`}` or use the underlying expense/settlement id if available from the data structure.

### 36. 🟠 `high` — Index-as-key in brain input fragments list
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:122`
- **Kanıt:** fragments.map((f, idx) => { ... <View key={idx} ... }) — using idx as key while the Pressable on line 133 allows removing fragments with setFragments((fs) => fs.filter((_, i) => i !== idx))
- **Etki:** When a user removes a fragment from the middle of the list, the remaining fragments shift indices, causing React to incorrectly reuse component state. The amount edit input fields (TextInput on line 125) will get mixed up between fragments—the wrong amount could be edited or submitted for the wrong expense.
- **Fix:** Assign stable identifiers to fragments at creation time (e.g., use a uid or spread a unique field into each fragment object), then key by that identifier: `key={f.id}` or similar.

### 37. 🟠 `high` — Invalid keyframe keypoint percentage in animated-icon.web.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/components/animated-icon.web.tsx:47`
- **Kanıt:** [DURATION / 1000]: { ... } where DURATION=300, so the keypoint is at 0.3 (should be 0-100)
- **Etki:** Keyframe keypoints must be numeric percentages 0-100. Using DURATION/1000 = 0.3 is invalid and will cause the animation to not render correctly or may be silently ignored. The animation will jump from 0% to 100% without the intended 30% keyframe.
- **Fix:** Change [DURATION / 1000] to 30 (representing 30% of the animation duration)

### 38. 🟠 `high` — CLERK_SECRET_KEY in client-side .env.local
- **Boyut:** Secrets & config hygiene (`secrets-config`)
- **Yer:** `/Users/serrayildirim/roomie/.env.local:2`
- **Kanıt:** CLERK_SECRET_KEY=sk_test_iqh5D5UuZIIxtqcKeI6dnvYDBdxFXAkuwKSnE4XEMp
- **Etki:** The secret key exists in a client-side environment file that, while currently gitignored, represents poor key hygiene. If .gitignore is accidentally removed or the file is manually committed, this exposes the secret. The secret is never used in the codebase (not in src/ or workers/), indicating it was added by mistake. This creates unnecessary attack surface for a key that should only exist on Clerk's backend.
- **Fix:** Remove CLERK_SECRET_KEY from .env.local entirely. The Clerk client only needs EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. If backend verification is needed in the future, store the secret via wrangler secret put (like GROQ_API_KEY), never in .env files.

### 39. 🟠 `high` — applyFragments uses overly loose bidirectional chore matching
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/brain/apply.ts:119-122`
- **Kanıt:** const needle = f.chore.toLowerCase();
      const chore = household.chores.find((c) => {
        const name = c.name.toLowerCase();
        return name.includes(needle) || needle.includes(name);  // BOTH DIRECTIONS
      });
- **Etki:** Substring matching in both directions causes false positives. Example: AI says 'dishes done', needle='dishes' matches both 'Dishes' and 'Washing dishes'; find() returns first match, so wrong chore gets marked done and turn rotates incorrectly. Real money is not involved, but chore rotation fairness is broken.
- **Fix:** Use only one-way matching: `name.includes(needle)` (exact chore name must contain the spoken phrase), or implement proper fuzzy matching with a distance threshold. Test against actual chore library (STARTER_CHORES, CHORE_LIBRARY).

### 40. 🟠 `high` — applyFragments chore.turn link fallback is unsafe when orderedMembers is empty or userId not member
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/brain/apply.ts:128-131`
- **Kanıt:** const holderId = effectiveTurn(orderedMembers, chore.turn?.id);
      const next = nextTurn(orderedMembers, holderId);
      await db.transact([
        db.tx.chores[chore.id].update({ updatedAt: ts }).link({ turn: next ?? userId }),
- **Etki:** When orderedMembers is empty (household has no active members) or userId is not an active member, nextTurn() returns null, and the code falls back to linking turn=userId. If userId is not in the household's active memberships, this creates a dangling link and data integrity breach. The chore would be assigned to a non-member.
- **Fix:** Before applyFragments, validate that userId is in orderedMembers. If not, return early with skipped=["no permission to apply"] or similar. Otherwise, ensure next is always a valid member ID before linking.

### 41. 🟠 `high` — Extensive untested critical logic: normalize.ts, aging.ts, activity.ts, apply.ts, schema.ts
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/kitchen/normalize.ts, src/features/kitchen/aging.ts, src/features/activity/activity.ts, src/features/brain/apply.ts, workers/brain/src/schema.ts`
- **Kanıt:** Only 2 test files exist (money-logic.test.ts, rotation.test.ts) with 27 tests total. Zero tests for: foldDiacritics(), stripPlural(), levenshtein(), normalizeItemName(), resolveItem() (all in normalize.ts, 165 lines), ageOf() (aging.ts, 55 lines), describeEvent(), timeAgo(), logActivity() (activity.ts, 144 lines), applyFragments() (apply.ts, 154 lines), parseDraft() (schema.ts, 91 lines).
- **Etki:** These modules handle critical paths: item name normalization (affects kitchen deduplication), aging state machines (affects item visibility), activity feed formatting (affects user-visible text), AI draft application (applies all AI output to DB), and JSON validation (protects against malformed AI output). Zero test coverage means edge cases, error paths, and integration scenarios are unknown. Any bug introduced in these modules would not be caught by CI.
- **Fix:** Add comprehensive test suites for each module. Minimum coverage targets: normalize.ts (50+ tests for all normalization branches and edge cases), aging.ts (boundary tests at 1.0x, 1.5x, 2.0x thresholds, negative elapsed, null shelfLife), activity.ts (all event types, null/missing metadata), apply.ts (all fragment targets, household edge cases, DB failure scenarios), schema.ts (parseDraft with malformed JSON, dropped fragments, question generation logic).

### 42. 🟠 `high` — CORS header allows wildcard origin with Bearer tokens
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:37-40`
- **Kanıt:** const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};
- **Etki:** The combination of 'Access-Control-Allow-Origin: *' with 'Access-Control-Allow-Headers: authorization' violates CORS security principles. While the worker requires Bearer token auth (preventing direct exploitation), this misconfiguration violates spec (RFC 6454) which prohibits wildcard origin with credentials/authorization headers. Any browser-based attacker can make requests on behalf of a victim if their session token leaks or is stored in an accessible location. Real-world scenario: an attacker's webpage could trick a user into clicking a link that makes fetch requests to this worker with the victim's token.
- **Fix:** Replace the wildcard origin with explicit Roomie app domain(s). If serving multiple clients, use a whitelist of allowed origins and validate against it: 'access-control-allow-origin': allowedOrigins.includes(origin) ? origin : 'false' (note: false as string, not null, to deny CORS per spec).

### 43. 🟠 `high` — Rate limiter uses per-isolate memory state, not per-user/account
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:22-35`
- **Kanıt:** // Per-isolate (resets on redeploy/idle).
const DAILY_CAP = 200;
let capDay = '';
let capCount = 0;

function overCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) {
    capDay = today;
    capCount = 0;
  }
  capCount += 1;
  return capCount > DAILY_CAP;
}
- **Etki:** The 200-call-per-day cap applies globally to the isolate, not per-user. A single leaked token (or any Roomie user) can exhaust the entire daily quota, blocking all other housemates. Additionally, the comment explicitly states it resets on redeploy/idle, meaning on quiet days the cap resets more frequently than once per calendar day. In practice, an attacker with one leaked token can burn 200 Groq calls (potentially €1.20+ in costs) before other residents notice they can't use Brain. Since this is a shared house app with real money implications, this is a denial-of-service against the household.
- **Fix:** Implement per-user rate limiting using Cloudflare Workers KV or Durable Objects, keyed by Clerk userId. Track daily call count per user separately. Consider also adding burst limiting (e.g., 5 calls/minute per user) to catch abuse faster.

### 44. 🟡 `medium` — Secondary text colors fail WCAG AA contrast in multiple contexts
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/constants/theme.ts:18,src/features/auth/auth-screen.tsx:265`
- **Kanıt:** Roomie.sub (#97897A): 3.18 contrast on canvas (fails 4.5 AA minimum for normal text, barely passes 3.0 minimum). Used for labels, secondary text, hints. linkLabel uses this color at 14px on canvas (3.18 ratio).
- **Etki:** Secondary information (instruction text, labels like 'Paid by', 'Split between') is difficult to read for users with color vision deficiency or low vision. Some text labeled 'link' quality but not actually interactive.
- **Fix:** Use a darker secondary color for normal body text, or increase Roomie.sub darkness by ~15-20% (target ~4.0+ contrast). Reserve current sub for hints/placeholders only.

### 45. 🟡 `medium` — Placeholder text colors hardcoded in multiple screens without theme consistency
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:209,216,src/features/household/household.tsx:145,203`
- **Kanıt:** Multiple files use hardcoded placeholderTextColor="#9b9b9b" instead of referencing Roomie theme constants. Creates maintenance burden and inconsistent contrast across the app.
- **Etki:** If placeholder color needs to be fixed for accessibility, requires changes in 4+ files. New developers may copy the incorrect hardcoded color pattern. Inconsistent placeholder experience across screens.
- **Fix:** Define placeholderTextColor in theme constants: export const placeholderColor = Roomie.sub (or darker). Import and use consistently: placeholderTextColor={Roomie.placeholderColor}.

### 46. 🟡 `medium` — Hardcoded secondary color (#c0392b) in money screen without theme integration
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:408,409`
- **Kanıt:** deleteLabel and error text use hardcoded #c0392b instead of Roomie.danger (#B5543B). Creates unmaintained color that may have different contrast characteristics.
- **Etki:** Delete button color and error messages use a different red than the rest of the app. Makes it harder to establish consistent danger/destructive action signaling. Maintenance burden if danger color needs updating.
- **Fix:** Replace #c0392b with Roomie.danger (#B5543B) in deleteLabel and error styles (line 408-409). Verify Roomie.danger contrast (4.20 on card, 4.58 on canvas) is acceptable.

### 47. 🟡 `medium` — TextInputs lack accessibility labels and hints for screen readers
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/auth/auth-screen.tsx:119-172,src/features/money/money-screen.tsx:206-220,src/features/kitchen/kitchen-screen.tsx:242-267`
- **Kanıt:** TextInput components use only placeholder text, no accessibilityLabel or accessibilityHint. Screen readers cannot distinguish between text inputs without visible labels. Example: password field has placeholder='Password' but no accessibility context.
- **Etki:** Screen reader users (blind/low vision) cannot distinguish input fields by context. They only hear 'text input' unless placeholder is read. Auth form becomes inaccessible; user doesn't know which field is username vs email vs password.
- **Fix:** Add accessibilityLabel to all TextInputs: <TextInput accessibilityLabel='Password' placeholder='Password' ... />. Consider adding accessibilityHint='Required' or accessibilityHint='Optional' for clarity.

### 48. 🟡 `medium` — Collapsible component lacks accessibility role and expand/collapse announcement
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/components/ui/collapsible.tsx:17-19`
- **Kanıt:** Pressable button that toggles collapsed state has no accessibilityRole='button', accessibilityExpanded, or accessibilityLabel. Screen reader users cannot tell if section is expanded or collapsed.
- **Etki:** Screen reader users don't know state of collapsible sections (open/closed) and don't get announcements when state changes. Reduces usability for blind/low-vision users exploring the app structure.
- **Fix:** Add to Pressable: accessibilityRole='button' accessibilityLabel={title} accessibilityExpanded={isOpen} accessibilityHint='Double tap to toggle'. VoiceOver/TalkBack will announce state changes.

### 49. 🟡 `medium` — No dynamic type / font scaling support for accessibility
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/constants/theme.ts,src/features/[all screens]`
- **Kanıt:** All font sizes are hardcoded (e.g., fontSize: 44, 34, 16, 14). No use of React Native's allowFontScaling={true}, maxFontSizeMultiplier, or accessibility size multipliers. Text will not scale with system font size preferences.
- **Etki:** Users who increase system font size for accessibility (large text accessibility setting) will see no benefit in Roomie. Text remains small and hard to read regardless of OS-level accessibility preferences.
- **Fix:** Add allowFontScaling={true} to all Text components (default in RN but confirm). Optionally add maxFontSizeMultiplier={1.5} to prevent excessive scaling on large-size-preference devices. Consider using AccessibilityInfo.isScreenReaderEnabled() to increase base font sizes.

### 50. 🟡 `medium` — Completely missing i18n/localization infrastructure for user-facing strings
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/[all screens], src/app/index.tsx`
- **Kanıt:** All user-facing text hardcoded in English throughout the codebase: 'Your turn', 'You owe', 'I'll get it', 'Got it ✓', 'Did it', 'Nothing on your plate', 'All quiet', 'You're the owner', 'Leave home', etc. No i18n library (react-i18next, expo-localization, etc.) configured.
- **Etki:** App is English-only. Non-English speaking roommates cannot use the app in their native language. Critical gap for a social/collaborative app used by real household groups of varying language backgrounds.
- **Fix:** Implement i18n: install i18next + react-i18next (or expo-localization). Create locales/{en,fr,de,tr,etc.}.json with all user strings. Wrap all hardcoded strings with i18n.t('key'). At minimum support: EN, Spanish, French, German, Turkish, Dutch.

### 51. 🟡 `medium` — Client accepts unvalidated LLM output without re-checking constraints
- **Boyut:** API request/response validation (`api-validation`)
- **Yer:** `src/features/brain/brain-input.tsx:60-61`
- **Kanıt:** setFragments(body.fragments); setQuestion(body.question); // No client-side validation that fragments match DraftFragment schema
- **Etki:** While server validates with zod, client performs no re-validation. If server validation is bypassed (via MITM attack on non-TLS connection, or server bug), invalid fragments could be written to database. For example, amountCents could exceed max(500 EUR) limit and create incorrect shared expenses.
- **Fix:** Add client-side zod validation of response before using: `const validated = draftResponseSchema.parse(body);` before accessing fragments

### 52. 🟡 `medium` — Utility functions incorrectly located in money-logic module
- **Boyut:** File structure & architecture (`architecture`)
- **Yer:** `src/features/money/money-logic.ts:72-80`
- **Kanıt:** export const nowMs = (): number => Date.now();

export function parseAmountToCents(input: string): number | null {
- **Etki:** Creates unnecessary cross-feature imports: tasks (nowMs), kitchen (nowMs, parseAmountToCents), and brain (both) import from money-logic despite these being general utilities unrelated to money logic. This couples unrelated features through a semantically incorrect module location.
- **Fix:** Extract nowMs and parseAmountToCents to src/lib/utils.ts, then update imports in: src/features/tasks/tasks-screen.tsx:31, src/features/kitchen/kitchen-screen.tsx:27, src/features/brain/apply.ts:14, src/features/brain/brain-input.tsx:13

### 53. 🟡 `medium` — Stale household snapshot in applyFragments - multiple pantry operations can race
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/apply.ts:34`
- **Kanıt:** const { data } = await db.queryOnce({
  households: {
    $: { where: { id: householdId } },
    memberships: { $: { where: { status: 'active' } }, user: {} },
    pantryItems: { claimedBy: {} },
    chores: { turn: {} },
  },
});
const household = data.households[0];

// Later in loop (line 69-71):
for (const f of fragments) {
  ...
  const existing = household.pantryItems.find(
    (it) => it.normalizedName === resolved.normalizedName,
  );
- **Etki:** If user says 'milk and bread' (2 fragments), the household snapshot is taken once. Between fragment 1 (milk) and fragment 2 (bread) processing, another roommate adds milk to the pantry. Fragment 2 still checks the stale snapshot, doesn't see the new milk, and creates a duplicate instead of updating the existing one. Results in two 'milk' entries with the same normalizedName.
- **Fix:** Either: (1) Re-query household state for each fragment in the loop, OR (2) Batch all fragments into a single transaction instead of sequential awaits, OR (3) Use a more granular snapshot refresh for pantry queries only

### 54. 🟡 `medium` — Stale items array in kitchen onAdd - concurrent add checks stale data
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:100`
- **Kanıt:** const items = [...household.pantryItems].sort((a, b) => a.name.localeCompare(b.name));
// ... later:
const onAdd = async () => {
  const resolved = resolveItem(typed);
  const existing = items.find((it) => it.normalizedName === resolved.normalizedName);  // Line 100 uses stale items
  if (existing) {
    if (existing.status === 'in') return;  // Check is stale
    await db.transact(db.tx.pantryItems[existing.id].update(...))
  }
- **Etki:** If another roommate adds the same item between component render and user pressing add, the check 'existing.status === 'in' at line 102 will pass even though it may have changed. Results in attempting to update an item that's already in pantry, or missing race condition where both roommates try to add the same item simultaneously.
- **Fix:** Query fresh household data inside onAdd before checking/updating: use 'const { data: fresh } = await db.queryOnce({ households: { $: { where: { id: household.id } }, pantryItems: { claimedBy: {} } } });' then search fresh.households[0].pantryItems instead of stale items

### 55. 🟡 `medium` — Shopping_add fragments logged with wrong activity type
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `src/features/brain/apply.ts:107-108`
- **Kanıt:** const toStatus = f.target === 'pantry_add' ? 'in' : 'out';
...
if (f.target === 'pantry_add') {
  await log('pantry_got', { item: resolved.name });
} else {
  await log('pantry_out', { item: resolved.name });
}
- **Etki:** Both pantry_out ('something ran out') and shopping_add ('we need X') fragments set status='out' and both log activity as 'pantry_out'. This conflates two different intents: immediate depletion vs future need. The activity feed will show identical log entries for semantically different actions, confusing housemates about what was actually communicated. The user sees "add to shopping list" in the brain draft but the activity feed later says "pantry is out".
- **Fix:** Create a new activity type 'shopping_needed' or 'shopping_add' (add to activity.ts ActivityType union), or distinguish in metadata by logging 'pantry_out' with source metadata. This preserves the semantic difference between 'ran out' and 'we need this'.

### 56. 🟡 `medium` — Misleading error message conflates brain parsing errors with apply failures
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `src/features/brain/brain-input.tsx:168`
- **Kanıt:** catch (e) {
  setErrorDetail((e as Error)?.message ?? String(e));
  setPhase('error');
}
...
{phase === 'error' ? (
  <Text style={styles.error}>
    Brain couldn&apos;t read that — nothing was saved.
- **Etki:** The error message 'Brain couldn't read that' is a hardcoded string from the brain WORKER parsing phase (onSend). But the catch block at line 89 catches errors from applyFragments (database write failures, network errors, etc.). When apply fails, the user sees a message about the brain not parsing, not about the write failure. This is confusing about whether the problem was understanding the input or saving it.
- **Fix:** Distinguish error sources. Add error type context: if applyFragments throws, set a different error state (e.g., phase='apply_error') or include error metadata indicating the source. Show different messages: 'Brain couldn't read that' for parse errors (from onSend catch), 'Couldn't save — try again' for apply errors.

### 57. 🟡 `medium` — Duplicate emailName function across three screens
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:37-41, src/features/money/money-screen.tsx:33-36, src/features/kitchen/kitchen-screen.tsx:34-38`
- **Kanıt:** // "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

This identical function is defined in three separate feature screens.
- **Etki:** Code duplication creates maintenance burden. If the email parsing logic needs to change (e.g., handle new email formats), it must be updated in three places, increasing risk of inconsistency. Makes refactoring harder.
- **Fix:** Extract emailName to a shared utility file (e.g., src/utils/email.ts or src/lib/naming.ts) and import it in all three screens: tasks-screen.tsx, money-screen.tsx, kitchen-screen.tsx.

### 58. 🟡 `medium` — Duplicate Centered component across three screens
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:369-375, src/features/kitchen/kitchen-screen.tsx:347-352, src/features/money/money-screen.tsx:326-331`
- **Kanıt:** function Centered({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>{children}</View>
    </SafeAreaView>
  );
}

Identical error/loading state layout component in three screens.
- **Etki:** Duplicated UI component increases bundle size and maintenance burden. If loading/error styling needs to be unified across the app, changes must be made in three places. Violates DRY principle.
- **Fix:** Extract Centered to src/components/Centered.tsx and import in all three screens.

### 59. 🟡 `medium` — Households and memberships lack proper scoping - invite codes enumerable
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:26-37 and src/features/household/household.tsx:170-176`
- **Kanıt:** households and memberships entities have no permission rules. JoinHousehold uses db.queryOnce({ households: { $: { where: { id: trimmed } } } }) (line 170-171) to verify a household exists before joining. Without permissions, any user can enumerate household IDs or query all households to find ones they're not in.
- **Etki:** Users can discover household IDs and names, potentially allowing them to join homes they shouldn't have access to if they guess invite codes. Less critical than data leaks, but enables further social engineering. Household names could reveal private information (e.g., "Serra's Dorm Room").
- **Fix:** Add permission rules for households and memberships. Households should allow viewing only for members; memberships should allow viewing only for users in that household or the user being represented:
```typescript
households: {
  allow: {
    view: "auth.id in data.ref('memberships.user.id')"
  }
},
memberships: {
  allow: {
    view: "auth.id == data.ref('user.id') || auth.id in data.ref('household.memberships.user.id')"
  }
},
```

### 60. 🟡 `medium` — Async kitchen onBridgeConfirm without error handling
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:181-212`
- **Kanıt:** const onBridgeConfirm = async () => {
  // No try/catch around db.transact calls
}
- **Etki:** If the expense creation from kitchen bridge fails, the error is silently swallowed and bridge UI state becomes inconsistent.
- **Fix:** Add try/catch and error state to onBridgeConfirm

### 61. 🟡 `medium` — Potential data loss due to missing error handling on optional kitchen unlink operation
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:103-107`
- **Kanıt:** await db.transact(
  db.tx.pantryItems[existing.id]
    .update({ status: 'in', addedAt: now, updatedAt: now })
    .unlink({ claimedBy: existing.claimedBy?.id ?? '' }),
);
- **Etki:** If existing.claimedBy?.id is undefined/empty string, the unlink attempt with empty string may fail silently. The item status is updated but not unlinked from the claimer.
- **Fix:** Check if claimedBy?.id exists before unlinking: `.unlink(existing.claimedBy?.id ? { claimedBy: existing.claimedBy.id } : undefined)`

### 62. 🟡 `medium` — Duplicate emailName utility function across three screen files
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:38, /Users/serrayildirim/roomie/src/features/money/money-screen.tsx:33, /Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:35`
- **Kanıt:** Identical function: function emailName(email?: string): string | undefined { const local = email?.split('@')[0]?.replace(/\+.*$/, ''); return local || undefined; } - appears in all three files with identical implementation
- **Etki:** Code duplication violates DRY principle; maintenance burden if the email parsing logic needs to change; increases bundle size
- **Fix:** Extract emailName function to a shared utility module (e.g., src/lib/email-utils.ts or src/features/common-utils.ts) and import it in all three screen files

### 63. 🟡 `medium` — Index-as-key in acknowledgement messages list
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:159`
- **Kanıt:** ack.map((line, i) => { ... <Text key={i} ... }) — using index i as key for ack messages
- **Etki:** Ack messages are appended sequentially (applied items then skipped items), so reordering is unlikely. However, index-as-key is still an anti-pattern and violates React best practices. If ack messages were ever filtered or reordered, component state would corrupt.
- **Fix:** Make each string in ack unique (e.g., prepend an incrementing counter or UUID at construction) and use that as key, or refactor ack to store objects: `{ id: unique, message: string }` and key by id.

### 64. 🟡 `medium` — Inefficient O(n) array.includes() call in render loop
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:242`
- **Kanıt:** In the 'Split between' chip row, participantIds.includes(m.userId) is called for every member in members.map(). This is O(n) per chip, resulting in O(n²) total for checking all participants.
- **Etki:** With many household members (e.g., 5+), every render triggers quadratic checking to determine which chips are selected. This causes noticeable jank when typing amounts or switching between payers, especially on slower devices.
- **Fix:** Convert participantIds to a Set before the render loop: `const participantSet = new Set(participantIds);` at the top of MoneyScreen, then use `participantSet.has(m.userId)` in the map, which is O(1) per check.

### 65. 🟡 `medium` — Potential excessive effect re-runs due to getToken dependency
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/instant-clerk-bridge.tsx:40`
- **Kanıt:** useEffect dependency array includes getToken, which is obtained from useClerkAuth(). If getToken is a new function reference on every parent render, the effect will run on every render even if isSignedIn and user haven't changed.
- **Etki:** Causes repeated attempts to sign into InstantDB and unnecessary async work, potentially spamming network calls and delaying auth completion. This will create warning logs and unnecessary InstantDB query re-subscriptions.
- **Fix:** Either: (1) Remove getToken from dependencies if it's stable, or (2) Wrap getToken call with useCallback inside the effect, or (3) Move the async logic into a separate useCallback that's not a dependency, or (4) Use useMemo to stabilize getToken reference in the caller.

### 66. 🟡 `medium` — Missing cleanup for setTimeout in HouseholdHome
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/household/household.tsx:236`
- **Kanıt:** onCopy function calls setTimeout(() => setCopied(false), 1500) without storing the timer ID or cleaning it up. If the component unmounts during the timeout, setCopied will be called after unmount.
- **Etki:** Warning in React: 'Can't perform a React state update on an unmounted component.' This will not crash the app but indicates a memory leak pattern and logs noise to the console. With multiple rapidly unmounting/remounting scenarios, could accumulate pending timeouts.
- **Fix:** Store the timeout ID and clear it on unmount: Use useEffect to wrap the setTimeout and return a cleanup function: `useEffect(() => { const t = setTimeout(...); return () => clearTimeout(t); }, [...])`

### 67. 🟡 `medium` — Departed member credit lost in chore history
- **Boyut:** Tasks rotation fairness (`tasks-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:264`
- **Kanıt:** const nameById = Object.fromEntries(orderedMembers.map((m) => [m.userId, m.name])); // line 96, built from ACTIVE members only

{ev.by?.id === userId ? 'You' : (nameById[ev.by?.id ?? ''] ?? 'Someone')} // line 264

Query at line 48: memberships: { $: { where: { status: 'active' } }, user: {} },

This loads only ACTIVE memberships. When a member leaves (status='removed'), they are excluded from the query. When displaying chore history, if the person who did the chore has left the household, their name is not in nameById, so it displays 'Someone' instead of their actual name.
- **Etki:** Violates the fairness rule 'credit goes to the doer'. When a household member leaves after contributing to chores, their credit vanishes from the history. Subsequent viewers see 'Someone did it' instead of the actual member's name. This breaks accountability and erases the departed member's contributions from the household record.
- **Fix:** Load all memberships (active AND removed) for the purpose of name lookup in history display. Modify line 48 to remove the status filter, then filter when needed for turn assignment logic. Alternatively, store the doer's displayName in choreEvent at creation time to preserve historical credit.

### 68. 🟡 `medium` — fragmentLine() has no exhaustiveness check and missing return
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/brain/types.ts:32-47`
- **Kanıt:** export function fragmentLine(f: DraftFragment): string {
  switch (f.target) {
    case 'expense':
      return `💸 ${f.title} — €${((f.amountCents ?? 0) / 100).toFixed(2)} · you paid · split with everyone`;
    ...
  }
}
No default case and no final return statement; if target somehow doesn't match any case, returns undefined instead of string.
- **Etki:** Type system promises a string return but function can return undefined, breaking caller expectations. Additionally, fragmentLine is exported for brain/types but untested—if title/item/chore are undefined at runtime despite zod validation, template strings render 'undefined' text.
- **Fix:** Add explicit default/exhaustiveness check: either `throw new Error()` or `return '• unknown fragment'`; also validate at call site that fragments passed to fragmentLine come from parseDraft validation.

### 69. 🟡 `medium` — ageOf() silent behavior when nowMs < addedAtMs (clock skew)
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/kitchen/aging.ts:49-53`
- **Kanıt:** const elapsedDays = (nowMs - addedAtMs) / MS_PER_DAY;
  if (elapsedDays < shelfLifeDays) return 'fresh';
  if (elapsedDays < shelfLifeDays * 1.5) return 'faded';
  if (elapsedDays < shelfLifeDays * 2.0) return 'still_here_prompt';
  return 'should_archive';
- **Etki:** If device clock goes backward (or user manually changes time), nowMs < addedAtMs results in negative elapsedDays. The first condition `elapsedDays < shelfLifeDays` always true (negative < positive), so ageOf returns 'fresh'. This is conservative but untested and not documented. Items would never age backward to 'fresh' which could hide staleness.
- **Fix:** Add explicit guard: `if (elapsedDays < 0) return 'fresh';` with a comment explaining clock skew handling, or test this edge case explicitly with negative elapsed times.

### 70. 🟡 `medium` — Duplicated EUR currency formatting logic across 4 files
- **Boyut:** Reinvented wheels (`wheel-reinvention`)
- **Yer:** `src/features/activity/activity.ts:34, src/features/brain/types.ts:35, src/features/brain/apply.ts:63, src/features/money/money-logic.ts:66-68`
- **Kanıt:** The same currency formatting pattern `€${(cents / 100).toFixed(2)}` appears in:
1. activity.ts line 34: `return Number.isFinite(cents) ? €${(cents / 100).toFixed(2)} : '';`
2. brain/types.ts line 35: `return €${((f.amountCents ?? 0) / 100).toFixed(2)}`
3. brain/apply.ts line 63: `applied.push(€${(f.amountCents / 100).toFixed(2)}`
4. money-logic.ts line 67: `return €${(cents / 100).toFixed(2)};` (the exported formatEur function)

The first three locations are inlined duplicates that should use the formatEur export.
- **Etki:** Code duplication in money-handling context creates maintenance burden. If the currency format needs to change (e.g., symbol placement, decimal precision), it must be updated in 4 places instead of 1. Consistency risk for roommates seeing different formatting in activity feed vs. brain suggestions. No functional bug, but clear DRY violation.
- **Fix:** Import and reuse formatEur from money-logic.ts in activity.ts, brain/types.ts, and brain/apply.ts instead of inlining the calculation. Replace:
- activity.ts line 34: `return Number.isFinite(cents) ? formatEur(cents) : '';`
- brain/types.ts line 35: `return €${formatEur(f.amountCents ?? 0).slice(1)} ...` or create a formatAmountCents helper
- brain/apply.ts line 63: `applied.push(€${formatEur(f.amountCents)}`

### 71. 🟡 `medium` — Rate limiter uses UTC date boundaries, not user-local midnight
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:28-32`
- **Kanıt:** const today = new Date().toISOString().slice(0, 10);
if (today !== capDay) {
  capDay = today;
  capCount = 0;
}
- **Etki:** The rate limiter resets at UTC midnight (00:00 UTC), not at local midnight. For a household in a timezone like CET (+01:00), the daily cap resets at 01:00 local time, not 00:00. This is a minor confusion/usability issue (users expect midnight reset in their timezone), but more importantly, it makes the behavior unpredictable across different deployment regions if the worker placement changes.
- **Fix:** Store capDay as an ISO date string keyed per-user in KV. When moving to per-user rate limiting, use the user's local timezone to compute 'today' (via IANA timezone data or browser submission), or accept UTC consistently and document it.

### 72. ⚪ `low` — Secondary text contrast marginally acceptable, risking WCAG compliance edge cases
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/constants/theme.ts:18`
- **Kanıt:** Roomie.sub (#97897A) on Roomie.canvas (#FBF7F0) achieves 3.18:1 contrast. WCAG AA for normal text requires 4.5:1, for large (18pt+) requires 3:1. Roomie.sub text is typically 12-14px, below large text threshold.
- **Etki:** Margin for compliance is very tight (3.18 vs 3.0 minimum for 14pt). On some displays or with color vision deficiency, text may become unreadable. Not yet a failure but risky.
- **Fix:** Darken Roomie.sub to ~3.8+ contrast minimum, or use semantic colors (e.g., textSecondary that adapts by mode). Test with color blindness simulators (Coblis, Color Blindness Simulator).

### 73. ⚪ `low` — Empty LLM response causes generic failure instead of explicit handling
- **Boyut:** API request/response validation (`api-validation`)
- **Yer:** `workers/brain/src/index.ts:66`
- **Kanıt:** const { draft, dropped } = parseDraft(choice.message.content ?? '');
- **Etki:** If Groq returns null content (unlikely but possible), fallback to empty string causes JSON.parse('') to throw SyntaxError. This falls through to Cloudflare fallback (correct behavior) but wastes a request. The real issue is no explicit handling of null content case.
- **Fix:** Check content explicitly: if (!choice.message.content) { throw new Error('empty response'); } instead of relying on ?? '' fallback

### 74. ⚪ `low` — Truthy check for amountCents is brittle to future schema changes
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `src/features/brain/apply.ts:56`
- **Kanıt:** if (f.target === 'expense' && f.title && f.amountCents) {
- **Etki:** The condition uses JavaScript's falsy coercion. While the current schema ensures amountCents > 0 when present, 0 is falsy. If schema requirements ever change to allow zero-amount expenses (e.g., for logging), the code would silently skip them. The fragment would not apply and would be reported as 'couldn't place: expense'.
- **Fix:** Use explicit null/undefined check: replace 'f.amountCents' with 'f.amountCents != null' to decouple from numeric truthiness. This makes intent clearer and more resilient to future schema changes.

### 75. ⚪ `low` — Hardcoded color values not using theme constants
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:209-216 (placeholderTextColor), 403 (settleLabel color), 408 (expenseMeta color), 408-409 (deleteLabel, error colors); src/features/household/household.tsx:145, 203, 302`
- **Kanıt:** placeholderTextColor="#9b9b9b" (lines 209, 216 in money-screen.tsx, lines 145, 203 in household.tsx)
settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' } (line 403)
expenseMeta: { fontSize: 12, color: '#9b9b9b' } (line 406)
deleteLabel: { fontSize: 15, color: '#c0392b' } (line 408)
error: { color: '#c0392b', fontSize: 14 } (line 409)
- **Etki:** Hardcoded hex colors bypass the theme system defined in src/constants/theme.ts (Roomie color constants). If the design system needs to change, these hardcoded values won't update. Inconsistent with the rest of the codebase which uses Roomie.sub, Roomie.danger, etc.
- **Fix:** Replace hardcoded colors with theme constants: #9b9b9b → Roomie.sub, #fff → Roomie.onAccent, #c0392b → Roomie.danger. Check money-screen.tsx lines 209, 216, 403, 406, 408-409 and household.tsx lines 145, 203, 302.

### 76. ⚪ `low` — Inline fontWeight string instead of theme font family
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:403`
- **Kanıt:** settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' }
- **Etki:** Uses inline fontWeight: '600' instead of the theme's font family constants (RoomieFonts.bodySemi, RoomieFonts.bodyBold). Inconsistent with the rest of the codebase and breaks theme abstraction.
- **Fix:** Replace fontWeight: '600' with fontFamily: RoomieFonts.bodySemi to match the theme pattern used elsewhere.

### 77. ⚪ `low` — Repeated nameById lookup with fallback pattern
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:229, 264; src/features/kitchen/kitchen-screen.tsx:292; src/features/money/money-screen.tsx:279-280, 305`
- **Kanıt:** nameById[holderId ?? ''] ?? 'someone' (tasks-screen.tsx line 229)
nameby[ev.by?.id ?? ''] ?? 'Someone' (tasks-screen.tsx line 264)
nameById[claimerId] (kitchen-screen.tsx line 292)
nameById[d.toId] (money-screen.tsx line 280)
- **Etki:** The pattern nameById[id ?? ''] ?? 'fallback' is used repeatedly across multiple screens without a helper function. Creates cognitive load and increases risk of inconsistent fallback handling across features.
- **Fix:** Create a helper function like `getDisplayName(id: string | null | undefined, nameById: Record<string, string>, fallback = 'Someone'): string` in a shared utilities file and use it consistently.

### 78. ⚪ `low` — Inconsistent currency formatting in brain fragment display
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/brain/types.ts:35, src/features/brain/apply.ts:63, src/features/activity/activity.ts:34, src/features/money/money-logic.ts:67`
- **Kanıt:** types.ts line 35: `€${((f.amountCents ?? 0) / 100).toFixed(2)}`
apply.ts line 63: `€${(f.amountCents / 100).toFixed(2)}`
activity.ts line 34: `€${(cents / 100).toFixed(2)}`
money-logic.ts line 67 (formatEur): `€${(cents / 100).toFixed(2)}`
- **Etki:** Currency formatting is duplicated across four files with inline calculations. The single source of truth (formatEur in money-logic.ts) exists but isn't used everywhere. Maintenance burden if currency formatting needs to change.
- **Fix:** Use the formatEur utility from money-logic.ts in apply.ts and types.ts instead of inline calculations. Import and call formatEur(amountCents) consistently.

### 79. ⚪ `low` — Magic number 999 for borderRadius instead of named constant
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:427; src/features/money/money-screen.tsx:366`
- **Kanıt:** turnPill: { borderRadius: 999, ... } (tasks-screen.tsx line 427)
chip: { borderRadius: 999, ... } (money-screen.tsx line 366)
- **Etki:** The magic number 999 is used to create pill-shaped (fully rounded) buttons. No explanation of why 999 is chosen, making code less maintainable. If design system needs to define a standard pill radius, this isn't captured.
- **Fix:** Extract a constant like PILL_BORDER_RADIUS = 999 or define it as a design system constant in theme.ts, or use a descriptive comment explaining that 999 creates a fully rounded pill shape.

### 80. ⚪ `low` — Object.fromEntries followed by immediate lookups
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:82-90`
- **Kanıt:** const members = household.memberships
    .map((m) => ({ ... }))
    .filter((m) => m.userId);
const nameById = Object.fromEntries(members.map((m) => [m.userId, m.name]));

Then immediately: nameById[userId] ?? 'You'
- **Etki:** The transformation memberships → members → nameById is a three-step pipeline. The intermediate `members` array is then discarded after building nameById, but earlier it was used for .map(m => m.userId). Slightly inefficient and unclear intent.
- **Fix:** Consider building nameById directly from household.memberships in one step to reduce intermediate variables and improve clarity of intent.

### 81. ⚪ `low` — Unused View import in auth-screen.tsx
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:21`
- **Kanıt:** View is imported from 'react-native' on line 21 but never used in the component render
- **Etki:** Dead import adds noise to the codebase; linter already flagged this
- **Fix:** Remove 'View' from the import statement on line 13-22

### 82. ⚪ `low` — Unused container stylesheet in animated-icon.web.tsx
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `/Users/serrayildirim/roomie/src/components/animated-icon.web.tsx:76-82`
- **Kanıt:** const styles = StyleSheet.create({ container: {...}, ... }); - container style is defined but never referenced in styles usage
- **Etki:** Dead style definition wastes code size; no functional impact
- **Fix:** Remove the unused 'container' style object from the StyleSheet.create call (lines 76-82)

### 83. ⚪ `low` — Unused lightColor and darkColor props in ThemedView component
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `/Users/serrayildirim/roomie/src/components/themed-view.tsx:12`
- **Kanıt:** Function signature: export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }). lightColor and darkColor are destructured from props but never used in the function body (line 15 only uses theme[type] for backgroundColor)
- **Etki:** Props accepted in type definition but ignored in implementation; dead parameters add confusion about the component's actual capabilities
- **Fix:** Remove 'lightColor' and 'darkColor' from the function destructuring and from ThemedViewProps type definition (lines 7-8)

### 84. ⚪ `low` — Hardcoded color #fff instead of Roomie.onAccent in money-screen.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:403`
- **Kanıt:** settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' }
- **Etki:** In dark mode or theme changes, the settle button label will remain white (#fff) instead of respecting the theme's onAccent color. Maintainability: hardcoded color breaks the design system consistency.
- **Fix:** Change line 403 to: settleLabel: { color: Roomie.onAccent, fontSize: 13, fontFamily: RoomieFonts.bodyBold }

### 85. ⚪ `low` — Hardcoded color #9b9b9b instead of Roomie.sub in money-screen.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:406`
- **Kanıt:** expenseMeta: { fontSize: 12, color: '#9b9b9b' }
- **Etki:** Secondary text color for expense metadata will not respond to theme changes or the design system. Breaks consistency with the rest of the app which uses Roomie.sub.
- **Fix:** Change line 406 to: expenseMeta: { fontSize: 12, color: Roomie.sub }

### 86. ⚪ `low` — Hardcoded color #c0392b instead of Roomie.danger in money-screen.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:408-409`
- **Kanıt:** deleteLabel: { fontSize: 15, color: '#c0392b' },
error: { color: '#c0392b', fontSize: 14 }
- **Etki:** Delete and error labels will use a hardcoded red that does not match the design system's defined danger color (Roomie.danger = '#B5543B'). Breaks visual consistency.
- **Fix:** Change lines 408-409 to: deleteLabel: { fontSize: 15, color: Roomie.danger },
error: { color: Roomie.danger, fontSize: 14 }

### 87. ⚪ `low` — Hardcoded colors #fff and #9b9b9b in money.tsx instead of theme constants
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/app/money.tsx:12-14`
- **Kanıt:** <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <Text style={{ color: '#9b9b9b' }}>Sign in first.</Text>
- **Etki:** The unsigned-in fallback screen for Money tab uses hardcoded colors instead of the Roomie theme. Breaks consistency across the app - tasks.tsx and kitchen.tsx correctly use Roomie.canvas and Roomie.sub.
- **Fix:** Change lines 12-14 to: backgroundColor: Roomie.canvas for the SafeAreaView and color: Roomie.sub for the Text

### 88. ⚪ `low` — Hardcoded placeholder colors #9b9b9b instead of Roomie.sub throughout auth-screen.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:122,147,157,168`
- **Kanıt:** placeholderTextColor="#9b9b9b" appears 4 times in TextInput components
- **Etki:** Placeholder text colors do not respect the Roomie theme system. While #9b9b9b matches Roomie.sub visually, using hardcoded values breaks design system maintainability and prevents future theme changes from applying universally.
- **Fix:** Change all occurrences of placeholderTextColor="#9b9b9b" to placeholderTextColor={Roomie.sub}

### 89. ⚪ `low` — Hardcoded placeholder colors #9b9b9b in money-screen.tsx instead of Roomie.sub
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:209,216`
- **Kanıt:** placeholderTextColor="#9b9b9b" appears twice in TextInput components
- **Etki:** Inconsistent with other screens that properly use Roomie.sub. Breaks design system adherence.
- **Fix:** Change both occurrences of placeholderTextColor="#9b9b9b" to placeholderTextColor={Roomie.sub}

### 90. ⚪ `low` — Hardcoded white color #fff for ActivityIndicator instead of Roomie.onAccent
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:265`
- **Kanıt:** <ActivityIndicator color="#fff" />
- **Etki:** ActivityIndicator color hardcoded to white. Should use Roomie.onAccent to respect theme and match other buttons (auth-screen.tsx, household.tsx use #fff inconsistently too).
- **Fix:** Change line 265 to: color={Roomie.onAccent}

### 91. ⚪ `low` — Hardcoded font weight instead of fontFamily in money-screen.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:403`
- **Kanıt:** settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' }
- **Etki:** Uses raw fontWeight instead of fontFamily (RoomieFonts.bodyBold). Inconsistent with design system - all other text uses fontFamily properties with the defined font constants.
- **Fix:** Change fontWeight: '600' to fontFamily: RoomieFonts.bodyBold on line 403

### 92. ⚪ `low` — timeAgo() silent behavior with future timestamps (negative seconds)
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/activity/activity.ts:133-143`
- **Kanıt:** export function timeAgo(value: number | string): string {
  const ts = typeof value === 'number' ? value : new Date(value).getTime();
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (Number.isNaN(seconds) || seconds < 45) return 'just now';
  ...
- **Etki:** If value is a future timestamp, seconds becomes negative. The check `Number.isNaN(seconds)` is false (seconds is a valid number), so it falls through to `seconds < 45` which is true (negative < 45), returning 'just now'. This is arguably correct behavior (future event = 'just now'), but untested and silently handles the case without documentation.
- **Fix:** Either add test for future timestamps, or add comment explaining that negative seconds (future timestamps) intentionally return 'just now'. Consider adding explicit guard: `if (seconds < 0) return 'just now';` for clarity.

### 93. ⚪ `low` — Unauthenticated /health endpoint leaks worker existence and operational status
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:99`
- **Kanıt:** if (url.pathname === '/health') return json({ ok: true });
- **Etki:** While minor, an unauthenticated /health endpoint reveals that the worker is running and operational. Combined with public Roomie deployment URLs, this is reconnaissance information for attackers. In a shared-house context with limited resources, this is low priority, but health checks should either require auth or be behind a separate, private monitoring URL.
- **Fix:** Either require Bearer token auth for /health, or move health checks to a separate internal endpoint / Cloudflare Workers analytics. If health checks must be public, return generic success without operational data.

### 94. ⚪ `low` — Bearer token extraction does not reject malformed Authorization headers
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:105-106`
- **Kanıt:** const auth = request.headers.get('authorization') ?? '';
const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
- **Etki:** If the Authorization header is present but malformed (e.g., 'Bearer' with no space or token, or 'bearer xxx' in lowercase), the code silently falls back to empty string and treats it as unauthorized. While this is fail-closed behavior (which is good), it may mask deployment issues (e.g., a misconfigured client sending 'bearer' in lowercase would silently fail). Low severity since auth still works correctly, but poor observability.
- **Fix:** Add explicit validation and logging: if Authorization header is present but doesn't match Bearer scheme, log a warning. Consider accepting case-insensitive Bearer prefix or document the strict requirement.

