# Roomie Audit — Round 2 (raw findings)

_Tarih: 2026-06-14 · Bağımsız tur 2/3 · 20 boyut · bu tur diğer turlardan habersiz yapıldı._

> Bu ham tur çıktısıdır. Güven puanı (3 tur kaç kez buldu) ve çapraz-eleme **sadece** [`AUDIT_REPORT.md`](./AUDIT_REPORT.md)'tedir. Buradaki bulgular önem (severity) sırasına dizilidir.

**Bu turda:** 92 bulgu — 🔴 8 critical · 🟠 26 high · 🟡 34 medium · ⚪ 24 low

---

### 1. 🔴 `critical` — Race condition in chore rotation when multiple users advance simultaneously
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:172-194`
- **Kanıt:** const advance = async (...holderId: string | null...) => {
  const next = nextTurn(memberIds, holderId);
  await db.transact([
    db.tx.chores[choreId].update({ updatedAt: ts }).link({ turn: next ?? userId }),
    ...
  ]);
}

The 'Done ✓' button (line 240-244) is available to everyone, not just the turn holder. When two people tap Done simultaneously, both read the same 'holderId' from the render-time snapshot, both calculate the same 'next' value, and both execute transacts with identical next values. This causes turn rotation to skip a person or behave unpredictably.
- **Etki:** In a household of 3+ people, if two users advance a chore concurrently, the turn may not rotate correctly (e.g., Alice's turn → Bob's turn → Bob's turn again, skipping Charlie). This breaks the fairness contract of the rotation system and causes workload imbalance. With frequent concurrent usage, some users could avoid chores.
- **Fix:** The advance function should fetch the current chore state server-side before calculating next, not rely on render-time closures. Alternatively, use Instant's server-side transaction logic to atomically read-then-update, or add optimistic locking/versioning to detect conflicts and retry with fresh state.

### 2. 🔴 `critical` — Confirm button not disabled during apply, allowing duplicate writes on double-tap
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:146`
- **Kanıt:** The Pressable component at line 146 has no disabled prop:
```tsx
<Pressable style={styles.confirm} onPress={onConfirm}>
  <Text style={styles.confirmLabel}>Confirm ✓</Text>
</Pressable>
```

In contrast, the send button (line 109) properly disables during 'thinking': `disabled={phase === 'thinking'}`.

The onConfirm function (line 73) sets phase to 'applying' at line 80, then awaits the async applyFragments call. During this await, if the user rapid-taps Confirm, the button is still enabled and onConfirm will be called again, executing the async apply with the same fragments concurrently.
- **Etki:** A user who double-taps the Confirm button will trigger two concurrent calls to applyFragments with identical data. Since expenses (line 58), chores (line 132), and personal tasks (line 141) all use db.tx[type][id()] to generate new IDs, this will create duplicate records in the database:
- Two separate expense records with same title/amount
- Two choreEvent records for the same chore completion
- Two personal task records

Pantry items are deduplicated by normalizedName, but purchases will be duplicated (line 102-104). This is data integrity violation for a real-money shared-house app where expenses directly affect cost splitting.
- **Fix:** Add `disabled={phase === 'applying'}` to the Pressable at line 146, matching the pattern used for the send button at line 109.

### 3. 🔴 `critical` — All non-$users entities have zero permission scoping - world-readable/writable to any authenticated user
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21`
- **Kanıt:** const rules = { $users: { allow: { view: "auth.id == data.id || auth.id in data.ref('memberships.household.memberships.user.id')" } } }; — Only $users has a rule. All other entities (expenses, settlements, pantryItems, chores, choreEvents, personalTasks, purchases, activityEvents, households, memberships, profiles, activityEvents) have zero permission rules defined.
- **Etki:** In InstantDB, entities without rules default to ALLOW for all authenticated users. Any logged-in user can read and write ALL household data from ALL households in the system — seeing other households' expenses, debts, pantry items, chores, tasks, activity. For a real-money app, this is a complete privacy and data-integrity breach: Alice can see and modify Bob's house's spending, Bob can view (and change) Alice's chores/tasks, anyone can tamper with any household's activity feed.
- **Fix:** Define `allow.view` and `allow.create/update/delete` rules for each entity type, scoping to household membership. Pattern: `allow.view: "auth.id in data.ref('household.memberships.user.id')"` for entities with a household link; similar pattern for write operations. Apply to: expenses, settlements, pantryItems, chores, choreEvents, personalTasks, purchases, activityEvents, households, memberships, profiles. Define a single household-scoped template and apply consistently to all multi-household entities.

### 4. 🔴 `critical` — settlements entity has no scoping - any user can read/write settlement history across all households, including modifying past debts
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:54-59`
- **Kanıt:** settlements entity at instant.schema.ts:54-59 links to household, fromUser, toUser. No rules defined. Code at money-screen.tsx:185-188 writes settlements without checking if caller is in the household: `db.tx.settlements[settlementId].update({ amountCents, currency: 'EUR', createdAt: nowMs() }).link({ household: household.id, fromUser: fromId, toUser: toId })`. Any authenticated user can create fake settlement records in any household.
- **Etki:** Money tamper attack: attacker can forge settlement records in victim household (e.g., write 'Bob paid Alice €500') without victim knowledge, corrupting the debt ledger. Attacker can read entire settlement history of all households, including sensitive payment amounts and timing. Combined with no update/delete rules, attacker can erase or modify past settlements to hide their own tampering.
- **Fix:** Add rule: `settlements: { allow: { view: "auth.id in data.ref('household.memberships.user.id')", create: "auth.id in data.ref('household.memberships.user.id')", update: false, delete: false } }` (settlements immutable once created). If updates needed, restrict to creator or owner: `auth.id == data.ref('fromUser.id') && data.createdAt > <recent_threshold>`.

### 5. 🔴 `critical` — expenses entity has no scoping - any user can read/write expenses across all households, corrupting shared money calculations
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:46-52`
- **Kanıt:** expenses entity at instant.schema.ts:46-52 links to household, paidBy, participants (many users). No rules defined. Code at money-screen.tsx:134-141 writes without server-side household check: `db.tx.expenses[expenseId].update({ ... }).link({ household: household.id, paidBy: payerId, participants: participantIds })`. Money calculations at money-logic.ts compute nets from all expenses visible to the user — if attacker adds fake expenses or deletes real ones, the debt calculations ($computeNetCents) break.
- **Etki:** Core money-calculation attack: attacker can inject false expenses into any household (e.g., '€1000 groceries' paid by victim) to create fake debts. Attacker can delete real expenses to erase victim's actual payments. Attackers in household A can alter household B's expense ledger, causing incorrect settlements. For a real-money app, this is direct financial fraud. The entire fairness proposition ("is everyone paying their share?") collapses.
- **Fix:** Add rule: `expenses: { allow: { view: "auth.id in data.ref('household.memberships.user.id')", create: "auth.id in data.ref('household.memberships.user.id')", update: false, delete: "auth.id == data.ref('paidBy.id') && data.createdAt > <recent_threshold> && data.ref('participants').length == 0" (only creator can delete shortly after), delete: false (default: immutable) } }` — expenses are an audit trail and must not be casually editable/deletable.

### 6. 🔴 `critical` — Critical: Expense paidBy user removal causes money to disappear from household accounting
- **Boyut:** Money debt/settlement math (`money-correctness`)
- **Yer:** `src/features/money/money-logic.ts:25-28`
- **Kanıt:** if (e.paidById in net) net[e.paidById] += e.amountCents; // payer fronted the whole amount
e.participantIds.forEach((pid, idx) => {
  if (pid in net) net[pid] -= baseShare + (idx < remainder ? 1 : 0);
});
- **Etki:** When a user leaves a household, their membership becomes 'removed' and InstantDB breaks the paidBy link to null. money-screen.tsx converts this to empty string (line 95: `paidById: e.paidBy?.id ?? ''`). computeNetCents receives an empty string which is not in the members list, so the payer credit on line 25 is silently skipped. The full expense amount is never credited to any household member. For example: €300 paid by person A split 3 ways should result in balances +€200/-€100/-€100, but after A leaves, it becomes -€100/-€100 (total -€200 instead of 0). The €300 is permanently lost from the household's money accounting.
- **Fix:** Filter expenses to only include those where paidBy is in the current members list before passing to computeNetCents, OR validate in computeNetCents that paidById is in net before processing and error if not, OR reconstruct the expense by distributing the payer's amount across remaining participants.

### 7. 🔴 `critical` — Critical: Settlement participants removal causes payment settlements to disappear
- **Boyut:** Money debt/settlement math (`money-correctness`)
- **Yer:** `src/features/money/money-logic.ts:31-34`
- **Kanıt:** for (const s of settlements) {
  if (s.fromId in net) net[s.fromId] += s.amountCents; // paying someone back clears your debt
  if (s.toId in net) net[s.toId] -= s.amountCents;
}
- **Etki:** When a user is removed from a household, settlement records referencing them (fromUser or toUser) have broken links that become null. money-screen.tsx converts these to empty strings (lines 100-101). computeNetCents receives empty strings which are not in members, so both the fromId credit and toId debit on lines 32-33 are silently skipped. A payment that actually occurred is completely erased from the balance calculation. For example: if person B settles €100 to person A, then B is removed, the €100 payment is forgotten and A's balance is incorrectly €100 too high, while B's missing presence makes their debt appear to vanish.
- **Fix:** Filter settlements to only include those where both fromId and toId are in the current members list before passing to computeNetCents, OR validate in computeNetCents that both participants are in net before processing and error if not.

### 8. 🔴 `critical` — computeNetCents: Money loss when non-member pays for expense
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-logic.ts:25-28`
- **Kanıt:** When paidById is a non-member (removed user), the payer's amountCents contribution is never credited to any account. Line 25 checks 'if (e.paidById in net)' which is false for non-members. The money vanishes from the accounting system. Test: computeNetCents([{userId: 'a'}], [{amountCents: 1000, paidById: 'ghost', participantIds: ['a', 'ghost']}], []) returns {a: -500} with sum -500, not 0.
- **Etki:** A removed household member's paid expenses cause money to disappear from the shared accounting. In a real house, if someone moves out but had paid for groceries, those payments would be lost, leaving other residents overpaying or the money unaccounted for.
- **Fix:** Add all non-zero amounts to 'net' initially, not just from members. Or ensure payer is always in the members list when calling computeNetCents (defensive validation). Recommend: filter out expenses with non-member payers before computation, or handle them explicitly.

### 9. 🟠 `high` — Hardcoded placeholder text missing accessibilityLabel in TextInputs
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:119-172`
- **Kanıt:** TextInput components use only placeholder text as labels. Example: <TextInput style={styles.input} placeholder="6-digit code" ... /> at line 119-127. No accessibilityLabel prop provided.
- **Etki:** Screen readers cannot announce the purpose of input fields. Users with visual impairments relying on screen readers will not know what information should be entered in each field.
- **Fix:** Add accessibilityLabel prop to each TextInput: <TextInput ... placeholder="6-digit code" accessibilityLabel="Enter the 6-digit verification code" />

### 10. 🟠 `high` — No accessibilityLabel on most interactive buttons and controls
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:259-269,285-290`
- **Kanıt:** Pressable buttons like 'Add expense' (line 259), settle button (line 285-290), and others have no accessibilityLabel. Only delete buttons have accessibilityLabel (e.g., line 314: accessibilityLabel={`Delete ${e.title}`}).
- **Etki:** Screen reader users cannot understand button purposes without visual context. Most interactive elements are inaccessible to users with visual impairments.
- **Fix:** Add accessibilityLabel to all Pressable components and buttons. Examples: <Pressable ... accessibilityLabel="Add new expense" />, <Pressable ... accessibilityLabel="Settle debt" />

### 11. 🟠 `high` — TextInput components lack accessibilityLabel properties across all screens
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:206-220`
- **Kanıt:** TextInput elements at lines 206-220 use placeholder="What for? (e.g. groceries)" and placeholder="Amount (€)" without accessibilityLabel. KitchenScreen (244-268) and TasksScreen (285-332) have the same issue.
- **Etki:** Screen reader users cannot identify what each input field expects without additional context. Critical for data entry screens (Money, Kitchen, Tasks).
- **Fix:** Add accessibilityLabel to all TextInput components with descriptive labels that match the input's purpose, not just the placeholder text.

### 12. 🟠 `high` — No screen reader labels for icon-only buttons and status indicators
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:259-269`
- **Kanıt:** Add expense button shows only '+' text (line 267). Kitchen screen (line 251-253) shows only '+' button. No accessibilityRole or accessibilityLabel on these icon-only buttons.
- **Etki:** Users relying on screen readers cannot understand the purpose of buttons that only display icons. Cannot determine if button is for adding, submitting, or other actions.
- **Fix:** Add accessibilityLabel: <Pressable ... accessibilityLabel="Add new expense" accessibilityRole="button" ><Text>+</Text></Pressable>

### 13. 🟠 `high` — No double-submit protection on Settle button
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:183-197 and 285-290`
- **Kanıt:** const onSettle = async (fromId, toId, amountCents) => {
  const settlementId = id();
  await db.transact(db.tx.settlements[settlementId].update(...).link(...));
  ...
};

<Pressable onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}>

The onSettle function has no busy/loading state, no disabled flag, and no guard against rapid re-clicks.
- **Etki:** A user can tap 'Settle' twice in quick succession before the first transact completes, creating duplicate settlement records. This records the same debt payment twice, corrupting the money ledger and overstating how much was paid back. With 4+ roommates, this could accumulate to significant errors.
- **Fix:** Add a busy flag (like onAdd in money-screen does), set it to true immediately when onSettle starts, disable the button while busy, and set busy to false in finally block. Or use Instant's optimistic updates with conflict detection.

### 14. 🟠 `high` — Apply error not surfaced to user - errorDetail not set in catch block
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:89-91`
- **Kanıt:** The onConfirm catch block at lines 89-91:
```typescript
} catch {
  setPhase('error');
}
```

Compare with onSend catch block at lines 67-69:
```typescript
} catch (e) {
  setErrorDetail((e as Error)?.message ?? String(e));
  setPhase('error');
}
```

The apply catch block does not extract or set errorDetail, so the error UI (lines 169) shows only the generic message without debugging info.
- **Etki:** When applyFragments fails (database error, network timeout, permissions issue), the user sees: "Brain couldn't read that — nothing was saved." with no error detail. This makes debugging impossible for users and provides no hint about what went wrong. The message is also misleading (implying the brain parsing failed, not the write) since it reuses the draft-phase error message.
- **Fix:** Add error detail capture in the catch block:
```typescript
} catch (e) {
  setErrorDetail((e as Error)?.message ?? String(e));
  setPhase('error');
}
```

### 15. 🟠 `high` — personalTasks should have stricter scoping - currently visible to any household member, design intent is owner-only
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:96-102 and instant.perms.ts:15-21`
- **Kanıt:** personalTasks entity at instant.schema.ts:96-102 is linked to both owner (single user) and household (many members). The schema comment states 'One owner, no rotation. Scoped to the household so "need a favor" can read them later.' — implying they're meant to be readable by housemates for context. However, src/features/tasks/tasks-screen.tsx:103 filters personalTasks client-side: `household.personalTasks.filter((t) => t.owner?.id === userId)` — showing the intent is to hide them from other household members at the VIEW level. Zero permission rules means all members can read all personalTasks right now.
- **Etki:** Privacy leak: housemate A's personal to-do list (e.g., 'call therapist', 'buy medication', 'plan surprise party') is visible to housemates B & C, even though A only intended it to be visible to themselves. If personalTasks are later used for 'need a favor' feature (as design notes suggest), permission rules must distinguish between owner and collaborators.
- **Fix:** Add view rule: `personalTasks: { allow: { view: "auth.id == data.ref('owner.id') || auth.id in data.ref('household.memberships.user.id')" } }` to allow both owner-view and household-view (for 'need a favor'); or more conservatively, restrict to owner only: `auth.id == data.ref('owner.id')` if 'need a favor' feature defers. Define write/delete rules: `auth.id == data.ref('owner.id')` (owner-only).

### 16. 🟠 `high` — households entity has no view/create/update restrictions - any user can enumerate and create fake households, or modify any household metadata
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:25-29`
- **Kanıt:** households entity at instant.schema.ts:25-29 is the root entity; no rules defined in instant.perms.ts. Household creation at household.tsx:111 validates nothing server-side — any authenticated user can call `db.tx.households[householdId].update({ name: trimmed, createdAt: now }).link({ creator: userId })` to create arbitrary households. Joining at household.tsx:170-181 does a queryOnce on households without permission check — if an attacker knows any household ID (they're UUIDs but would be discovered via API sniffing), they can join and tamper.
- **Etki:** Attack surface: (1) Household enumeration: attacker can brute-force or discover household IDs and enumerate all data in all households. (2) Household creation spam: attacker can create thousands of fake households cluttering the system. (3) Metadata tampering: household.name and creator link can be changed by any member or non-member. (4) Membership poisoning: no 'only creator/owner can invite' rule — any member (or non-member if they guess ID) can add/remove members.
- **Fix:** Add rules: `households: { allow: { view: "auth.id in data.ref('memberships.user.id')", create: false, update: "auth.id in data.ref('memberships.user.id')", delete: "auth.id in data.ref('memberships.user.id') && (data.ref('memberships.user.id')[?] == 'owner')" } }`. For memberships: `allow.create: "auth.id == context.actor && auth.id in data.ref('household.memberships.user.id')"`  (only existing members can invite).

### 17. 🟠 `high` — chores and choreEvents have no scoping - any user can read/write chore rotation and history across all households
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:82-94`
- **Kanıt:** chores entity at instant.schema.ts:82-87 and choreEvents at instant.schema.ts:91-94 link to household (chores/choreEvents→chore) and turn/by users. No rules defined. Code at tasks-screen.tsx:116-119 writes chores: `db.tx.chores[id()].update({ name, createdAt: ts, updatedAt: ts }).link({ household: household.id, turn: userId })`. Any user can see and modify any household's chore list and rotation state.
- **Etki:** Fairness attack: attacker can change whose turn a chore is (corrupting rotation), mark chores as done for other people (credit fraud), or delete chores to hide work. In a household, if Alice's turn is bathroom, attacker can move it to Bob, or mark it done for themselves. The rotation logic (tasks-screen.tsx:100 `effectiveTurn`) returns the current holder, and choreEvent.by credits the doer — both vulnerable to tampering. Attacker can also inject fake chores or bogus history.
- **Fix:** Add rules: `chores: { allow: { view: "auth.id in data.ref('household.memberships.user.id')", create: "auth.id in data.ref('household.memberships.user.id')", update: "auth.id in data.ref('household.memberships.user.id')", delete: "auth.id in data.ref('household.memberships.user.id')" } }` and `choreEvents: { allow: { view: "auth.id in data.ref('chore.household.memberships.user.id')", create: "auth.id in data.ref('chore.household.memberships.user.id')", delete: false } }` (choreEvents immutable).

### 18. 🟠 `high` — pantryItems and purchases have no scoping - any user can read/write pantry state and purchase history across all households
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:61-79`
- **Kanıt:** pantryItems at instant.schema.ts:61-72 and purchases at instant.schema.ts:75-79 link to household. No rules defined. Code at kitchen-screen.tsx:103-107 writes without household checks: `db.tx.pantryItems[existing.id].update({ status: 'in', ... })`. Any user can see and modify any household's pantry and shopping list, including claiming items and marking them purchased.
- **Etki:** Kitchen data tampering: attacker can add garbage items to shopping list, mark items as claimed to block others, fake purchase history (corrupting the purchase-log foundation for later 'running low' predictions), or erase pantry items. Since purchases feed the cadence prediction system (apply.ts:100-105), fake or missing purchase records break that feature. Attacker can also manipulate item claimers (pantryClaimedBy link) to create false accountability.
- **Fix:** Add rules: `pantryItems: { allow: { view: "auth.id in data.ref('household.memberships.user.id')", create: "auth.id in data.ref('household.memberships.user.id')", update: "auth.id in data.ref('household.memberships.user.id')", delete: "auth.id in data.ref('household.memberships.user.id')" } }` and `purchases: { allow: { view: "auth.id in data.ref('household.memberships.user.id')", create: "auth.id in data.ref('household.memberships.user.id')", update: false, delete: false } }` (purchases immutable audit log).

### 19. 🟠 `high` — activityEvents and profiles have no scoping - any user can read/write activity feed and profile data across all households
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:40-43 and instant.schema.ts:19-23`
- **Kanıt:** activityEvents at instant.schema.ts:40-43 link to household/actor; profiles at instant.schema.ts:19-23 link to $users. No rules defined. Activity logged via activity.ts:51-58 and queried at activity-feed.tsx:12-19. Any user can read all activity from all households and modify any user's profile.
- **Etki:** Privacy + audit trail corruption: (1) Activity feed leaks: attacker can see who did what in any household (spending, chores, pantry actions) across the entire system. (2) Fake activity injection: attacker can forge fake activity events (e.g., 'Alice added €5000 expense') to frame users or cover up tampering. (3) Profile vandalism: any user can modify any other user's displayName/avatarUrl, impersonating them. The activity feed is meant as an audit trail of fairness decisions — if it's forgeable, the entire accountability system fails.
- **Fix:** Add rules: `activityEvents: { allow: { view: "auth.id in data.ref('household.memberships.user.id')", create: "auth.id == data.ref('actor.id')", update: false, delete: false } }` (only actor can create events in their household; events immutable). For profiles: `allow: { view: true (or public), update: "auth.id == data.ref('user.id')" (owner-only), create: false (managed by system) }` — profiles are almost-public display data; restrict writes to owner.

### 20. 🟠 `high` — memberships has no create/update restrictions - any user can add themselves to any household or modify role/status without owner approval
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21 and instant.schema.ts:31-37`
- **Kanıt:** memberships at instant.schema.ts:31-37 link household→user with role ('owner'|'member') and status ('active'|'invited'|'removed'). No rules defined. Code at household.tsx:178-181 writes: `db.tx.memberships[membershipId].update({ role: 'member', status: 'active', displayName: userName, joinedAt: Date.now() }).link({ household: trimmed, user: userId })` — called after a user provides a household ID. Zero validation that the ID exists or is valid; zero check that the user has permission to join. Any user can: (1) join any household by guessing/discovering its UUID, (2) upgrade themselves to 'owner', (3) remove themselves from removed status, (4) add other users without consent.
- **Etki:** Membership hijacking: attacker can join any household by ID and gain access to all its data (money, chores, pantry). Attacker can change their role to 'owner' and lock out real owners. Attacker can remove real members or downgrade them. If membership creation/update is not restricted to existing owners, the entire household isolation breaks — any logged-in user can invite themselves in. The design intent (household.tsx:170-181 `onJoin`) is that a user pastes a code and self-joins, but there's no server-side validation that they should be allowed.
- **Fix:** Add rule: `memberships: { allow: { view: "auth.id in data.ref('household.memberships.user.id') || auth.id == data.ref('user.id')", create: "auth.id == context.actor && (context.actor in data.ref('household.memberships.user.id') || 'open_household' in context.tags)", update: "auth.id in data.ref('household.memberships.user.id') && data.ref('user.id').filter(u => u.role == 'owner').includes(auth.id)", delete: "auth.id in data.ref('household.memberships.user.id') && data.ref('user.id').filter(u => u.role == 'owner').includes(auth.id)" } }` — only existing members (especially owners) can add new members or change roles.

### 21. 🟠 `high` — Unhandled promise rejections in onPress handlers (onSettle)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/money/money-screen.tsx:287`
- **Kanıt:** const onSettle = async (fromId: string, toId: string, amountCents: number) => {
    const settlementId = id();
    await db.transact(
      db.tx.settlements[settlementId]
        .update({ amountCents, currency: 'EUR', createdAt: nowMs() })
        .link({ household: household.id, fromUser: fromId, toUser: toId }),
    );
    await logActivity(...);
  };

Called at line 287:
<Pressable onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}>
- **Etki:** If a database transaction or logActivity call fails, the rejection is unhandled. The UI will not show an error, the user gets no feedback, and the promise rejection will be logged to console. On real money/debt operations, this is dangerous as users won't know if a settlement was recorded.
- **Fix:** Wrap the call with try/catch and error state:
const onPress={() => {
  void (async () => {
    try {
      await onSettle(d.fromId, d.toId, d.amountCents);
    } catch {
      setFormError('Could not settle. Try again.');
    }
  })();
}}

### 22. 🟠 `high` — Unhandled promise rejections in task action handlers (advance, onMineDone, onMineDelete, onAddSuggestion)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:235,242,304,309,355`
- **Kanıt:** const advance = async (...) => {
  await db.transact([...]);
  await logActivity(...);
}

const onMineDone = async (taskId: string) => {
  await db.transact(db.tx.personalTasks[taskId].update({ status: 'done' }));
}

const onMineDelete = async (taskId: string) => {
  await db.transact(db.tx.personalTasks[taskId].delete());
}

const onAddSuggestion = async (name: string) => {
  await db.transact(...);
  await logActivity(...);
}

All called directly from onPress without error handling:
<Pressable onPress={() => advance(...)} />
<Pressable onPress={() => onMineDone(t.id)} />
<Pressable onPress={() => onMineDelete(t.id)} />
<Pressable onPress={() => onAddSuggestion(s.name)} />
- **Etki:** If any database operation fails, the error is not caught or displayed. Users will not know whether their action (marking task done, deleting task, passing chore, adding chore) was recorded. This breaks the fair chore rotation system since the turn advancement may not have occurred.
- **Fix:** Wrap in void (async try/catch) pattern:
onPress={() => {
  void (async () => {
    try {
      await advance(...);
    } catch {
      Alert.alert('Error', 'Could not update chore. Try again.');
    }
  })();
}}

Alternatively, add busy state and error display to the component.

### 23. 🟠 `high` — Unhandled promise rejections in kitchen action handlers (onOut, onClaim, onGotIt)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:294,298,327`
- **Kanıt:** const onOut = async (itemId: string, itemName: string) => {
  await db.transact(...);
  await logActivity(...);
}

const onClaim = async (itemId: string, itemName: string) => {
  await db.transact(...);
  await logActivity(...);
}

const onGotIt = async (itemId: string, itemName: string, normalizedName: string) => {
  await db.transact([...]);
  await logActivity(...);
  setBridge({ itemName });
}

All called directly from onPress without error handling:
onPress={() => onOut(it.id, it.name)}
onPress={() => onClaim(it.id, it.name)}
onPress={() => onGotIt(it.id, it.name, it.normalizedName)}
- **Etki:** If database operations fail, users receive no error feedback. Item state changes may not be persisted (e.g., someone marks an item as 'out' but it stays 'in', or claims an item but the claim doesn't register). This creates confusion about shopping status across the household.
- **Fix:** Wrap in void (async try/catch):
onPress={() => {
  void (async () => {
    try {
      await onOut(it.id, it.name);
    } catch {
      Alert.alert('Error', 'Could not update item. Try again.');
    }
  })();
}}

### 24. 🟠 `high` — Index-based keys in deletable fragment list (brain-input)
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:122`
- **Kanıt:** Fragments can be deleted by user: `.filter((_, i) => i !== idx)` at line 133. Using `key={idx}` means when a fragment is deleted, remaining fragments get renumbered, causing amountDraft state to map to wrong fragments. For example, if user edits amount for fragment 1, then deletes fragment 0, the amount stays in amountDraft[1] but now refers to what was fragment 2.
- **Etki:** User edits amounts for expense fragments, deletes some fragments, then confirms. The edited amounts get applied to the wrong fragments, causing incorrect expenses to be created.
- **Fix:** Generate a stable identifier for each fragment (e.g., when creating DraftFragment, add an id field). Use `key={f.id ?? idx}` or `key={fragmentId}` instead. Also refactor amountDraft to use the fragment ID as key instead of index.

### 25. 🟠 `high` — Invalid keyframe percentage in animated-icon.web.tsx glowKeyframe
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/components/animated-icon.web.tsx:47`
- **Kanıt:** Line 47: `[DURATION / 1000]: { ... }` evaluates to `0.3: { ... }` where DURATION=300. Keyframe percentages must be 0-100.
- **Etki:** The glowKeyframe animation on web will fail or render incorrectly because 0.3 is not a valid keyframe percentage. The glow animation during app startup will not animate properly on web, creating a platform difference in UX.
- **Fix:** Replace `[DURATION / 1000]` with a valid percentage like `30` to represent 30% of the animation timeline, or reconsider the intended timing

### 26. 🟠 `high` — BrainInput missing error details on confirmation failure
- **Boyut:** State management patterns (`state-management`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:89`
- **Kanıt:** In the onConfirm function's catch block (lines 89-91), when applyFragments throws an error, the code does `catch { setPhase('error'); }` without calling `setErrorDetail()`. Compare to onSend (lines 67-69) which properly calls `setErrorDetail((e as Error)?.message ?? String(e))`. The error display at lines 166-170 expects errorDetail to be set but it won't be, leaving users with a generic error message.
- **Etki:** When database writes fail during brain confirmation, users receive an unhelpful error message ('Brain couldn't read that — nothing was saved.') with no details about the actual failure cause. This makes debugging and understanding what went wrong impossible for users.
- **Fix:** Add `setErrorDetail((e as Error)?.message ?? String(e));` before or alongside `setPhase('error');` in the catch block at line 90, matching the pattern used in the onSend catch block.

### 27. 🟠 `high` — advance() uses stale turn holder data instead of fetching current value
- **Boyut:** Tasks rotation fairness (`tasks-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:172-186`
- **Kanıt:** const advance = async (
  choreId: string,
  choreName: string,
  holderId: string | null,
  eventType: 'done' | 'pass',
) => {
  const ts = nowMs();
  const next = nextTurn(memberIds, holderId);
  ...
  await db.transact([
    db.tx.chores[choreId].update({ updatedAt: ts }).link({ turn: next ?? userId }),
    db.tx.choreEvents[eventId]
      .update({ type: eventType, at: ts })
      .link({ chore: choreId, by: userId }),
  ]);
- **Etki:** When two users simultaneously tap Done on the same chore with nearly-identical timing, the second request's nextTurn() calculation uses the stale `holderId` parameter (captured at render time) rather than the actual current turn holder from the database. This can result in incorrect rotation calculations and duplicate chore events being recorded. In race conditions where the turn has already advanced, the second user's action computes next from an outdated holder, potentially skipping members or creating data inconsistencies.
- **Fix:** Before computing `next = nextTurn(memberIds, holderId)`, fetch the current chore state from the database to get the actual current turn holder. Use that fresh value instead of the parameter: `const currentChore = await db.queryOnce({chores: {$: {where: {id: choreId}}}); const currentHolderId = effectiveTurn(memberIds, currentChore?.chores?.[0]?.turn?.id); const next = nextTurn(memberIds, currentHolderId);`

### 28. 🟠 `high` — ageOf function in aging.ts has zero test coverage
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/aging.ts:41-54`
- **Kanıt:** No test file exists for aging.ts. The function ageOf() is a pure state machine with four boundaries at 1.0x, 1.5x, and 2.0x shelfLifeDays. The function explicitly documents it as 'Pure module — no React, no IO, no clock. Caller passes nowMs so tests can exercise every boundary deterministically.' Yet no tests exist. Critical edge cases untested: null shelfLifeDays, negative values, infinity, boundary conditions at exact multiples.
- **Etki:** Pantry items will fail to age, prompt, or auto-archive correctly. Visual cues for old items (fading, prompts, archiving) may be broken. Users won't be notified about expiring groceries, leading to food waste and stale food in the pantry.
- **Fix:** Add vitest tests for ageOf covering: null/undefined shelf life, non-finite values, zero/negative shelf life, and exact boundary conditions (elapsed === 1.0x, 1.5x, 2.0x shelfLifeDays). Test MS_PER_DAY conversion with known timestamps.

### 29. 🟠 `high` — normalizeItemName and resolveItem functions in normalize.ts have zero test coverage
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/normalize.ts:77-164`
- **Kanıt:** No test file exists for normalize.ts. Two public functions, normalizeItemName (lines 77-137) and resolveItem (lines 141-164), implement multi-stage alias matching (exact, singular, prefix, edit-distance) and diacritic folding. Zero tests cover: empty/whitespace inputs, Turkish diacritics (ş, ç, ü, ö, ı), multi-word items, plural stripping, Levenshtein edit distance, or the alias table lookup.
- **Etki:** Item normalization is unpredictable. Users typing 'süt' may not match 'milk'. Plural forms might fail. Unknown items might get wrong shelf life. Users can't trust that 'eggs' and 'egg' land on the same pantry row, breaking shopping list aggregation and item tracking.
- **Fix:** Add vitest tests for normalizeItemName covering: empty string, whitespace, Turkish/Unicode chars, plurals (eggs/egg), exact aliases, singular forms, multi-word prefixes (bell pepper), edit-distance matches, unknown items. Add tests for resolveItem to verify canonical lookup and fallback to raw text.

### 30. 🟠 `high` — applyFragments function in apply.ts has zero test coverage
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/apply.ts:25-153`
- **Kanıt:** No test file exists for apply.ts. The function handles five fragment types (expense, pantry_add/out/shopping_add, chore_done, personal_task) with complex branching: resolveItem lookup, pantry item merge logic (line 74: find existing by normalizedName), chore substring matching (line 120-122: name.includes(needle)), turn advancement, and activity logging. Zero test coverage for success paths, merge behavior, chore matching, or error cases.
- **Etki:** Brain-generated actions (e.g., 'Done: Dishes') may match the wrong chore or fail silently. Pantry items might not merge correctly, creating duplicates. Rotation may advance incorrectly. Users lose visibility into whether their note was understood and applied.
- **Fix:** Add vitest tests for applyFragments with mock db and logActivity. Test each target type: expense creation, pantry merge (existing vs new), pantry_out, shopping_add, chore substring matching (exact match, partial match, no match), personal task, and chore turn advancement. Test empty orderedMembers edge case.

### 31. 🟠 `high` — Unsafe type assertion on caught error without property access guard
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/index.ts:70`
- **Kanıt:** const status = (e as GroqHttpError).status;

The caught exception `e` is cast to `GroqHttpError` and `.status` is accessed directly without checking if the error actually has that property. Caught exceptions can be any type, and `e` might not be a `GroqHttpError`. While groqChat() is intended to throw GroqHttpError, it can also throw other errors (e.g., JSON parse errors during `parseDraft`).
- **Etki:** At runtime, if a non-GroqHttpError is caught, accessing `.status` on an object without that property will return `undefined`, which gets logged but handled. However, the intent to detect recoverable errors (status 429) is silently lost for non-HTTP errors.
- **Fix:** Check the error type before accessing properties: `const status = (e instanceof Error && 'status' in e) ? (e as GroqHttpError).status : undefined;` or use a type guard function that safely extracts the status.

### 32. 🟠 `high` — Non-null assertion on environment variable may hide missing configuration
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/app/_layout.tsx:20`
- **Kanıt:** const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
- **Etki:** If the environment variable is not set at build time, the non-null assertion converts the undefined value to a lie. The ClerkProvider will receive undefined as publishableKey, which will fail at runtime during app initialization rather than at configuration time.
- **Fix:** Either assert at build time that the variable exists (e.g., in a build script), or provide a fallback with a clear error message: `const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || (() => { throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required'); })();`

### 33. 🟠 `high` — Rate limit counter increments before body validation
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:110`
- **Kanıt:** Line 110 calls `if (overCap())` which increments `capCount`, but body parsing validation happens at lines 113-119. Invalid requests (missing text, invalid JSON, text too long) still consume quota.
- **Etki:** An authenticated attacker can exhaust the 200-request daily quota by sending invalid requests, preventing legitimate users from making valid calls. This defeats the documented cost-cap purpose.
- **Fix:** Move the rate limit check to AFTER body validation (after line 120), or only increment counter when a valid request reaches the classification stage.

### 34. 🟠 `high` — Per-isolate rate limit allows bypass under load
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:24-25`
- **Kanıt:** Module-level variables `let capDay = '';` and `let capCount = 0;` store the counter. Without shared state across isolates, each isolate gets its own 200 requests/day quota. Comment on line 21-22 documents this: 'Per-isolate (resets on redeploy/idle).'
- **Etki:** When Cloudflare Workers scales to multiple isolates under load, an attacker can bypass the cost-cap by distributing requests across isolates. If N isolates are spawned, the effective limit becomes 200*N requests/day, allowing runaway bills.
- **Fix:** Use Cloudflare KV (mentioned in line 6 comment as future solution) to store a global rate-limit counter keyed by date. Initialize in wrangler.toml: `kv_namespaces = [{binding="RATE_LIMIT", id="..."}]`.

### 35. 🟡 `medium` — Hardcoded placeholder color contrast in auth screen may be insufficient
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:119-172`
- **Kanıt:** All TextInput fields use placeholderTextColor="#9b9b9b" (hardcoded mid-gray). This is not defined in the Roomie theme. Color #9b9b9b has insufficient contrast with light backgrounds for placeholder text (placeholders must meet WCAG AA for visibility).
- **Etki:** Placeholder text may be difficult for users with low vision to read, especially for users with color blindness. Inconsistent with the theme system.
- **Fix:** Replace hardcoded #9b9b9b with Roomie.sub theme color for consistency. If placeholders need higher contrast, define a dedicated placeholder color in theme.ts with sufficient contrast ratio (at least 4.5:1 for AA compliance).

### 36. 🟡 `medium` — Hardcoded colors inconsistently used instead of theme constants
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:209,216,406,408-409`
- **Kanıt:** MoneyScreen uses hardcoded colors: placeholderTextColor="#9b9b9b" (lines 209, 216), expenseMeta color: '#9b9b9b' (line 406), deleteLabel and error colors: '#c0392b' (lines 408-409). None of these are defined in the Roomie theme.
- **Etki:** Inconsistent color palette makes theming and dark mode support difficult. Makes future accessibility adjustments harder. Users cannot customize colors if app needs to support different themes.
- **Fix:** Define these colors in theme.ts (e.g., Roomie.placeholder, Roomie.errorAlt) and use them consistently across all screens instead of hardcoded values.

### 37. 🟡 `medium` — Insufficient touch target sizes for small delete/action buttons
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:444`
- **Kanıt:** Delete button uses: delete: { padding: 6 } (line 444). With fontSize: 15 for the ✕ character, this creates a touch target of approximately 27x27dp (6px padding on each side). TasksScreen uses padding: 4 (line 453) for an ~23x23dp target.
- **Etki:** Touch targets below the 44x44dp Android/48dp iOS recommendation make it difficult for users with motor disabilities or large fingers to tap accurately. Multiple accidental taps possible.
- **Fix:** Increase padding to minHitSlop value or add hitSlop prop. Use minHeight and minWidth styles: delete: { padding: 12, minHeight: 44, minWidth: 44 }. Or add hitSlop={12} to the Pressable.

### 38. 🟡 `medium` — Placeholder text contrast ratio not verified against WCAG standards
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:209-216`
- **Kanıt:** Placeholder colors use hardcoded #9b9b9b or Roomie.sub (#97897A) on input background Roomie.input (#FFFDF9). Contrast ratio ≈ 3.5:1 (below WCAG AA minimum of 4.5:1 for normal text).
- **Etki:** Placeholder text fails WCAG AA contrast requirements. Users with low vision, color blindness, or viewing in bright light cannot read placeholder hints reliably.
- **Fix:** Either: 1) Use darker placeholder color (e.g., #6B6660 for ~7:1 contrast), 2) Use Roomie.ink (#2D261F) which has ~8.5:1 contrast, or 3) Define placeholder-specific color in theme with guaranteed contrast.

### 39. 🟡 `medium` — All hardcoded English text strings prevent i18n/localization
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/app/index.tsx:20,23,27`
- **Kanıt:** Home screen uses hardcoded English: 'Hi {user?.username ?? "there"} 👋' (line 20), 'Connecting…' (line 23), 'InstantDB not connected yet.' (line 27). All screens repeat this pattern (auth-screen.tsx, money-screen.tsx, kitchen-screen.tsx, tasks-screen.tsx, household.tsx).
- **Etki:** App cannot be localized to other languages. All hardcoded text strings (400+ occurrences) must be refactored to use i18n if multi-language support is ever required.
- **Fix:** Implement i18n solution (e.g., i18next, react-intl). Create translation files. Replace all hardcoded strings with i18n keys: i18n.t('home.greeting', { name: user?.username })

### 40. 🟡 `medium` — No focus management or accessibilityRole on interactive controls
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:223-255`
- **Kanıt:** Chip buttons for 'Paid by' and 'Split between' (lines 223-255) are Pressable components with no accessibilityRole="button" or accessibilityRole="tab" designations. No focus indicators or focus state styling.
- **Etki:** Screen reader users cannot identify that chips are buttons. Keyboard users on web have no visual focus indicator. Screen readers may announce chips as generic elements instead of actionable controls.
- **Fix:** Add accessibilityRole: <Pressable accessibilityRole="button" accessibilityState={{ selected: selected }} ... >. For web, add focus styles in StyleSheet with focus pseudo-class.

### 41. 🟡 `medium` — Insufficient color contrast between secondary text and background
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/activity/activity-feed.tsx:60-62`
- **Kanıt:** Activity feed uses sub text color (#97897A) on canvas (#FBF7F0). Line 41 uses Roomie.sub for event text. Contrast ratio ≈ 4.2:1. This is between WCAG A (3:1) and AA (4.5:1), at the borderline.
- **Etki:** Secondary text is difficult to read for users with low vision, especially when viewing on screens with reduced brightness. At minimum acceptable level, not ideal.
- **Fix:** Use Roomie.ink (#2D261F) for primary readable text. Reserve Roomie.sub only for less critical metadata. Or increase sub color darkness to achieve 4.5:1+ contrast.

### 42. 🟡 `medium` — ActivityIndicator and loading states lack accessibility announcement
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:110-111,154`
- **Kanıt:** ActivityIndicator shown during 'thinking' phase (line 110-111) and 'applying' phase (line 154) has no accessibilityLabel. No live region or accessibility status update.
- **Etki:** Screen reader users are not informed that the app is processing their request. They may not realize they should wait or that an action is in progress.
- **Fix:** Add accessibilityLabel to ActivityIndicator: <ActivityIndicator accessibilityLabel="Processing your request" accessibilityLiveRegion="polite" /> or use accessibilityHint on the button triggering the action.

### 43. 🟡 `medium` — Error messages and alerts lack accessible markup
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:128,174`
- **Kanıt:** Error text at line 128 and 174: <Text style={styles.error}>{error}</Text>. No accessibilityRole="alert" or accessibilityLiveRegion set. Same pattern in all screens (money, kitchen, tasks).
- **Etki:** Screen reader users may miss error messages. Changes to error text are not announced to screen readers, leaving users unaware of validation failures.
- **Fix:** Add accessibilityRole="alert" and accessibilityLiveRegion="assertive" to error Text components: <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>

### 44. 🟡 `medium` — No text size scaling support (allowFontScaling not configured)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:199-324`
- **Kanıt:** All Text components lack allowFontScaling prop. Text styles use fixed fontSize values (e.g., heading: fontSize 34, button: fontSize 16). Users cannot scale text via device accessibility settings.
- **Etki:** Users who rely on system text scaling (e.g., users with low vision who set large font sizes) will see unchanged text sizes. This is a WCAG 2.1 criterion (1.4.4 Resize text) violation.
- **Fix:** 1) Add allowFontScaling={true} (default) to Text components. 2) Use RN default font scaling by not disabling it. 3) Or, implement maxFontSizeMultiplier limits to prevent extreme scaling breaking layouts: <Text allowFontScaling={true} maxFontSizeMultiplier={1.5}>...

### 45. 🟡 `medium` — Missing response validation in brain-input.tsx causes potential runtime crash
- **Boyut:** API request/response validation (`api-validation`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx`
- **Kanıt:** const body = (await res.json()) as DraftResponse;
if (!res.ok) throw new Error(body.error ?? `http ${res.status}`);
setFragments(body.fragments);
setQuestion(body.question);
setPhase(body.fragments.length > 0 || body.question ? 'draft' : 'done');
- **Etki:** If the API response is malformed or missing expected fields (e.g., fragments is undefined), line 62 will crash with 'Cannot read property length of undefined'. The response JSON is cast as DraftResponse using TypeScript's 'as' keyword, which provides zero runtime validation. Since this is the only fetch point in the app for brain-generated drafts, a crash blocks the entire brain feature.
- **Fix:** Add runtime schema validation using zod (already a project dependency) to validate the response shape before accessing its properties. Example: const validated = draftResponseSchema.parse(body); setFragments(validated.fragments);

### 46. 🟡 `medium` — Cross-module utility function imports violate separation of concerns
- **Boyut:** File structure & architecture (`architecture`)
- **Yer:** `src/features/money/money-logic.ts:72-80, src/features/kitchen/kitchen-screen.tsx:27, src/features/tasks/tasks-screen.tsx:31, src/features/brain/apply.ts:14, src/features/brain/brain-input.tsx:13`
- **Kanıt:** Multiple non-Money modules import generic utilities from money-logic: `nowMs()` (Date.now wrapper) and `parseAmountToCents()` (currency parsing). These appear in kitchen-screen.tsx line 27, tasks-screen.tsx line 31, brain/apply.ts line 14, and brain-input.tsx line 13. The functions are in money-logic.ts lines 72-80.
- **Etki:** Architectural smell: Money logic becomes a dumping ground for unrelated utilities, making it harder to reason about module boundaries. If money-logic ever needs major refactoring or is extracted, these utilities will break. Creates false coupling between Money and Kitchen/Tasks modules.
- **Fix:** Create src/lib/utils.ts or src/utils/formatting.ts with generic utilities like `nowMs()` and `parseAmountToCents()`. Update imports in kitchen-screen.tsx, tasks-screen.tsx, brain/apply.ts, and brain-input.tsx to import from the new location instead of money-logic.

### 47. 🟡 `medium` — Stale closure over 'items' snapshot in Kitchen onAdd allows duplicate pantry items
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:88-132`
- **Kanıt:** const items = [...household.pantryItems].sort(...);
...
const onAdd = async () => {
  const existing = items.find((it) => it.normalizedName === resolved.normalizedName);
  if (existing) {
    await db.transact(db.tx.pantryItems[existing.id].update(...));
  } else {
    await db.transact(db.tx.pantryItems[id()].update({...}).link({household...}));
  }
};

The 'items' variable is a closure over the render-time snapshot (line 88). If user A and user B both see the pantry without 'milk', and both call onAdd('milk') before state refreshes, both will execute the 'else' branch and create two separate pantryItems with the same normalizedName.
- **Etki:** Two pantry items with the same normalized name can coexist (e.g., two 'milk' rows). The normalizer deduplication doesn't work because it queries the stale snapshot. Over time, the pantry list grows with duplicates, confusing users about inventory and breaking the "one canonical item per normalizedName" invariant.
- **Fix:** Move the deduplication check into a server-side function (or use Instant's unique constraint on normalizedName per household), or refetch household.pantryItems right before the transact to check for races. Alternatively, add a try-catch that detects the conflict and retries.

### 48. 🟡 `medium` — Concurrent claims race on shopping list item
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:145-156 and 284-300`
- **Kanıt:** const onClaim = async (itemId, itemName) => {
  await db.transact(db.tx.pantryItems[itemId].update({updatedAt: nowMs()}).link({claimedBy: userId}));
  ...
};

Rendered as:
if (claimerId && !mine) {
  <Text>... is getting it</Text>
} else if (!claimerId) {
  <Pressable onPress={() => onClaim(...)}>I'll get it</Pressable>
}

If Alice and Bob both see an item with claimedBy=null and both tap 'I'll get it' simultaneously, both execute onClaim. The transact is not idempotent—last writer wins, so Bob's userId overwrites Alice's in the claimedBy field.
- **Etki:** Two users believe they are claiming the same shopping item. They may both go buy it (wasteful/redundant purchase) or both skip it (item never purchased). The UI shows inconsistent state to each user depending on network sync timing.
- **Fix:** Add optimistic UI feedback that prevents re-tapping before the transact completes. Or use Instant's conditional updates (if claimedBy is null, set to userId) to prevent overwrite. Or add a disabled flag on the button during the async call.

### 49. 🟡 `medium` — No double-submit guards on kitchen Out/GotIt buttons
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:134-143 and 158-179`
- **Kanıt:** const onOut = async (itemId, itemName) => {
  await db.transact(db.tx.pantryItems[itemId].update({status: 'out', updatedAt: nowMs()}));
  ...
};

const onGotIt = async (itemId, itemName, normalizedName) => {
  await db.transact([...]);
  ...
};

Both are called directly via onPress without any busy flag or disabled state.
- **Etki:** Rapid clicks on 'Out' can trigger multiple transacts. Similarly, clicking 'Got it ✓' twice creates duplicate purchase records in the purchases table. This pollutes the cadence/prediction log with false purchase events.
- **Fix:** Add busy state and disable buttons during async operations, similar to the pattern used in onAdd.

### 50. 🟡 `medium` — No double-submit protection on Tasks personal task actions
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:164-170 and 304-305`
- **Kanıt:** const onMineDone = async (taskId) => {
  await db.transact(db.tx.personalTasks[taskId].update({status: 'done'}));
};

<Pressable onPress={() => onMineDone(t.id)}><Text>Done ✓</Text></Pressable>
<Pressable onPress={() => onMineDelete(t.id)}><Text>✕</Text></Pressable>

No busy flags, no disabled state.
- **Etki:** A user can tap 'Done ✓' twice to mark a personal task done twice (harmless) or tap Delete twice (second tap operates on an already-deleted task, may cause an error). If error handling is missing, the app could crash or show a confusing error state.
- **Fix:** Add busy state flags and disable buttons during async operations.

### 51. 🟡 `medium` — applyFragments processes brain fragments sequentially without rollback on partial failure
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/apply.ts:53-150`
- **Kanıt:** for (const f of fragments) {
  const ts = nowMs();
  if (f.target === 'expense' && ...) {
    await db.transact(db.tx.expenses[id()].update(...));
    applied.push(...);
  }
  if (...) { ... }
  ...
}

If fragment 2's transact fails, fragment 1 is already persisted. The function throws and never returns the partial result.
- **Etki:** When applying 3 brain fragments and the 2nd one fails, the 1st is applied but the user sees only 'error'. The user doesn't know which fragments succeeded, and may re-send the text, creating duplicates. The activity log may be inconsistent with the data state.
- **Fix:** Either (1) collect all fragments in a single multi-statement transact, (2) return a partial result with both applied and failed counts so the UI can show which fragments succeeded, or (3) add explicit logging of which fragments were persisted before the error.

### 52. 🟡 `medium` — Stale closure over memberIds in advance function could fail if members leave
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:95 and 172-194`
- **Kanıt:** const orderedMembers = [...household.memberships]
  .sort(...)
  .map(...)
  .filter((m) => m.userId);
const memberIds = orderedMembers.map(...);

const advance = async (...) => {
  const next = nextTurn(memberIds, holderId);
  ...
};

memberIds is captured in the closure at render time. If a member leaves the household between render and advance call, the nextTurn calculation uses stale memberIds.
- **Etki:** If a member leaves the household and another user advances a chore, the nextTurn calculation might fail or skip the wrong member (because the stale memberIds doesn't match the server state). This could cause the turn to be assigned to a former member who is no longer active.
- **Fix:** Fetch current memberIds server-side inside advance, or include it in the chore snapshot passed to advance. Use effectiveTurn's self-healing logic to recover from stale member lists.

### 53. 🟡 `medium` — Invalid expense amount edits silently reverted without user feedback
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:75-79`
- **Kanıt:** The onConfirm function folds amount edits back into fragments:
```typescript
const finalFragments = fragments.map((f, idx) => {
  if (f.target !== 'expense' || amountDraft[idx] === undefined) return f;
  const cents = parseAmountToCents(amountDraft[idx]);
  return cents ? { ...f, amountCents: cents } : f;
});
```

If parseAmountToCents returns null (invalid input like "abc"), the ternary returns the fragment unchanged with its original amountCents. The user's invalid edit is silently discarded.

The TextInput at line 125-130 accepts any text via onChangeText but has no validation feedback.
- **Etki:** A user edits an expense amount to an invalid value (e.g., "abc"), taps Confirm, and the original amount is written silently. The user cannot tell that their edit was ignored. The fragmentLine display (line 123) shows the original amount, but the TextInput shows their invalid input, creating a confusing visual state inconsistency.
- **Fix:** Either (1) validate the amount in real-time and show an error message, or (2) filter out expense fragments with invalid edited amounts and report them as skipped items. Currently the fragments array is not modified, so they silently use the old amount.

### 54. 🟡 `medium` — Chore matching uses ambiguous bidirectional substring matching
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/apply.ts:120-123`
- **Kanıt:** The chore lookup uses bidirectional substring matching:
```typescript
const chore = household.chores.find((c) => {
  const name = c.name.toLowerCase();
  return name.includes(needle) || needle.includes(name);
});
```

This matches the first chore where either the chore name contains the user's input substring OR the user's input contains the chore name. The `find` method returns the first match, which depends on array order.
- **Etki:** If household chores have overlapping names (e.g., "bathroom", "bath mat cleaning"), substring matching could select the wrong chore. The first match in array order wins, making behavior non-deterministic and fragile. For example:
- User says "bath" intending "bathroom"
- If "bath mat cleaning" comes first in the array, it will match
- If "bathroom" comes first, it matches the intended chore

While the matching algorithm itself isn't wrong per the rules (it's designed for fuzzy matching), the reliance on array order makes it fragile and could cause wrong chore completions.
- **Fix:** Prefer exact or prefix matching over substring matching. Or sort matches by specificity (exact > prefix > substring) and return the best match, not the first array match.

### 55. 🟡 `medium` — emailName() function duplicated across 3 feature files
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:38-41`
- **Kanıt:** function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

Also defined identically in:
- src/features/money/money-screen.tsx:33-36
- src/features/kitchen/kitchen-screen.tsx:35-38
- **Etki:** Code duplication makes maintenance harder - if the email extraction logic needs to change (e.g., different test email formats), it must be updated in 3 places. Increases bug risk if changes are made inconsistently.
- **Fix:** Extract emailName() to a shared utility file (e.g., src/lib/name-utils.ts) and import it in all three screens.

### 56. 🟡 `medium` — Centered component duplicated across 3 feature files
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:369-375`
- **Kanıt:** function Centered({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>{children}</View>
    </SafeAreaView>
  );
}

Identical definition in:
- src/features/money/money-screen.tsx:326-332
- src/features/kitchen/kitchen-screen.tsx:347-353
- **Etki:** Component duplication creates maintenance burden. Changes to loading/error layout must be replicated across 3 screens. Makes component-level fixes harder to propagate.
- **Fix:** Extract to src/components/centered.tsx and import in all three screens.

### 57. 🟡 `medium` — Empty orderedMembers passed to expense participants in brain apply (potential correctness issue)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/brain/apply.ts:45-60`
- **Kanıt:** const orderedMembers = [...household.memberships]
  .sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))
  .map((m) => m.user?.id ?? '')
  .filter(Boolean);

if (f.target === 'expense' && f.title && f.amountCents) {
  await db.transact(
    db.tx.expenses[id()]
      .update({ title: f.title, amountCents: f.amountCents, currency: 'EUR', createdAt: ts })
      .link({ household: householdId, paidBy: userId, participants: orderedMembers }),
  );
}

If household.memberships has no active members, orderedMembers will be an empty array, passed as participants.
- **Etki:** If all members have left a household but a member (with stale auth) calls the brain endpoint, an expense could be created with no participants list. This violates the invariant that expenses must split among someone, and the money math in computeNetCents will silently ignore such expenses (line 21: if (n === 0) continue;), leading to unrecorded transactions and incorrect debts.
- **Fix:** Check if orderedMembers is empty before applying expense fragments:
if (f.target === 'expense' && f.title && f.amountCents) {
  if (orderedMembers.length === 0) {
    skipped.push(`no active members to split "${f.title}"`);
    continue;
  }
  await db.transact(...)

### 58. 🟡 `medium` — Medium: Test suite documents and expects data corruption instead of catching it
- **Boyut:** Money debt/settlement math (`money-correctness`)
- **Yer:** `src/features/money/money-logic.test.ts:66-75`
- **Kanıt:** it('ignores ids that are not members (removed users)', () => {
    const net = computeNetCents(
      members.slice(0, 2),
      [{ amountCents: 900, paidById: 'ghost', participantIds: ['a', 'b', 'ghost'] }],
      [],
    );
    expect(net.a).toBe(-300);
    expect(net.b).toBe(-300);
    expect('ghost' in net).toBe(false);
  });
- **Etki:** This test expects that when a user (ghost) is removed but still referenced in an expense, the system ignores them completely. However, the test itself proves the bug: the 900 cents is split 3 ways (300 per person), but only a and b are debited (totaling -600), while the payer credit of +900 is never applied. The net sum is -600 instead of 0, proving money has disappeared. The test passing masks this critical data corruption rather than catching it.
- **Fix:** Rewrite the test to validate that net balances sum to 0 (assert Object.values(net).reduce((a,b) => a+b) === 0). This will cause the test to fail and reveal the underlying bug, forcing the code to be fixed properly.

### 59. 🟡 `medium` — Index-based keys in dynamic debts list (money-screen)
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:282`
- **Kanıt:** Debts array is derived from calculations: `const debts = simplifyDebts(net).filter(...)` at line 107. When expenses are added/removed or settlements occur, the debts list can reorder or change. Using `key={idx}` means React may associate the wrong DOM node with the wrong debt if list reorders.
- **Etki:** If debts reorder between renders and user clicks 'Settle' button, they might settle a different debt than intended. While the button's closure has fresh values on click, the pattern is unreliable.
- **Fix:** Use a stable key instead of index: `key={`${d.fromId}-${d.toId}`}` creates a unique key based on the debt relationship.

### 60. 🟡 `medium` — Inconsistent theme colors in money.tsx tab guard
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/app/money.tsx:12-14`
- **Kanıt:** Line 12: `backgroundColor: '#fff'` and line 14: `color: '#9b9b9b'` use hardcoded colors instead of Roomie theme constants
- **Etki:** The Money tab shows white background and hardcoded gray text when unauthenticated, while Tasks and Kitchen tabs use Roomie.canvas and Roomie.sub respectively. This breaks visual consistency and makes the app appear to have platform quirks. If Roomie theme colors change, this tab won't update.
- **Fix:** Replace `backgroundColor: '#fff'` with `backgroundColor: Roomie.canvas` and `color: '#9b9b9b'` with `color: Roomie.sub` to match tasks.tsx and kitchen.tsx

### 61. 🟡 `medium` — Hardcoded colors in money-screen.tsx settleLabel style
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:403`
- **Kanıt:** Line 403: `settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' }` uses hardcoded white, while the settle button has `backgroundColor: Roomie.sage`. Other button labels use `color: Roomie.onAccent`
- **Etki:** The Settle button text color is hardcoded to white while the button background uses Roomie.sage. If dark mode is implemented or Roomie.sage color changes, the text may become invisible. Inconsistent with other button styling in the app (chipLabelSelected, buttonLabel both use Roomie.onAccent).
- **Fix:** Replace `color: '#fff'` with `color: Roomie.onAccent` to match the settle button's background color intent and other button styling patterns

### 62. 🟡 `medium` — TasksScreen: Stale memberIds closure in advance function
- **Boyut:** State management patterns (`state-management`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:179`
- **Kanıt:** The advance function (lines 172-194) captures memberIds (line 95) which is derived from household.memberships via sorting and mapping. When advance is called (e.g., at line 235 for 'Done' action), it uses this captured memberIds array to calculate nextTurn. If the household membership changes between when the user views the screen and when they click Done, the rotation could advance to the wrong household member.
- **Etki:** In edge cases where household membership changes (new member joins, member leaves), the chore rotation could advance to the wrong person instead of following the join-order sequence. This violates the app's design principle that 'rotation order = join order (stable; no surprises)' as stated in the comment at line 87.
- **Fix:** Move memberIds computation inside the advance function or use a useCallback that properly tracks memberIds dependency, ensuring the rotation always uses current membership data.

### 63. 🟡 `medium` — describeEvent and timeAgo functions in activity.ts have zero test coverage
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/activity/activity.ts:64-143`
- **Kanıt:** No test file exists for activity.ts. Two formatting functions: describeEvent (64-131) handles 14 activity types with metadata extraction via metaString and eur helpers; timeAgo (133-143) converts timestamps to relative strings. Zero tests for: null/missing metadata, invalid timestamps, edge cases (59 seconds vs 45, 1 second vs 0, future dates, invalid date strings).
- **Etki:** Activity feed displays corrupted text or crashes. Missing amounts show as empty. Invalid dates might render as 'NaN minutes ago' or throw errors. Users see unintelligible activity history.
- **Fix:** Add vitest tests for describeEvent covering all 14 activity types with and without optional metadata. Test metaString and eur with null/undefined. Add tests for timeAgo with edge times (0s, 44s, 45s, 59s, 60s, 3599s, 3600s, 86400s, invalid ISO strings, future timestamps).

### 64. 🟡 `medium` — parseDraft function in schema.ts has zero test coverage
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/schema.ts:67-90`
- **Kanıt:** No test file exists for schema.ts. The parseDraft function (lines 67-90) is documented as 'Salvaging parse: one malformed fragment must not kill the whole draft'. It drops invalid fragments, tracks them, and auto-generates a clarifying question if an amountless expense was dropped. Zero tests cover: dropped fragment tracking, auto-generated question logic (lines 85-87), or safeParse failure modes.
- **Etki:** Brain output validation is untested. Model JSON may be silently corrupted or partially lost without the app knowing. The auto-question logic may not trigger correctly, losing the user's intent.
- **Fix:** Add vitest tests for parseDraft covering: valid input, malformed fragments (missing required fields, wrong types), mixed valid/invalid (one good, one bad), dropped amountless expense auto-question, multiple dropped fragments, and the looseSchema catch behavior.

### 65. 🟡 `medium` — computeNetCents: Multiple expenses in one call not explicitly tested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-logic.test.ts:14-76`
- **Kanıt:** All tests in computeNetCents describe block (lines 14-76) pass exactly one expense to computeNetCents. No test passes multiple expenses to verify they accumulate correctly. Edge case: remainder distribution across multiple oddly-sized expenses is untested.
- **Etki:** If multiple expenses interact in unexpected ways (e.g., remainder pennies compound), the money math could fail silently. Unlikely but untested.
- **Fix:** Add test: computeNetCents with [expense1 (3000), expense2 (1001)] and verify sums balance. Test remainder interaction across multiple small expenses.

### 66. 🟡 `medium` — Unsafe cast of caught exception before optional chaining check
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:68`
- **Kanıt:** setErrorDetail((e as Error)?.message ?? String(e));
- **Etki:** The exception `e` is cast to `Error` before using optional chaining. If `e` is not an Error object and does not have a `.message` property, the optional chaining will correctly return undefined, so the fallback works. However, this pattern is fragile and could mask bugs if a non-Error is caught and contains no `.message` property.
- **Fix:** Use a type guard first: `const message = e instanceof Error ? e.message : String(e); setErrorDetail(message ?? 'Unknown error');`

### 67. 🟡 `medium` — Type assertion on unknown value without complete narrowing
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/schema.ts:79`
- **Kanıt:** const t = (f as { target?: unknown })?.target;
- **Etki:** The value `f` is `unknown` (from `z.array(z.unknown())`), so the cast to `{ target?: unknown }` is used to check if it has a `target` property. The optional chaining provides some safety, but the assertion hides the actual type. If subsequent code assumes `t` is a string or specific literal, it could fail.
- **Fix:** More explicit type checking: `const t = (typeof f === 'object' && f !== null && 'target' in f) ? (f as any).target : undefined;`

### 68. 🟡 `medium` — Unsafe error cast in exception handler with optional chaining fallback
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/cloudflare-ai.ts:62`
- **Kanıt:** const err = new Error(`${label} cloudflare-ai: ${(e as Error)?.message ?? e}`) as CfAiError;
- **Etki:** The caught exception `e` is cast to `Error` to access `.message`. If `e` is not an Error but an arbitrary value, the optional chaining prevents a runtime error, but the error message construction may be misleading. The subsequent assignment `err.status = 429` assumes `err` is mutable.
- **Fix:** Safely extract the message: `const message = e instanceof Error ? e.message : String(e); const err = new Error(...) as CfAiError;`

### 69. ⚪ `low` — Hardcoded emoji in buttons reduces accessibility of button purposes
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:244,305`
- **Kanıt:** Buttons use text like 'Done ✓' (line 244, 305) and 'Pass' without accessible descriptions. Emoji is part of the visual label but not semantically meaningful.
- **Etki:** Screen readers read emoji literally (e.g., 'Done white check mark'), which is redundant with the text. Button purpose is still conveyed by text, but emoji adds visual noise in screen reader output.
- **Fix:** Either: 1) Remove emoji from button text and use accessibilityLabel='Mark as done', or 2) Add accessible description: <Text accessibilityLabel='Done'> Done ✓ </Text> so emoji is skipped by screen readers.

### 70. ⚪ `low` — Form inputs lack autocomplete and semantic hints for better UX on web
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:144-172`
- **Kanıt:** TextInput for email (line 156-163) has keyboardType="email-address" but no autoComplete prop. Password field (line 166-172) has no autoComplete="password". Username field lacks autoComplete hints.
- **Etki:** Mobile browsers and password managers cannot auto-fill credentials. Users must type credentials manually, increasing friction and reducing security (users may use weaker passwords).
- **Fix:** Add autoComplete props where applicable: <TextInput ... autoComplete="username" /> for username, <TextInput ... autoComplete="email" /> for email, <TextInput ... autoComplete="password" /> for password.

### 71. ⚪ `low` — Unvalidated Groq API response could propagate malformed data
- **Boyut:** API request/response validation (`api-validation`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/groq.ts`
- **Kanıt:** const data = (await res.json()) as { choices?: GroqChoice[]; usage?: GroqUsage };
const choice = data?.choices?.[0];
if (!choice) {
  throw new Error(`${label} groq no choices: ${JSON.stringify(data).slice(0, 300)}`);
}
return choice;
- **Etki:** The Groq HTTP response is cast to a type without runtime schema validation. While a check exists for missing choices (line 121), if the response contains choices but with malformed structure (e.g., message field missing or content field as non-string), the code returns the invalid choice object. At index.ts:66, accessing choice.message.content would then fail, but this is caught by the outer error handler and falls back to Cloudflare. Low impact because error handling exists, but violates API validation best practices.
- **Fix:** Validate the Groq response shape using zod: const validatedData = groqResponseSchema.parse(data); const choice = validatedData.choices[0];

### 72. ⚪ `low` — Web-only component contains stale scaffold copy
- **Boyut:** File structure & architecture (`architecture`)
- **Yer:** `src/components/app-tabs.web.tsx:65`
- **Kanıt:** Line 65 contains hardcoded 'Expo Starter' text that appears in the web version of app tabs. This is leftover scaffold code from project initialization.
- **Etki:** Web users will see 'Expo Starter' branding instead of 'Roomie' in the tab bar. Minor UX issue but indicates incomplete cleanup of template code.
- **Fix:** Change line 65 from `<ThemedText type='smallBold' style={styles.brandText}>Expo Starter</ThemedText>` to `<ThemedText type='smallBold' style={styles.brandText}>Roomie</ThemedText>` or remove the brand text entirely if not needed in web layout.

### 73. ⚪ `low` — Missing error handling and state cleanup in onAdd operations
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:93-132`
- **Kanıt:** const onAdd = async () => {
  const typed = draft.trim();
  if (!typed) return;
  const resolved = resolveItem(typed);
  setDraft('');
  ...
  if (existing) {
    await db.transact(...);
  } else {
    await db.transact(...);
  }
  await logActivity(...);
};

setDraft('') is called immediately (line 97), before the transact. If the transact fails, the user's input is lost and they must retype. No error message is shown.
- **Etki:** User types 'milk', taps +, draft is cleared, but the transact fails (network error, server error). User doesn't see an error and must retype. Minor UX friction, but persistent failures could frustrate users.
- **Fix:** Move setDraft('') to after the successful transact (in the try block). Add a try-catch with error handling similar to money-screen's onAdd, which shows formError on failure and doesn't clear the input.

### 74. ⚪ `low` — Inconsistent placeholder text colors: hardcoded #9b9b9b vs Roomie.sub
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:209,216`
- **Kanıt:** placeholderTextColor="#9b9b9b" (lines 209, 216)

But in tasks-screen.tsx (288, 324) and kitchen-screen.tsx (245, 263) use:
placeholderTextColor={Roomie.sub}

Roomie.sub is defined as '#97897A' in src/constants/theme.ts:18
- **Etki:** Inconsistent color values make styling harder to maintain. If placeholder color needs to change across the app, some files will be missed. Creates subtle visual inconsistencies between screens.
- **Fix:** Replace hardcoded #9b9b9b with {Roomie.sub} in money-screen.tsx lines 209 and 216. Also fix in household.tsx (145, 203) and auth-screen.tsx (122, 147, 157, 168).

### 75. ⚪ `low` — Inconsistent color constants in money-screen.tsx styles
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:403,406,408,409`
- **Kanıt:** settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },  // line 403
expenseMeta: { fontSize: 12, color: '#9b9b9b' },  // line 406
deleteLabel: { fontSize: 15, color: '#c0392b' },  // line 408
error: { color: '#c0392b', fontSize: 14 },  // line 409

But other labels use Roomie theme values consistently (e.g., chipLabelSelected uses Roomie.onAccent).
- **Etki:** Hardcoded colors make theming difficult and inconsistent. If app adopts dark mode, these colors won't adapt. Maintenance risk if color palette changes.
- **Fix:** Replace #fff with Roomie.onAccent, #9b9b9b with Roomie.sub, #c0392b with Roomie.danger. Also fix settleLabel to use fontFamily: RoomieFonts.bodyBold instead of fontWeight: '600'.

### 76. ⚪ `low` — Inconsistent font style definition: settleLabel uses fontWeight instead of RoomieFonts
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:403`
- **Kanıt:** settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },

But everywhere else uses fontFamily from RoomieFonts (e.g., line 372: fontFamily: RoomieFonts.bodySemi)
- **Etki:** Inconsistent font system makes styling harder to maintain and may cause unexpected font rendering differences across the app.
- **Fix:** Replace fontWeight: '600' with fontFamily: RoomieFonts.bodyBold to match the rest of the codebase.

### 77. ⚪ `low` — Inconsistent ActivityIndicator color values
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:265`
- **Kanıt:** <ActivityIndicator color="#fff" />  // line 265

But household.tsx (line 302) also uses #fff. These should use theme constants.
- **Etki:** Hardcoded white color won't adapt if app adopts dark mode or theme changes.
- **Fix:** Replace hardcoded #fff with {Roomie.onAccent} in money-screen.tsx:265 and household.tsx:302.

### 78. ⚪ `low` — Inconsistent fallback name capitalization: 'Someone' vs 'someone'
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:229`
- **Kanıt:** Line 229: {mine ? 'Your turn' : (nameById[holderId ?? ''] ?? 'someone')}
Line 264: {ev.by?.id === userId ? 'You' : (nameById[ev.by?.id ?? ''] ?? 'Someone')}

Also in money-screen.tsx line 195: nameById[toId] ?? 'someone' (inconsistent with line 193: 'Someone')
- **Etki:** Inconsistent capitalization creates visual inconsistency in the UI when a member name cannot be resolved. Minor but noticeable in error cases.
- **Fix:** Standardize to 'Someone' (capitalized) in all three locations: tasks-screen.tsx:229, money-screen.tsx:195, and anywhere else the pattern appears.

### 79. ⚪ `low` — Magic number 1500 (ms) hardcoded in setTimeout
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/household/household.tsx:236`
- **Kanıt:** setTimeout(() => setCopied(false), 1500);

The 1500ms duration is hardcoded without explanation. It represents the time the 'Copied ✓' message displays.
- **Etki:** Magic number makes code less maintainable. If this timing needs to be adjusted or reused elsewhere, the value is buried in code.
- **Fix:** Extract to a named constant at the top of the component or file:
const COPY_FEEDBACK_DURATION_MS = 1500;

### 80. ⚪ `low` — Magic number 999 for borderRadius (pill shape)
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:366`
- **Kanıt:** chip: {
    borderRadius: 999,  // line 366
    ...
}

This creates a fully rounded pill but the value 999 is not semantically clear.
- **Etki:** The intent (fully rounded pill) is obscure from the number. Makes code review harder and less self-documenting.
- **Fix:** Extract as a constant or use a descriptive comment:
const PILL_BORDER_RADIUS = 999; // fully rounded pill shape
Or add inline comment: borderRadius: 999, // fully rounded pill

### 81. ⚪ `low` — nameById object construction patterns inconsistent across screens
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `src/features/money/money-screen.tsx:82-90`
- **Kanıt:** money-screen builds members first, then nameById:
const members = household.memberships.map(...).filter(...)
const nameById = Object.fromEntries(members.map(...))

tasks-screen directly builds orderedMembers and nameById:
const orderedMembers = [...household.memberships].sort(...).map(...).filter(...)
const nameById = Object.fromEntries(orderedMembers.map(...))

kitchen-screen inlines the calculation without intermediate variable
- **Etki:** Three different patterns for the same operation make the code harder to understand and maintain. Developers must trace different logic paths to understand how names are resolved.
- **Fix:** Standardize to a single pattern. The money-screen's approach (build intermediate members array, then nameById) is cleanest. Use it consistently across all three screens.

### 82. ⚪ `low` — Unused import: View
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:21`
- **Kanıt:** import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// View is imported but never used in this file. Only KeyboardAvoidingView is used (line 192)
- **Etki:** Unused import contributes to lint debt and slightly increases bundle size (though bundler tree-shaking typically removes it). No functional impact.
- **Fix:** Remove 'View,' from the import statement on line 13-22, keeping only the used imports: ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput

### 83. ⚪ `low` — Unused StyleSheet style definition: styles.container
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `/Users/serrayildirim/roomie/src/components/animated-icon.web.tsx:76-82`
- **Kanıt:** const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1000,
    position: 'absolute',
    top: 128 / 2 + 138,
  },
  // ... other styles
});

The styles.container property is defined but never referenced anywhere in the component (verified via grep -n '\.container' which returns no matches).
- **Etki:** Dead code in StyleSheet object. Contributes to code clutter and increases bundle size slightly (unused style object).
- **Fix:** Remove the unused container style object (lines 76-82) from the StyleSheet.create() call

### 84. ⚪ `low` — Index-based keys in ephemeral ack messages
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:159`
- **Kanıt:** `{ack.map((line, i) => (<Text key={i} ...>{line}</Text>))}` uses index-based key for array of acknowledgment strings. While these messages are simple text with no state and are ephemeral, using index as key is not best practice.
- **Etki:** Minimal in practice since ack contains simple text strings with no internal state. Messages are shown briefly and cleared.
- **Fix:** Use a stable key: since ack contains unique strings with emoji prefixes, use `key={line}` directly: `{ack.map((line) => (<Text key={line}...>{line}</Text>))}`

### 85. ⚪ `low` — Inline object/array creation in Collapsible styles
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/components/ui/collapsible.tsx:23,27`
- **Kanıt:** Line 23: `name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}` creates new object on every render. Line 27: `style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}` creates new style object on every render.
- **Etki:** Minor performance impact: new object allocations on each render. If this component becomes memoized in the future, these would prevent memoization from working effectively.
- **Fix:** Extract to constants: `const CHEVRON_NAME = { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }` outside component. For style, create computed value or use conditional: `style={isOpen ? styles.rotateOpen : styles.rotateClosed}` with predefined StyleSheet entries.

### 86. ⚪ `low` — Unused View import in auth-screen.tsx
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/auth-screen.tsx:21`
- **Kanıt:** Line 21: View is imported from 'react-native' but never used in the component (grepped for '<View' = 0 matches)
- **Etki:** Dead code - increases bundle size minimally but signals incomplete cleanup. This is the known linting warning mentioned in baseline.
- **Fix:** Remove View from the import statement on line 21

### 87. ⚪ `low` — CLERK_SECRET_KEY unnecessarily present in client .env.local
- **Boyut:** Secrets & config hygiene (`secrets-config`)
- **Yer:** `/Users/serrayildirim/roomie/.env.local:2`
- **Kanıt:** CLERK_SECRET_KEY=sk_test_iqh5D5UuZIIxtqcKeI6dnvYDBdxFXAkuwKSnE4XEMp
- **Etki:** Server secrets should never exist in client app .env files. While this is a test key (sk_test prefix) and not used in code, it represents incorrect secret scope and could lead to production credential leakage if this pattern is replicated.
- **Fix:** Remove CLERK_SECRET_KEY from .env.local entirely. Server secrets belong only in worker deployment configs (wrangler secret put), never in client .env files. If needed during testing, use a separate backend-only .env or pass it directly via wrangler CLI.

### 88. ⚪ `low` — Duplicate emailName utility function
- **Boyut:** State management patterns (`state-management`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:38`
- **Kanıt:** The function `emailName` (lines 38-40) is defined identically in three separate files: tasks-screen.tsx, money-screen.tsx (line 33), and kitchen-screen.tsx (line 35). Each extracts the local part of an email address.
- **Etki:** Code duplication increases maintenance burden. If the function needs to be updated or fixed, changes must be made in three places instead of one, risking inconsistency.
- **Fix:** Extract this function to a shared utility file (e.g., src/lib/email-utils.ts) and import it in all three screens.

### 89. ⚪ `low` — Inefficient participantIds derivation creates new array on each render
- **Boyut:** State management patterns (`state-management`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:111`
- **Kanıt:** Line 111: `const participantIds = pickedIds ?? members.map((m) => m.userId);` creates a new array on every render when pickedIds is null (the default state). This new array reference is then used in the map calls at lines 241 and 257, which could trigger unnecessary re-renders of chip components if they perform shallow equality checks.
- **Etki:** Performance degradation: Money screen renders an array of member chips on each render. Without memoization, each chip receives a new participantIds array reference, potentially causing unnecessary reconciliations or re-renders in expensive child components.
- **Fix:** Use useMemo to memoize the participantIds array: `const participantIds = useMemo(() => pickedIds ?? members.map((m) => m.userId), [pickedIds, members]);`

### 90. ⚪ `low` — Unnecessary type assertion on already-typed property
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/groq.ts:131`
- **Kanıt:** model: (body.model as string) ?? GROQ_MODEL,
- **Etki:** The property `body.model` is already `unknown` from `Record<string, unknown>`, but given the assignment `body.model = opts.model ?? GROQ_MODEL` on line 90, it is either a string or undefined. The cast to string before the ?? operator is redundant. Minor readability issue.
- **Fix:** Remove the unnecessary cast: `model: body.model ?? GROQ_MODEL,` or explicitly check the type if uncertain.

### 91. ⚪ `low` — emailName() function duplicated across 3 screens
- **Boyut:** Reinvented wheels (`wheel-reinvention`)
- **Yer:** `src/features/money/money-screen.tsx:33`
- **Kanıt:** function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}
Also defined identically in:
- src/features/kitchen/kitchen-screen.tsx:35
- src/features/tasks/tasks-screen.tsx:38
- **Etki:** Code duplication makes maintenance harder. If the email extraction logic needs to change, it must be updated in 3 places instead of 1.
- **Fix:** Extract emailName() to a shared utility module (e.g., src/lib/utils.ts) and import it in all three screens.

### 92. ⚪ `low` — Currency formatting (€ + .toFixed(2)) duplicated 4 times
- **Boyut:** Reinvented wheels (`wheel-reinvention`)
- **Yer:** `src/features/money/money-logic.ts:66-68`
- **Kanıt:** money-logic.ts defines:
export function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

But same pattern duplicated in:
- activity.ts:34: `€${(cents / 100).toFixed(2)}`
- brain/types.ts:35: `€${((f.amountCents ?? 0) / 100).toFixed(2)}`
- brain/apply.ts:63: `€${(f.amountCents / 100).toFixed(2)}`
- brain-input.tsx:127: `defaultValue={((f.amountCents ?? 0) / 100).toFixed(2)}`
- **Etki:** Inconsistent currency formatting across features. If precision or currency symbol changes globally, multiple files must be updated. Increases risk of formatting inconsistency.
- **Fix:** Import and use formatEur() from money-logic.ts in activity.ts, brain/types.ts, brain/apply.ts, and brain-input.tsx instead of duplicating the formatting logic.

