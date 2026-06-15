# Roomie Audit — Round 3 (raw findings)

_Tarih: 2026-06-14 · Bağımsız tur 3/3 · 20 boyut · bu tur diğer turlardan habersiz yapıldı._

> Bu ham tur çıktısıdır. Güven puanı (3 tur kaç kez buldu) ve çapraz-eleme **sadece** [`AUDIT_REPORT.md`](./AUDIT_REPORT.md)'tedir. Buradaki bulgular önem (severity) sırasına dizilidir.

**Bu turda:** 93 bulgu — 🔴 3 critical · 🟠 38 high · 🟡 27 medium · ⚪ 25 low

---

### 1. 🔴 `critical` — Silent fallback: invalid amount edit applied with original value
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:76-78`
- **Kanıt:** const cents = parseAmountToCents(amountDraft[idx]);
return cents ? { ...f, amountCents: cents } : f;
- **Etki:** When user edits an expense amount and provides invalid input (e.g., 'abc', empty string), parseAmountToCents returns null, and the ternary at line 78 returns the ORIGINAL fragment unchanged. The user's edited amount is silently discarded, and the original amount from the worker is applied to the database. The user sees the expense created with their attempted edit completely ignored. In a shared-house money app, this allows expenses to be recorded with incorrect amounts without user knowledge.
- **Fix:** Either: (1) Validate amount before enabling Confirm button - if any expense has amountDraft[idx] defined but parseAmountToCents fails, disable Confirm and show error; OR (2) If parseAmountToCents fails, skip that fragment entirely and add it to skipped items in the result. Currently line 78 silently uses the original value, which violates draft-confirm safety.

### 2. 🔴 `critical` — Missing permission rules for 11 entities - all data world-readable and writable by any authenticated user
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.perms.ts:15-21`
- **Kanıt:** const rules = {
  $users: {
    allow: {
      view: "auth.id == data.id || auth.id in data.ref('memberships.household.memberships.user.id')",
    },
  },
} satisfies InstantRules;

Only $users has permission rules. The following entities have NO permission rules defined: expenses, settlements, pantryItems, purchases, chores, choreEvents, activityEvents, personalTasks, memberships, households, profiles. Per InstantDB documentation, entities without explicit permission rules default to allowing all authenticated users full read and write access.
- **Etki:** Any authenticated user can read and write data in ANY household, regardless of membership. A user who creates an account but never joins Household X can: (1) READ all expenses/debts/settlements from Household X - seeing who paid what, how much each person owes; (2) READ all pantry items and purchase history; (3) READ all chores, tasks, activity logs; (4) WRITE/MODIFY/DELETE any of this data, tamper with expense amounts, delete chores, modify pantry state, corrupt the activity feed. This is a complete cross-household data leak and tampering surface affecting real money amounts and shared-house operations.
- **Fix:** Add permission rules for all 11 entities to instant.perms.ts to enforce household scoping. Each rule must check that the user is an active member of the entity's linked household. Example pattern:

expenses: {
  allow: {
    view: "auth.id in data.ref('household.memberships').user.id",
    create: "auth.id in data.ref('household.memberships').user.id",
    update: "auth.id in data.ref('household.memberships').user.id",
    delete: "auth.id in data.ref('household.memberships').user.id"
  }
}

Apply similar pattern to: settlements, pantryItems, purchases, chores, choreEvents, activityEvents, personalTasks, memberships, households, profiles.

### 3. 🔴 `critical` — Reliance on client-side filtering without server-side permission enforcement
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `src/features/money/money-screen.tsx:39-48`
- **Kanıt:** const { isLoading, error, data } = db.useQuery({
  memberships: {
    $: { where: { 'user.id': userId, status: 'active' } },
    household: {
      memberships: { $: { where: { status: 'active' } }, user: {} },
      expenses: { paidBy: {}, participants: {} },
      settlements: { fromUser: {}, toUser: {} },
    },
  },
});

The query filters by the current userId to find their memberships, then loads the household data. This is client-side filtering that works only because the application code is correct. Without server-side permission rules in instant.perms.ts, a malicious or modified client could bypass this filter entirely.
- **Etki:** An attacker with access to modify the app code (or intercept the InstantDB client library) could bypass the userId filter and directly query household data by ID. Even without code modification, if InstantDB client library is used in a CLI/script context, the application logic filters do not apply. The filtering approach assumes the client is trustworthy, which is never safe in a permission-sensitive application handling real money.
- **Fix:** Server-side permission rules in instant.perms.ts are the only true enforcement mechanism. Once permission rules are added (see previous finding), remove reliance on client-side filtering as the security boundary. Client-side filters can remain as UX optimizations, but permission enforcement must happen at the database layer.

### 4. 🟠 `high` — No accessibilityLabel on 90%+ of interactive Pressable buttons
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:285-290 (settle button), src/features/tasks/tasks-screen.tsx:233-238 (pass button), 240-245 (done button), src/features/auth/auth-screen.tsx:212-219 (primary button)`
- **Kanıt:** Settle button (money line 285): <Pressable style={styles.settle} onPress={() => onSettle(...)}> has no accessibilityLabel. Pass button (tasks line 233) and Done button (line 240) also lack labels. Sign-in/sign-up buttons in auth have no labels. Only 6 delete buttons across 3 screens have accessibilityLabel; ~100+ other pressables lack any.
- **Etki:** Screen reader users cannot identify button purpose. Violates WCAG 2.1 Level A (1.3.1 Info and Relationships, 4.1.2 Name, Role, Value). Makes app unusable for blind/low-vision users who rely on screen readers to navigate.
- **Fix:** Add accessibilityLabel to all Pressable/Button elements: <Pressable accessibilityLabel={labelText} ... >. Examples: settle button -> 'Settle debt', pass button -> 'Pass turn on {chore.name}', done button -> 'Mark {chore.name} done'

### 5. 🟠 `high` — Money screen settle button missing accessibilityLabel
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:285-290`
- **Kanıt:** <Pressable style={styles.settle} onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}><Text style={styles.settleLabel}>Settle</Text></Pressable> has no accessibilityLabel. Compare to delete button (line 314) which has accessibilityLabel={`Delete ${e.title}`}
- **Etki:** Screen reader announces only 'Settle' with no context about which debt is being settled (e.g., 'You owe Alex €15'). User cannot understand button purpose without visual context.
- **Fix:** Add accessibilityLabel={`Settle debt: ${youPay ? 'you owe ' + nameById[d.toId] : nameById[d.fromId] + ' owes you'} ${formatEur(d.amountCents)}`}

### 6. 🟠 `high` — Tasks screen pass and done buttons lack accessibilityLabel
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:233-245`
- **Kanıt:** Pass button (233-238): <Pressable style={styles.pass} onPress={() => advance(chore.id, chore.name, holderId, 'pass')}><Text style={styles.passLabel}>Pass</Text></Pressable> no accessibilityLabel. Done button (240-245): similar structure, no label.
- **Etki:** Screen reader users cannot distinguish between 'Pass' and 'Done' actions contextually. Multiple chores on screen means multiple unlabeled buttons that sound identical to screen reader.
- **Fix:** Add accessibilityLabel to pass button: `Pass turn on ${chore.name}` and done button: `Mark ${chore.name} done`

### 7. 🟠 `high` — Auth screen buttons lack accessibilityLabel and accessibilityRole
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/auth/auth-screen.tsx:212-219 (PrimaryButton), 224-226 (LinkButton)`
- **Kanıt:** PrimaryButton Pressable (212-219) has no accessibilityLabel, accessibilityRole, or other a11y props. LinkButton (224-226) similarly bare. Delete compare to tasks-screen which does have accessibilityLabel on delete buttons.
- **Etki:** Screen readers cannot announce button type or purpose. 'Sign in', 'Sign up', 'Verify', and toggle links between modes are all inaccessible. Users don't know if they're pressing a toggle, a link, or a button.
- **Fix:** Add accessibilityRole='button' and accessibilityLabel={label} to both PrimaryButton and LinkButton Pressables

### 8. 🟠 `high` — Kitchen screen missing accessibilityLabels on action buttons (claim, got-it, out)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:294-309`
- **Kanıt:** Claim button (298): <Pressable style={styles.claim} onPress={() => onClaim(it.id, it.name)}><Text>I'll get it</Text></Pressable> no label. Got-it button (294): similar. Out button (327): <Pressable style={styles.outButton} onPress={() => onOut(it.id, it.name)}> no label.
- **Etki:** Screen readers cannot distinguish claim/got-it/out actions. When shopping list has 5+ items, user hears 5 identical unlabeled buttons with no item context.
- **Fix:** Add accessibilityLabel to each: claim -> `I'll get ${it.name}`, got-it -> `Mark ${it.name} got it`, out -> `Move ${it.name} to shopping list`

### 9. 🟠 `high` — Money screen chips (payer/participant selection) lack accessibilityLabel and role
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:223-236`
- **Kanıt:** Paid-by chips (223-236): <Pressable style={[styles.chip, ...]} onPress={() => setPaidById(m.userId)}> has no accessibilityLabel, role, or state announcement. 'Split between' chips (240-255) identical issue. No way to announce 'selected' state to screen reader.
- **Etki:** Screen readers cannot identify chips as toggles/selectable items. Cannot announce selected state (who is currently selected as payer). User cannot navigate expense form accessibly.
- **Fix:** Add accessibilityRole='radio' (or 'button'), accessibilityLabel with person name, and accessibilityState={{ selected }} to each chip

### 10. 🟠 `high` — Brain input missing accessibilityLabel on interactive buttons (send, cancel, confirm)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/brain/brain-input.tsx:109-148`
- **Kanıt:** Send button (109): <Pressable style={styles.send} onPress={onSend} disabled={phase === 'thinking'}> no label. Cancel button (142): <Pressable style={styles.cancel} onPress={reset}> no label. Confirm button (146): <Pressable style={styles.confirm} onPress={onConfirm}> no label.
- **Etki:** Screen readers cannot identify button purpose. User cannot activate brain (send), undo action (cancel), or confirm changes (confirm) via screen reader.
- **Fix:** Add accessibilityLabel and accessibilityRole='button' to send (✨), cancel, and confirm buttons

### 11. 🟠 `high` — Kitchen screen: setDraft cleared before async operations complete, with no error handling
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:93-132`
- **Kanıt:** Line 97: setDraft('') is called BEFORE the await db.transact() calls on lines 103-107 and 110-123. There is no try/catch to handle failures. If the transact fails, the UI shows an empty field but the data was not saved, and the user has no error feedback.
- **Etki:** Users add items to the kitchen, the field clears optimistically, but if the database transaction fails (network error, permission error, etc.), the user receives no error notification and thinks the item was added when it wasn't. This can lead to forgotten shopping items.
- **Fix:** Wrap the transact calls in try/catch, and only clear setDraft() on success in the try block, not before. Display error messages on catch (similar to money-screen.tsx).

### 12. 🟠 `high` — Tasks screen: onAddHouse clears houseDraft before async operations, with no error handling
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:130-148`
- **Kanıt:** Line 134: setHouseDraft('') is called BEFORE await db.transact() on line 136. No try/catch block wraps the transact. If the database operation fails, the user receives no error feedback and thinks the chore was added.
- **Etki:** Chores added by users disappear from the input field but fail silently on database errors. Users may add the same chore multiple times thinking it didn't go through, or believe it was saved when it wasn't.
- **Fix:** Wrap the db.transact and logActivity calls in try/catch. Only clear setHouseDraft() on success. Provide error feedback to the user (e.g., a toast or error message).

### 13. 🟠 `high` — Tasks screen: onAddMine clears mineDraft before async operations, with no error handling
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:151-162`
- **Kanıt:** Line 153: setMineDraft('') is called BEFORE await db.transact() on line 156. No try/catch block. Same issue as onAddHouse - silent failure with no user feedback.
- **Etki:** Personal tasks fail silently. Users believe their tasks are saved when the database operation may have failed.
- **Fix:** Wrap db.transact in try/catch. Only clear setMineDraft() on success. Add error feedback.

### 14. 🟠 `high` — Kitchen screen: onOut, onClaim, onGotIt, onBridgeConfirm have no error handling on async operations
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:134-212`
- **Kanıt:** Functions onOut (line 134), onClaim (line 145), onGotIt (line 158), and onBridgeConfirm (line 181) all contain await db.transact() calls with NO surrounding try/catch blocks. If any transact fails, the error will propagate uncaught, potentially crashing the component or silently hanging.
- **Etki:** Shopping list actions (mark out, claim item, confirm 'got it'), and the Money bridge all fail silently without user feedback. If an error occurs, the app may crash or hang with no explanation to the user.
- **Fix:** Add try/catch blocks around each db.transact call. Provide appropriate user feedback on errors (e.g., Toast notification, Alert dialog, or error state in UI).

### 15. 🟠 `high` — Tasks screen: advance() function has no error handling for complex transaction
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:172-194`
- **Kanıt:** The advance() function (lines 172-194) contains a multi-operation transact (lines 181-186) with NO try/catch. If this fails, the chore turn advance fails silently. Callers invoke this from pressable handlers but there's no error feedback.
- **Etki:** Chore rotations fail silently. Users tap 'Done' or 'Pass' but the turn doesn't advance and they don't know why. This breaks the fair chore assignment model.
- **Fix:** Add try/catch block around the transact and logActivity calls. Show error feedback to user (Alert.alert or toast). Consider disabling buttons during the async operation like money-screen does.

### 16. 🟠 `high` — Money screen: onSettle has no error handling on async debt settlement
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:183-197`
- **Kanıt:** onSettle (lines 183-197) contains await db.transact() and await logActivity() with NO try/catch block. If either fails, the app will uncaught error.
- **Etki:** Critical operation: settling debts between roommates fails silently. If a settlement transaction fails, the UI shows no error but the debt settlement never happened, leading to financial inconsistency.
- **Fix:** Add try/catch block with error feedback. Disable the button during the operation. This is real money between housemates - failures must be visible.

### 17. 🟠 `high` — Household join: TOCTOU race condition between household existence check and membership creation
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/household/household.tsx:161-194`
- **Kanıt:** Lines 170-172: queryOnce checks if household exists. Lines 178-182: If it exists, a transact creates a membership linking to that household ID. BETWEEN these two operations, another user could delete the household. The membership creation will then succeed but point to a non-existent household, creating orphaned data.
- **Etki:** Users can join households that have been deleted between the check and the link operation. This creates data inconsistency - orphaned membership records pointing to deleted households.
- **Fix:** Consider making the household existence check and membership creation part of the same transaction, or validate the household exists again before linking. Alternatively, accept the race and handle the error when the link fails due to non-existent household.

### 18. 🟠 `high` — Kitchen screen: Race condition between duplicate-check and item creation
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/kitchen/kitchen-screen.tsx:88-132`
- **Kanıt:** Line 88: items are fetched from the render-time subscription. Lines 100-101: onAdd() checks if item already exists using that render-time snapshot. BUT lines 103-107 and 110-123: the transact happens asynchronously. If another roommate adds the same normalized item BETWEEN the check and the transact, a duplicate will be created. The render-time snapshot is stale by execution time.
- **Etki:** Two roommates can independently add the same pantry item (e.g., 'milk') within the same few hundred milliseconds, resulting in duplicate pantry items with the same normalized name. This breaks the deduplication logic.
- **Fix:** Move the duplicate check into the transact operation itself (server-side check), or use optimistic locking / conditional writes to ensure the item doesn't exist at write time.

### 19. 🟠 `high` — personalTasks can be read by unauthorized household members
- **Boyut:** InstantDB schema & permissions (`db-schema-perms`)
- **Yer:** `instant.schema.ts:96-102 and instant.perms.ts:15-21`
- **Kanıt:** Schema defines personalTasks: i.entity({...}) with link personalTaskOwner to $users and personalTaskHousehold to households. Comment on line 96-97 states 'One owner, no rotation. Scoped to the household so "need a favor" can read them later.' However, instant.perms.ts has no rules for personalTasks, so any authenticated user can read any household's personal tasks without being a member.
- **Etki:** Even though the app design intends for personal tasks to be readable only within a household (for the 'need a favor' feature), the absence of permission rules means any user can read any other user's personal tasks across all households. This violates privacy - personal tasks may contain sensitive information intended only for housemates.
- **Fix:** Add permission rule for personalTasks:

personalTasks: {
  allow: {
    view: "auth.id in data.ref('household.memberships').user.id",
    create: "auth.id == data.ref('owner.id')",
    update: "auth.id == data.ref('owner.id')",
    delete: "auth.id == data.ref('owner.id')"
  }
}

This allows: viewing only if you're in the household; creating/updating/deleting only if you own the task.

### 20. 🟠 `high` — Unhandled promise rejection in onSettle (Money module)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/money/money-screen.tsx:287`
- **Kanıt:** onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}

where onSettle is an async function (line 183) that calls db.transact without try-catch
- **Etki:** If a settlement transaction fails (network error, permission denied, DB error), the app will silently crash or show a console error with no user feedback. User won't know if the debt settlement actually saved to the database.
- **Fix:** Wrap the onPress callback and onSettle function with error handling: `onPress={() => void onSettle(d.fromId, d.toId, d.amountCents).catch(err => setError('Could not settle. Try again.'))}` or add a try-catch inside onSettle with error state management.

### 21. 🟠 `high` — Unhandled promise rejection in onAddSuggestion (Tasks module)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:355`
- **Kanıt:** onPress={() => onAddSuggestion(s.name)}

where onAddSuggestion is an async function (line 114) that calls db.transact without error handling
- **Etki:** If adding a suggested chore fails (DB error, network failure), the app crashes silently with no user feedback. The chore appears to be added to the draft but never actually saves.
- **Fix:** Add try-catch in onAddSuggestion or wrap the callback: `onPress={() => void onAddSuggestion(s.name).catch(err => setError('Could not add. Try again.'))}` with appropriate error state.

### 22. 🟠 `high` — Unhandled transact rejections in multiple Kitchen operations
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:135,146,161`
- **Kanıt:** onOut (line 135), onClaim (line 146), and onGotIt (line 161) all call `await db.transact(...)` without try-catch blocks
- **Etki:** Pantry item operations (marking item out, claiming item, restocking) that fail silently leave the UI in an inconsistent state. User may think an action succeeded when it didn't, leading to duplicate entries or lost item state.
- **Fix:** Add try-catch blocks to each function and manage error state (e.g., toast notification or error message in UI).

### 23. 🟠 `high` — Unhandled transact rejections in Kitchen bridge confirmation
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:189`
- **Kanıt:** onBridgeConfirm calls `await db.transact(...)` at line 189 without error handling, followed by logActivity at line 203
- **Etki:** If adding an expense via the kitchen-to-money bridge fails, logActivity is still called, leaving the activity log desynchronized from actual expenses. User sees the ack but the expense doesn't exist.
- **Fix:** Wrap the transact call in try-catch; only call logActivity on success.

### 24. 🟠 `high` — Unhandled transact rejections in Tasks module (onAddHouse, onAddMine, onMineDone, onMineDelete)
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:136,156,165,169`
- **Kanıt:** onAddHouse (136), onAddMine (156), onMineDone (165), onMineDelete (169) all have unhandled db.transact() calls
- **Etki:** Task operations fail silently with no user feedback. Especially dangerous for onAddMine/onAddHouse which clear the input field before awaiting, so user won't know if it saved.
- **Fix:** Wrap all transact calls in try-catch and add error feedback (toast/state). Move input clearing to after successful transaction.

### 25. 🟠 `high` — Potential null dereference in applyFragments when queried arrays are undefined
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/brain/apply.ts:45,69,120`
- **Kanıt:** After checking `const household = data.households[0]; if (!household) return ...` (line 42-43), the code assumes household.memberships, household.pantryItems, and household.chores exist (lines 45, 69, 120). If InstantDB returns undefined/null for nested arrays, `.find()` will crash.
- **Etki:** Brain input with pantry or chore fragments crashes if the household query doesn't fully load those nested entities, leaving the app in error state.
- **Fix:** Add defensive checks: `const existing = household.pantryItems?.find(...) ?? null` and similar for household.memberships and household.chores.

### 26. 🟠 `high` — Missing error handling in ApplyFragments throws crash without user feedback
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/brain/brain-input.tsx:82`
- **Kanıt:** onConfirm calls `await applyFragments(...)` inside try-catch (line 81-91), but applyFragments itself throws uncaught errors from db.transact calls if they fail (lines 57, 75, 83, 101, 130, 140 in apply.ts)
- **Etki:** If any transact within applyFragments fails, the promise rejects and the catch block sets `phase: 'error'` but the partial fragments may have been written, leading to inconsistent state.
- **Fix:** Wrap each db.transact call in apply.ts with try-catch and collect errors; return them in ApplyResult so the UI can show which fragments failed.

### 27. 🟠 `high` — Unhandled db.transact in onSettle (Money) called from Pressable without error boundary
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/money/money-screen.tsx:183-197`
- **Kanıt:** onSettle function has no try-catch. logActivity is called after transact (line 190), but if transact fails, logActivity is still attempted.
- **Etki:** Settlement debt write may fail but activity log will show it succeeded. Household ledger becomes inconsistent with activity feed.
- **Fix:** Wrap transact in try-catch; only log activity on successful settlement.

### 28. 🟠 `high` — Creditor can create settlement records by clicking Settle button, falsely attributed to debtor
- **Boyut:** Money debt/settlement math (`money-correctness`)
- **Yer:** `src/features/money/money-screen.tsx:285-290`
- **Kanıt:** The settle button is rendered for all debts involving the user (both debtors and creditors), with onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}. There is no validation that the user initiating settlement is the debtor.
- **Etki:** A creditor can click Settle to create a false settlement record showing the debtor paid them, when the debtor may not have actually paid. The activity log (line 192) always attributes settlement to fromId (the debtor), so a creditor-initiated settlement appears to be debtor-initiated, creating a fraudulent record of payment.
- **Fix:** Add authorization check in onSettle to verify userId === fromId, ensuring only the debtor can create a settlement. Alternatively, show the Settle button only to debtors (youPay === true) or change activity logging to use the actual userId who clicked settle (line 192: actorId: userId instead of actorId: fromId).

### 29. 🟠 `high` — Index-as-key in debts list
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:282`
- **Kanıt:** debts.map((d, idx) => { ... <View key={idx} ...})
- **Etki:** If debts are settled and removed from the list, React will misidentify which debt corresponds to which View element. This can cause incorrect data to be displayed across debt rows, state bugs where the wrong debt is settled, or UI inconsistency when debts change order.
- **Fix:** Use a stable unique key derived from the debt data, such as: key={`${d.fromId}-${d.toId}-${d.amountCents}`} or if debts have IDs, use those.

### 30. 🟠 `high` — Index-as-key in fragments list with index-based state
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:122`
- **Kanıt:** fragments.map((f, idx) => ( <View key={idx} ... {f.target === 'expense' ? ( <TextInput ... onChangeText={(v) => setAmountDraft((d) => ({ ...d, [idx]: v }))} ... <Pressable onPress={() => setFragments((fs) => fs.filter((_, i) => i !== idx))}
- **Etki:** Fragment list items are keyed by index while also storing state (amountDraft) by the same index. When a fragment is deleted via filtering at line 133, all subsequent fragments' indices shift, causing amount edits to be associated with the wrong fragments. For example, if fragment 0 is deleted, fragment 1's amount edit key shifts from 1 to 0, losing the edit or applying it to the wrong item.
- **Fix:** Use a stable unique key for each fragment (e.g., a UUID or hash of fragment content). Update amountDraft to use this key instead of index: store as `{ [fragmentKey]: value }` instead of `{ [idx]: value }`.

### 31. 🟠 `high` — Hard-coded colors in money.tsx break dark mode
- **Boyut:** React Native / Expo idioms (`rn-expo-idioms`)
- **Yer:** `src/app/money.tsx:12-14`
- **Kanıt:** const backgroundColor = '#fff'; const color = '#9b9b9b';  while kitchen.tsx and tasks.tsx use Roomie.canvas and Roomie.sub which respond to theme changes
- **Etki:** In dark mode, the 'Sign in first' fallback screen will display white background with dark gray text instead of dark background with light gray text, making it unreadable and breaking the intended dark mode UI.
- **Fix:** Replace `'#fff'` with `Roomie.canvas` and `'#9b9b9b'` with `Roomie.sub`, matching the pattern used in kitchen.tsx and tasks.tsx

### 32. 🟠 `high` — Chore matching logic too permissive in brain apply
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/brain/apply.ts:122`
- **Kanıt:** const chore = household.chores.find((c) => {
        const name = c.name.toLowerCase();
        return name.includes(needle) || needle.includes(name);
      });
- **Etki:** If the brain extracts a short common word like 'the' as a chore_done fragment, any chore containing 'the' (e.g., 'wash the dishes', 'clean the bathroom') will be matched and marked as done. A note like 'I did the laundry' could trigger the first chore containing 'the' instead of the intended chore.
- **Fix:** Replace substring matching with word boundary or fuzzy matching. At minimum: (1) require matches to be meaningful substrings (length > 2), (2) prefer exact matches or full-word boundaries over substring overlap, or (3) use a proper fuzzy matching algorithm with distance threshold.

### 33. 🟠 `high` — Complete absence of kitchen logic tests (normalize, aging, aliases)
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/kitchen/normalize.ts, src/features/kitchen/aging.ts, src/features/kitchen/alias-data.ts`
- **Kanıt:** No .test.ts files exist for any kitchen module. Functions like normalizeItemName, ageOf, stripPlural, levenshtein, foldDiacritics, and resolveItem are production code used actively by kitchen-screen.tsx.
- **Etki:** Critical kitchen pantry features have zero test coverage: (1) Item normalization (what happens when users type 'milk' vs 'süt' vs 'sutt'?), (2) Aging state machine (are items correctly archived at 2.0x shelf life?), (3) Diacritic folding and plural stripping for non-English items. Any bug in these functions silently breaks the kitchen's core functionality for shared pantry management.
- **Fix:** Create src/features/kitchen/normalize.test.ts and src/features/kitchen/aging.test.ts with comprehensive test suites for: (1) normalizeItemName edge cases (empty string, diacritics, plurals, unknown items), (2) ageOf boundary conditions (exactly at 1.0x, 1.5x, 2.0x multiples), (3) levenshtein distance edge cases (empty strings, identical strings, cap parameter).

### 34. 🟠 `high` — Brain applyFragments function completely untested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/brain/apply.ts`
- **Kanıt:** export async function applyFragments(...): Promise<ApplyResult> { ... 150 lines of database writes and logic }; No test file exists for this module.
- **Etki:** applyFragments is the critical confirm-time writer that converts approved brain draft fragments into real database records (expenses, pantry items, chores, personal tasks, settlements). Zero tests verify: (1) expense creation with correct amount and participants, (2) pantry item normalization and de-duplication logic, (3) chore turn advancement, (4) activity logging correctness. Real user data (money, chores, pantry) is written to the database with no automated verification.
- **Fix:** Create src/features/brain/apply.test.ts with mocked InstantDB. Test each fragment target: expense with different amounts, pantry items (new vs existing, different statuses), chore done (turn advancement), personal task. Mock logActivity and db.transact to verify the correct calls are made.

### 35. 🟠 `high` — worker schema.parseDraft function untested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `workers/brain/src/schema.ts:67-90`
- **Kanıt:** export function parseDraft(raw: string): { draft: Draft; dropped: number } { ... } Located in a worker, not tested by the app's vitest suite.
- **Etki:** parseDraft is the input validation boundary for all brain output. It parses JSON from the LLM, validates fragments, and salvages amountless expenses by auto-generating a clarifying question. Zero tests verify: (1) malformed JSON throws (expected), (2) fragments with missing required fields are dropped, (3) the auto-question logic works for amountless expenses, (4) edge cases like 8+ fragments (capped at 8). A bug here silently corrupts or loses user input from the brain.
- **Fix:** Create workers/brain/src/schema.test.ts with vitest. Test parseDraft with: valid draft, missing required fields (title for expense, item for pantry), malformed JSON, 9+ fragments (verify capped at 8), amountless expense triggering auto-question, existing question preservation.

### 36. 🟠 `high` — Unsafe error casting in catch block for unknown exception
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:68`
- **Kanıt:** } catch (e) {
  setErrorDetail((e as Error)?.message ?? String(e));
- **Etki:** The caught exception 'e' is of type unknown, but is blindly cast to Error. If the error thrown is not an Error (e.g., a string, object, null), then accessing .message will fail at runtime. If e is not an Error, the fallback String(e) is good, but the cast hides the real type check.
- **Fix:** Check the actual type: } catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  setErrorDetail(msg);

### 37. 🟠 `high` — Unsafe error casting in exception handler with type coercion
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/index.ts:70`
- **Kanıt:** } catch (e) {
  const status = (e as GroqHttpError).status;
  console.log(JSON.stringify({
    metric: 'draft_fallback',
    from: 'groq',
    status,
    message: (e as Error).message?.slice(0, 200),
  }));
- **Etki:** The caught error 'e' is unknown, but the code casts it to both GroqHttpError and Error in the same block. If e is neither type, accessing .status or .message will silently be undefined. This should check the actual error type first.
- **Fix:** Properly narrow the type: } catch (e) {
  const err = e instanceof Error ? e : new Error(String(e));
  const status = (err as GroqHttpError).status ?? 'unknown';
  // Safe access now

### 38. 🟠 `high` — Unsafe error casting in catch handler with double type coercion
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/cloudflare-ai.ts:62`
- **Kanıt:** } catch (e) {
  const err = new Error(`${label} cloudflare-ai: ${(e as Error)?.message ?? e}`) as CfAiError;
  err.status = 429;
- **Etki:** Same pattern as groq.ts: catch(e) where e is unknown, then cast to Error, then cast the newly-created Error to CfAiError. This hides type information and is unsafe if e is not an Error.
- **Fix:** Properly handle the unknown error: } catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  const err = Object.assign(new Error(`${label} cloudflare-ai: ${msg}`), { status: 429 }) as CfAiError;
  throw err;

### 39. 🟠 `high` — Global per-isolate rate limiting vulnerable to bypass via redeploy and multi-location attacks
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:23-35`
- **Kanıt:** const DAILY_CAP = 200;
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
- **Etki:** A leaked JWT token can exhaust the entire household's 200-call daily budget. The counter resets on worker redeploy/idle, allowing attackers to reset the limit by triggering idle timeouts. Attackers can also distribute requests across Cloudflare edge locations where different isolates have independent counters, completely bypassing the cap.
- **Fix:** Migrate from per-isolate in-memory counter to Cloudflare KV for persistent, global rate limiting: `await env.KV.put('rate-limit-' + userId, count, {expirationTtl: 86400})` keyed per Clerk user ID, checked before executing classify(). This ensures one limit per household member regardless of isolate or location.

### 40. 🟠 `high` — Rate limiting is not per-user; one leaked token burns entire household's daily quota
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:110`
- **Kanıt:** if (overCap()) return json({ error: 'daily cap reached' }, 429);
- **Etki:** The household's 200 daily calls are shared across all roommates without individual limits. If one roommate's token leaks, an attacker can use all 200 calls in one household, making the feature unavailable to all other members for the rest of the day.
- **Fix:** Extract userId from verified JWT and rate-limit per user: const userId = await verifyClerkJwt(token, env); if (await isUserOverCap(userId, env)) return json({error: 'your daily cap reached'}, 429); Implement per-user KV counter: `await env.KV.get('rate-' + userId)` with household-level quotas if multi-tenant isolation is needed.

### 41. 🟠 `high` — CORS allows any origin to send requests with Bearer tokens, enabling token theft via CSRF
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:37-40`
- **Kanıt:** const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};
- **Etki:** Any malicious website can make a POST request from a user's browser to the worker with the user's Bearer token in the Authorization header. CORS * + Authorization header exposure allows cross-site request forgery attacks to steal tokens (via JavaScript reading response) or perform actions on behalf of the user.
- **Fix:** Remove 'authorization' from 'access-control-allow-headers' and implement token rotation or use credentials: 'include' with specific origin whitelist. At minimum, change CORS to: 'access-control-allow-origin': 'https://roomie-app.domain', 'access-control-allow-headers': 'content-type' (no authorization). Let the app use secure, httpOnly cookies or pass auth via custom headers that CORS blocks.

### 42. 🟡 `medium` — Hardcoded placeholder colors not using theme in multiple screens
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/auth/auth-screen.tsx:122, 147, 157, 168`
- **Kanıt:** placeholderTextColor="#9b9b9b" appears in 4 TextInput fields instead of placeholderTextColor={Roomie.sub}
- **Etki:** Theme color changes won't apply to placeholders in auth flow; inconsistent styling across app since other screens (kitchen, tasks, brain) use Roomie.sub correctly. If dark mode is implemented later, these hardcoded grays won't adapt.
- **Fix:** Replace all instances of placeholderTextColor="#9b9b9b" with placeholderTextColor={Roomie.sub} in auth-screen.tsx, money-screen.tsx, and household.tsx

### 43. 🟡 `medium` — Hardcoded colors in money-screen styles break theme consistency
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:403, 406, 408, 409`
- **Kanıt:** settleLabel: { color: '#fff' } (line 403), expenseMeta: { color: '#9b9b9b' } (406), deleteLabel: { color: '#c0392b' } (408), error: { color: '#c0392b' } (409)
- **Etki:** White text on sage button won't work correctly in dark mode. Placeholder grays and error reds hardcoded instead of theme constants. Violates design system where all colors should come from Roomie theme constants.
- **Fix:** Replace '#fff' with Roomie.onAccent, '#9b9b9b' with Roomie.sub, and '#c0392b' with Roomie.danger throughout money-screen.tsx styles

### 44. 🟡 `medium` — Household screen missing accessibility on critical actions (copy code, leave home, mode toggle)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/household/household.tsx:273-274 (copy), 280-281 (leave), 81 (mode toggle)`
- **Kanıt:** Copy button (273): <Pressable style={styles.copyButton} onPress={onCopy}> no label. Leave button (280): <Pressable onPress={onLeave} style={styles.leave}> no label. Mode toggle (81): <Pressable onPress={() => setMode(...)}>  no label.
- **Etki:** Screen readers cannot identify action purpose. User cannot copy invite code, leave home, or switch between create/join modes via screen reader.
- **Fix:** Add accessibilityLabel to copy button, leave button, and mode toggle link

### 45. 🟡 `medium` — No internationalization (i18n) infrastructure; all UI strings hardcoded in English
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:274, src/features/tasks/tasks-screen.tsx:335, src/features/kitchen/kitchen-screen.tsx:317, src/features/auth/auth-screen.tsx:59, 96, 141`
- **Kanıt:** 'You're all square. 🤍' (money 274), 'All quiet. 🌿' (tasks 335), 'Pantry's bare.' (kitchen 317), 'Could not finish signing in.' (auth 59), 'Check your email' (auth 117), dozens more hardcoded English strings with no translation layer, no i18n library, no string constants.
- **Etki:** App cannot be localized to other languages. Turkish examples in placeholders ('süt aldım 5€') show intent to support non-English users, but no mechanism exists. Real roommates in non-English countries cannot use this app in their language.
- **Fix:** Create i18n constants file (src/i18n/strings.ts or similar) with translation keys, integrate a library like i18n-js or react-i18next, extract all hardcoded strings to keys like 'money.allSquare', 'tasks.quietHome', etc.

### 46. 🟡 `medium` — Placeholder colors hardcoded in money and household screens (not theme-aware)
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:209, 216; src/features/household/household.tsx:145, 203`
- **Kanıt:** Money screen: placeholderTextColor="#9b9b9b" on 2 inputs. Household screen: placeholderTextColor="#9b9b9b" on 2 inputs. Other screens use Roomie.sub correctly (kitchen, tasks, brain).
- **Etki:** Inconsistent styling; theme changes won't propagate to all placeholders. If dark mode implemented, hardcoded gray won't adapt. Design system violation.
- **Fix:** Replace hardcoded '#9b9b9b' with {Roomie.sub} in all TextInput placeholderTextColor props

### 47. 🟡 `medium` — No accessibilityRole declarations on any interactive elements
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/auth/auth-screen.tsx, src/features/money/money-screen.tsx, src/features/tasks/tasks-screen.tsx, src/features/kitchen/kitchen-screen.tsx, src/features/brain/brain-input.tsx`
- **Kanıt:** No accessibilityRole='button' on Pressables, no accessibilityRole='radio' on chip selectors, no accessibilityRole='switch' on toggles. All ~150+ Pressables are semantically bare.
- **Etki:** Screen readers announce elements generically as 'button' regardless of semantic type. Cannot distinguish toggles, selectors, links, or command buttons. Violates WCAG 2.1 Level A (4.1.2).
- **Fix:** Audit and add appropriate accessibilityRole to all interactive Pressables: 'button' for actions, 'radio'/'checkbox' for selections, 'switch' for toggles, 'link' for navigation

### 48. 🟡 `medium` — Utility functions misplaced in money-logic.ts that are used across features
- **Boyut:** File structure & architecture (`architecture`)
- **Yer:** `src/features/money/money-logic.ts:70-80`
- **Kanıt:** nowMs() and parseAmountToCents() are exported from money-logic.ts but are generic utility functions (not money-specific). They are imported by kitchen-screen.tsx, tasks-screen.tsx, brain-input.tsx, and brain/apply.ts. The comment at line 70-71 states: 'Module-level so the React Compiler purity lint doesn't flag Date.now() inside component-scope handlers.' This is a general React concern, not money-specific.
- **Etki:** Creates inappropriate coupling between features (kitchen, tasks, brain depend on the money feature for utilities). Makes the money module a catch-all for unrelated utilities, violating separation of concerns. Moving features or refactoring money becomes harder. The module name suggests domain-specific functionality, but it's being used as a shared utility library.
- **Fix:** Create src/lib/utils.ts (or similar) with these shared utility functions: export const nowMs = (): number => Date.now(); and export function parseAmountToCents(input: string): number | null { ... }. Update imports in kitchen-screen.tsx (line 27), tasks-screen.tsx (line 31), brain-input.tsx (line 13), and brain/apply.ts (line 14) to reference the new location.

### 49. 🟡 `medium` — Tasks screen: onAddSuggestion has no error handling
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:114-128`
- **Kanıt:** onAddSuggestion (lines 114-128) contains await db.transact() with NO try/catch. If the operation fails, there's no error feedback.
- **Etki:** Adding chores from the suggestion library fails silently. Users don't know if their selection worked.
- **Fix:** Add try/catch with error feedback to the user.

### 50. 🟡 `medium` — Tasks screen: onMineDone and onMineDelete have no error handling
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:164-170`
- **Kanıt:** Both onMineDone (lines 164-166) and onMineDelete (lines 168-170) contain await db.transact() calls with NO try/catch blocks.
- **Etki:** Marking personal tasks as done or deleting them fails silently. Users don't get feedback on success/failure.
- **Fix:** Add try/catch blocks with error feedback.

### 51. 🟡 `medium` — Brain apply.ts: No per-fragment error handling; one failure aborts all remaining fragments
- **Boyut:** Async & race conditions (`async-races`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/apply.ts:53-152`
- **Kanıt:** Lines 53-150: The for-loop processes fragments but each await db.transact() and logActivity() call has NO try/catch. If ANY fragment fails (e.g., chore not found, pantry item conflict), the loop terminates and the error propagates, aborting all remaining fragments. The result is an all-or-nothing outcome with no partial credit.
- **Etki:** If a user's brain input contains 5 fragments and the 2nd one fails, fragments 3-5 never execute. The user sees failure for the entire operation and loses work. The brain-input.tsx catches this at the top level but still the user sees an error instead of 'applied 1, failed 1, skipped 3' feedback.
- **Fix:** Wrap each fragment's transact in try/catch. Collect errors in a separate array. Let all fragments process (skip on error) and return partial results in applyFragments.

### 52. 🟡 `medium` — Amount TextInput and display inconsistency masking edit failures
- **Boyut:** Brain LLM apply pipeline (`brain-correctness`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:121-123`
- **Kanıt:** fragmentLine shows: `💸 ${f.title} — €${((f.amountCents ?? 0) / 100).toFixed(2)}`
But TextInput shows: defaultValue={((f.amountCents ?? 0) / 100).toFixed(2)}
Neither reflects amountDraft[idx] being edited.
- **Etki:** The fragment text display (line 123) shows the original amount from f.amountCents, not what the user is currently typing in the TextInput. When combined with the silent fallback bug (finding 1), this creates a false sense that the user's edit was successful - they see the same amount displayed, unaware it's the original amount. This obscures the critical correctness issue and degrades the user's ability to verify their inputs before confirming.
- **Fix:** Update fragmentLine to display the edited amount from amountDraft when available. Pass amountDraft as a parameter to fragmentLine and display `amountDraft[idx]` if defined, otherwise fall back to f.amountCents. Or show a preview: 'milk — €5.00 → €10.00' when edited, making the change visible.

### 53. 🟡 `medium` — emailName() utility function duplicated across three screen files
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:38-41`
- **Kanıt:** The same emailName function is defined identically in tasks-screen.tsx (line 38-41), kitchen-screen.tsx (lines 35-38), and money-screen.tsx (lines 33-36). All three have identical implementation: const local = email?.split('@')[0]?.replace(/\+.*$/, ''); return local || undefined;
- **Etki:** DRY violation makes maintenance harder; if the email parsing logic needs to change, it must be updated in three places with risk of inconsistency.
- **Fix:** Extract emailName() to a shared utility module (e.g., src/lib/email-utils.ts) and import it in all three screens.

### 54. 🟡 `medium` — Centered component duplicated across three screen files
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:369-375`
- **Kanıt:** Identical Centered component is defined in tasks-screen.tsx (lines 369-375), kitchen-screen.tsx (lines 347-353), and money-screen.tsx (lines 326-332). Same JSX structure and styling in all three.
- **Etki:** DRY violation; any UI/UX improvements or bug fixes to the Centered component must be applied in three places.
- **Fix:** Extract Centered to a shared component module (e.g., src/components/centered.tsx) and import it in all three screens.

### 55. 🟡 `medium` — Unhandled transact in household creation and join flows
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/household/household.tsx:111-124,178-182`
- **Kanıt:** onCreate (line 95) and onJoin (line 161) both call db.transact without try-catch. onCreate also seeds starter chores (lines 119-123) in a single transact batch.
- **Etki:** Household creation or joining can fail silently, leaving user in a state where they think they're in a home but the transaction never committed. The big setError('Could not...') block at line 132 catches the whole block, but transaction may have partially committed.
- **Fix:** Already has try-catch (lines 111, 178 wrap the transact), but ensure all code paths that touch transact are covered.

### 56. 🟡 `medium` — timeAgo() can return 'just now' for invalid timestamps without warning
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/activity/activity.ts:133-143`
- **Kanıt:** If `event.createdAt` is invalid or far in the future, `Number.isNaN(seconds)` check at line 136 returns 'just now', masking bad data
- **Etki:** Activity feed silently hides timestamp errors. Users won't notice if event timestamps are corrupted or null-ish.
- **Fix:** Log or return a sentinel (e.g., '?' or 'unknown time') if timestamp is invalid: `if (Number.isNaN(seconds)) return '?';`

### 57. 🟡 `medium` — InstantClerkBridge silently suppresses all auth errors with console.warn
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/auth/instant-clerk-bridge.tsx:32-34`
- **Kanıt:** catch block at line 32 only logs warning with `console.warn('Instant↔Clerk bridge failed', err)` and does not retry or notify user
- **Etki:** If Clerk→Instant auth sync fails, user remains logged in to Clerk but offline from Instant. All data queries will fail silently. No UI feedback tells the user to retry or sign out.
- **Fix:** Store bridge state in React context and expose it to the app root; show a banner if bridge fails. Retry with exponential backoff.

### 58. 🟡 `medium` — applyFragments calls logActivity without awaiting or handling its rejection
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/brain/apply.ts:62,106,108,134,144`
- **Kanıt:** Multiple logActivity calls inside applyFragments (lines 62, 106, 108, 134, 144) are awaited but wrapped in no try-catch. If logActivity fails, the whole fragment fails.
- **Etki:** One failed activity log write fails the entire fragment batch, even if the underlying data write succeeded. User sees 'Brain couldn't read that' but some data may have been saved.
- **Fix:** Wrap logActivity calls in try-catch or make them fire-and-forget (don't await). Log failures separately, don't let them bubble up.

### 59. 🟡 `medium` — stripPlural() mangles plurals with vowel+consonant+es pattern
- **Boyut:** Kitchen normalize/alias/aging (`kitchen-correctness`)
- **Yer:** `src/features/kitchen/normalize.ts:40-47`
- **Kanıt:** The stripPlural function at line 43 has the regex /(?:[^aeiou]es|sses|shes|ches)$/ which incorrectly removes 'es' from words like 'cheeses'. For example, stripPlural('cheeses') returns 'chees' instead of 'cheese', because the regex matches the 'ses' ending (where 's' is [^aeiou]) and removes the 'es'. Similarly, stripPlural('apples') returns 'appl' instead of 'apple'. This occurs because the regex is designed for words like 'boxes'→'box' (consonant before es) but fails on words like 'cheese' where there's already a letter before the pattern (e.g., 'cheeses' = 'cheese' + 's', not 'chees' + 'es').
- **Etki:** When a user types a plural form that's not explicitly listed in the alias table (e.g., typing 'cheeses' when the table has 'cheese' but not 'cheeses'), the normalizeItemName function returns a mangled singular form. This causes the code to fall back to edit-distance matching instead of the higher-confidence alias matching. For the case of 'cheeses'→'chees', the edit distance to 'cheese' is 1, so dedup still works correctly, but the confidence is downgraded from 'high' to 'low'. The code is fragile and relies on the backup edit-distance mechanism rather than getting it right the first time. If items were added to the alias table in the future that are closer in edit distance to the mangled form than the intended item, dedup could fail.
- **Fix:** Fix stripPlural to correctly handle vowel+consonant+es patterns. The regex at line 43 should be more specific about which patterns to match. Instead of /(?:[^aeiou]es|sses|shes|ches)$/, use a more restrictive pattern that only matches the intended cases (box→boxes, dish→dishes, match→matches) without breaking words that are already singular and end in these patterns. For example, match [^aeiou]s + es only when followed by a specific pattern, or add a negative lookbehind to exclude cases like cheese+s.

### 60. 🟡 `medium` — getToken function reference in dependency array may cause unnecessary bridge re-runs
- **Boyut:** State management patterns (`state-management`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/auth/instant-clerk-bridge.tsx:40`
- **Kanıt:** useEffect(..., [isSignedIn, user, getToken]) where getToken is a function that may be recreated on each render from useClerkAuth(). If getToken reference changes without isSignedIn or user changing, the effect will re-run unnecessarily.
- **Etki:** May cause redundant auth token fetching and InstantDB signIn attempts when the getToken function reference changes, even though the auth state hasn't actually changed. This could cause unnecessary network calls and potential auth state thrashing in edge cases.
- **Fix:** Remove getToken from the dependency array and add an eslint-disable-next-line comment explaining why: useEffect(..., [isSignedIn, user]). The logic already handles the case where getToken needs to be called (when isSignedIn is true and user is null), so getToken's reference shouldn't trigger the effect.

### 61. 🟡 `medium` — formatEur function untested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/money/money-logic.ts:66-68`
- **Kanıt:** export function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}
- **Etki:** This function is actively used in money-screen.tsx to display debt amounts to users (line 200, 306 of money-screen.tsx). No tests verify that negative amounts, edge cases (0 cents, very large amounts), or formatting precision are handled correctly. Users could see incorrectly formatted currency values.
- **Fix:** Add test cases for formatEur covering: zero, positive, negative amounts, amounts with rounding (e.g., 1 cent = €0.01), and large amounts (edge case 5_000_00 cents = €50,000.00)

### 62. 🟡 `medium` — Activity feed describeEvent function untested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/activity/activity.ts:64-131`
- **Kanıt:** export function describeEvent(type: string, metadata: unknown): { icon: string; text: string } { ... 60 lines of switch cases } No tests.
- **Etki:** This function formats activity feed entries that users see (e.g., 'Alice paid Bob €10'). Untested cases: (1) missing metadata fields (what if actorName is undefined?), (2) expense_added without a title, (3) debt_settled without toName, (4) all the fallback 'something' strings. Users see incorrect or placeholder text instead of proper descriptions.
- **Fix:** Add tests for describeEvent with each ActivityType and various metadata states (missing fields, null values, empty strings). Verify that the icon and text are sensible and never expose undefined/null to users.

### 63. 🟡 `medium` — Missing return type annotation on exported async function logActivity
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/activity/activity.ts:43`
- **Kanıt:** export async function logActivity(params: {
  householdId: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
})
// No return type specified; should be Promise<void>
- **Etki:** Reduces type clarity and makes refactoring risky. Callers can't see the function returns Promise<void>; if someone later adds a return value, the change could be missed. In strict mode, this should be explicit.
- **Fix:** Add explicit return type: export async function logActivity(...): Promise<void>

### 64. 🟡 `medium` — Unsafe error object construction with type assertion
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/groq.ts:114`
- **Kanıt:** const err = new Error(`${label} groq ${res.status}: ${detail.slice(0, 300)}`) as GroqHttpError;
err.status = res.status;
- **Etki:** Creating an Error and casting it to GroqHttpError, then assigning properties. TypeScript allows this but it's a fragile pattern. If GroqHttpError shape changes, the mutation will fail silently. The proper pattern is to construct with the correct type from the start.
- **Fix:** Create the error object with the correct shape: const err = Object.assign(new Error(`${label} groq ${res.status}: ...`), { status: res.status }) as GroqHttpError;

### 65. 🟡 `medium` — Non-null assertion on environment variable without validation
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/app/_layout.tsx:20`
- **Kanıt:** const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
- **Etki:** The non-null assertion (!) assumes EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is always set. If it's missing at runtime, it will be undefined and cause a crash when passed to ClerkProvider. The error will be silent until ClerkProvider tries to use it.
- **Fix:** Validate at runtime: const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required');

### 66. 🟡 `medium` — Unsafe type narrowing with 'in' operator followed by type assertion
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/activity/activity.ts:31`
- **Kanıt:** function eur(metadata: unknown): string {
  const cents =
    metadata && typeof metadata === 'object' && 'amountCents' in metadata
      ? Number((metadata as { amountCents?: unknown }).amountCents)
      : NaN;
- **Etki:** The code checks 'amountCents' in metadata but still casts to { amountCents?: unknown } instead of letting TypeScript narrow the type. The cast hides the narrowing logic. While functionally correct, it's poor type discipline and could hide bugs during refactoring.
- **Fix:** Remove the cast and let TypeScript narrow: const cents = (metadata as Record<string, unknown>).amountCents after the in check, or better yet, properly type metadata at the call site.

### 67. 🟡 `medium` — No 'aud' (audience) claim validation in Clerk JWT verification allows token reuse across different services
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/clerk-verify.ts:66-68`
- **Kanıt:** const { payload }: { payload: JWTPayload } = await jwtVerify(jwt, jwks, {
  issuer: env.CLERK_ISSUER,
});
- **Etki:** A Clerk JWT token issued for the Roomie mobile app could be used to access other services (e.g., Ollie worker, any other Clerk-protected API). The verifier only checks the issuer and signature, not the intended audience. If this token escapes, it grants access beyond just the Brain worker.
- **Fix:** Add audience validation to jwtVerify options: await jwtVerify(jwt, jwks, { issuer: env.CLERK_ISSUER, audience: 'roomie-brain-worker' }). Then ensure Clerk is configured to issue tokens with aud: 'roomie-brain-worker' in the JWT payload, or use Clerk's custom claims feature.

### 68. 🟡 `medium` — No Content-Length validation on JSON body; unbounded memory allocation risk on large payloads
- **Boyut:** Worker auth & abuse (`worker-security`)
- **Yer:** `workers/brain/src/index.ts:114`
- **Kanıt:** const body = (await request.json()) as { text?: unknown };
- **Etki:** Attacker can send a request with a multi-megabyte JSON body. The worker will attempt to parse it into memory without bounds checking, potentially causing out-of-memory errors or edge function timeouts that crash the isolate.
- **Fix:** Validate Content-Length before parsing: const contentLength = request.headers.get('content-length'); if (contentLength && parseInt(contentLength, 10) > 100_000) return json({error: 'payload too large'}, 413); Or use a streaming parser with byte limits.

### 69. ⚪ `low` — No Dynamic Type / font scaling support
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/constants/theme.ts, all style definitions`
- **Kanıt:** No allowFontScaling prop on any Text elements. All font sizes hardcoded in px (34, 16, 15, 13, 12, 11). No maxFontSizeMultiplier limits. No responsive text sizing.
- **Etki:** Users with accessibility setting 'Larger Accessibility Sizes' or system font size increased get no effect. Text sizes remain fixed, causing readability issues for low-vision users. Violates WCAG 2.1 Level AA (1.4.4 Resize Text).
- **Fix:** Add allowFontScaling={true} to all Text components (or make it default via TextStyleSheet wrapper). Implement maxFontSizeMultiplier={1.5} or similar to prevent huge text overflow.

### 70. ⚪ `low` — No accessibilityHint for complex interactions
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/tasks/tasks-screen.tsx, src/features/kitchen/kitchen-screen.tsx, src/features/money/money-screen.tsx`
- **Kanıt:** Expandable chore cards (tasks-screen 225) show/hide history on tap with no accessibilityHint explaining behavior. Kitchen items status toggle ('out' -> 'shopping list') has no hint. Money chips have no hint explaining selection mode.
- **Etki:** Screen reader users must guess how interactions work. Chore expansion, list item state transitions, and form selection modes are opaque.
- **Fix:** Add accessibilityHint props: chore card -> 'Double-tap to expand history', out button -> 'Moves item to shopping list', chips -> 'Select payer or participants to split expense'

### 71. ⚪ `low` — Settle button styling uses hardcoded white text that won't adapt to theme changes
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/features/money/money-screen.tsx:403`
- **Kanıt:** settleLabel: { color: '#fff' } hardcodes white text on sage green background (#6F7F5E). Should use Roomie.onAccent for consistency.
- **Etki:** If sage color changes in future theme updates, white text might not have sufficient contrast. Text color isn't theme-aware, violating design system.
- **Fix:** Change color: '#fff' to color: Roomie.onAccent in settleLabel style

### 72. ⚪ `low` — No focus management or tabIndex for accessibility on web
- **Boyut:** Accessibility & i18n (`accessibility-i18n`)
- **Yer:** `src/app/app-tabs.web.tsx and all screen files`
- **Kanıt:** No tabIndex management, no explicit focus order, no focus trap patterns. Web app has no keyboard navigation strategy visible.
- **Etki:** Web users cannot navigate via keyboard. No visible focus indicators. Tab order may follow DOM order, not logical flow.
- **Fix:** Add accessibilityRole, tabIndex, and onKeyDown handlers to manage focus on web platform. Test keyboard navigation path.

### 73. ⚪ `low` — Inconsistent background color initialization in tab routers
- **Boyut:** File structure & architecture (`architecture`)
- **Yer:** `src/app/money.tsx:12`
- **Kanıt:** money.tsx line 12 uses hardcoded '#fff' for backgroundColor in the fallback state when not authenticated. Other tab routers (tasks.tsx line 13, kitchen.tsx line 13) use Roomie.canvas constant from theme.
- **Etki:** Creates a visual inconsistency in error states if a user is signed into Clerk but not yet connected to InstantDB, though this is a transient state. Minor UX issue that could confuse users momentarily.
- **Fix:** Change line 12 in src/app/money.tsx from backgroundColor: '#fff' to backgroundColor: Roomie.canvas (consistent with tasks.tsx and kitchen.tsx). Add import: import { Roomie } from '@/constants/theme';

### 74. ⚪ `low` — Inconsistent placeholder color usage across screens
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:209`
- **Kanıt:** money-screen.tsx and household.tsx use hardcoded placeholderTextColor="#9b9b9b" (money-screen lines 209, 216; household lines 145, 203), while tasks-screen.tsx and kitchen-screen.tsx use placeholderTextColor={Roomie.sub} (tasks lines 288, 324; kitchen lines 245, 263).
- **Etki:** Inconsistent theming approach; hardcoded colors bypass the centralized theme system, making dark mode support and future theme changes harder.
- **Fix:** Replace hardcoded "#9b9b9b" with Roomie.sub in money-screen.tsx (lines 209, 216) and household.tsx (lines 145, 203).

### 75. ⚪ `low` — Hardcoded color values not using theme constants in money-screen
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/money/money-screen.tsx:403-409`
- **Kanıt:** money-screen styles use hardcoded colors: settleLabel '#fff' (line 403), expenseMeta '#9b9b9b' (line 406), deleteLabel '#c0392b' (line 408), error '#c0392b' (line 409). These should be Roomie.onAccent, Roomie.sub, and Roomie.danger respectively.
- **Etki:** Hardcoded colors bypass the theme system, making it harder to maintain consistent styling across the app and support dark mode.
- **Fix:** Replace: '#fff' → Roomie.onAccent, '#9b9b9b' → Roomie.sub, '#c0392b' → Roomie.danger in the styles object.

### 76. ⚪ `low` — Hardcoded color in ActivityIndicator in household.tsx and money-screen.tsx
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/household/household.tsx:302`
- **Kanıt:** Both household.tsx (line 302) and money-screen.tsx (line 265) use hardcoded color="#fff" for ActivityIndicator. This color is defined as Roomie.onAccent in theme.ts but not used here.
- **Etki:** Inconsistent theme usage; if the onAccent color changes, these indicators won't follow the theme.
- **Fix:** Change color="#fff" to color={Roomie.onAccent} in both files.

### 77. ⚪ `low` — Repeated shadow styling across multiple button components
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:409-413`
- **Kanıt:** The same shadow pattern is repeated 9 times across the codebase: shadowColor: Roomie.accent, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }. Found in tasks-screen (addButton), kitchen-screen (addButton, bridgeAdd), money-screen (button, settle), and household.tsx (button), brain-input.tsx (send).
- **Etki:** Magic number duplication makes styling updates error-prone; if button shadow needs to change, must be updated in multiple places.
- **Fix:** Define a reusable shadow style constant in theme.ts (e.g., Spacing.buttonShadow or similar) and use it consistently.

### 78. ⚪ `low` — Long applyFragments function with repetitive fragment-type handling
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/apply.ts:25-153`
- **Kanıt:** The applyFragments function (129 lines) contains a for-loop (lines 53-150) with four sequential if-blocks handling different fragment targets (expense, pantry operations, chore_done, personal_task). Each block has similar structure: validation → db.transact → log → applied.push.
- **Etki:** Deep if-else branching and repetitive patterns reduce readability; adding a new fragment type requires careful copy-pasting of the pattern.
- **Fix:** Extract each fragment handler into a separate async function (e.g., handleExpense, handlePantry, handleChore, handleTask) and dispatch via a Map<target, handler> pattern.

### 79. ⚪ `low` — Inconsistent gap spacing in StyleSheet definitions across screens
- **Boyut:** Clean code & maintainability (`clean-code`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/tasks/tasks-screen.tsx:380`
- **Kanıt:** Different container gap values across screens: tasks-screen uses gap: 12 (line 380), kitchen-screen uses gap: 14 (line 358), money-screen uses gap: 16 (line 337). No consistent spacing system.
- **Etki:** Inconsistent spacing creates visual fragmentation across screens; maintenance requires remembering different values for each screen.
- **Fix:** Define container gap as a constant (e.g., Spacing.containerGap) in theme.ts and reuse across all screens.

### 80. ⚪ `low` — No optional chaining on household.memberships.map in kitchen bridge hint text
- **Boyut:** Error & edge handling (`error-handling`)
- **Yer:** `src/features/kitchen/kitchen-screen.tsx:276`
- **Kanıt:** Text style={styles.hint}>Split equally among {household.memberships.length}</Text>

household is already null-checked, but no defensive optional chaining
- **Etki:** If memberships is unexpectedly undefined (edge case in query), the render will crash at this line.
- **Fix:** Use optional chaining: `household.memberships?.length ?? 'unknown'`

### 81. ⚪ `low` — Unused import: View not used in auth-screen.tsx
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `src/features/auth/auth-screen.tsx:21`
- **Kanıt:** import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,  // <-- imported but never used
} from 'react-native';
- **Etki:** Minor - dead import increases bundle size negligibly and creates lint debt. The file only uses KeyboardAvoidingView, not View.
- **Fix:** Remove `View,` from the import statement on line 21

### 82. ⚪ `low` — Unused function parameters in ThemedView component
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `src/components/themed-view.tsx:12`
- **Kanıt:** export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}

// lightColor and darkColor are defined in ThemedViewProps but never read
- **Etki:** Dead code in component signature - parameters are accepted but ignored. Confuses API contract and suggests incomplete implementation.
- **Fix:** Remove `lightColor?: string;` and `darkColor?: string;` from ThemedViewProps type definition (lines 7-8), and remove their destructuring from the function signature (line 12)

### 83. ⚪ `low` — Unused exported font values in theme constants
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `src/constants/theme.ts:55-78`
- **Kanıt:** export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',     // <-- never used
    serif: 'ui-serif',     // <-- never used
    rounded: 'ui-rounded', // <-- never used
    mono: 'ui-monospace',
  },
  // ... only Fonts.mono is used in src/components/themed-text.tsx:69
- **Etki:** Dead exported API - Fonts.sans, Fonts.serif, and Fonts.rounded are exported but never imported or used anywhere in the codebase. Only Fonts.mono is used.
- **Fix:** Remove the sans, serif, and rounded properties from the Fonts object (keep only mono), or leave them as internal constants if they may be used in future features

### 84. ⚪ `low` — Unused exported constant BottomTabInset
- **Boyut:** Dead code & lint debt (`lint-deadcode`)
- **Yer:** `src/constants/theme.ts:90`
- **Kanıt:** export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

// grep confirms: never imported or referenced elsewhere in the codebase
- **Etki:** Dead exported API - this constant is exported from the theme module but is never imported or used anywhere. It appears to be leftover from a template or earlier design.
- **Fix:** Remove the BottomTabInset export on line 90, or keep it as a private constant if it may be useful for future layout calculations

### 85. ⚪ `low` — Index-as-key in acknowledgment messages list
- **Boyut:** React render performance (`react-perf`)
- **Yer:** `/Users/serrayildirim/roomie/src/features/brain/brain-input.tsx:159`
- **Kanıt:** ack.map((line, i) => ( <Text key={i} ...})
- **Etki:** While this is less critical than the other two issues (ack items are immutable strings with no internal state), it still violates React best practices and could cause subtle issues if the list order changes or items are modified.
- **Fix:** Since ack items are strings without unique identifiers, use a stable key like `key={`${i}-${line}`}` or better yet, ensure each ack item has a unique stable identifier (not just the string content which might not be unique).

### 86. ⚪ `low` — nowMs function untested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/money/money-logic.ts:72`
- **Kanıt:** export const nowMs = (): number => Date.now();
- **Etki:** This is a simple wrapper around Date.now() used as a module-level function to avoid purity lint issues in components. While the logic itself is trivial, the function is used throughout the app (brain apply, kitchen screen) as the source of truth for timestamps. No test verifies the timestamp format or behavior.
- **Fix:** Add a trivial test: expect(nowMs() > 0).toBe(true) to at least document the function's contract.

### 87. ⚪ `low` — Activity timeAgo function untested
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/activity/activity.ts:133-143`
- **Kanıt:** export function timeAgo(value: number | string): string { ... } No tests verify behavior.
- **Etki:** The function accepts both timestamps and date strings, converts to milliseconds, and formats relative time. Untested: (1) invalid date strings (caught by NaN check, but worth verifying), (2) edge cases at 45 seconds, 60 minutes, 24 hours, (3) very old timestamps. Users could see 'just now' for events that are actually days old if the NaN check doesn't work.
- **Fix:** Add tests for timeAgo with known timestamps spanning all ranges: just now, 44s, 45s, 1m, 59m, 1h, 23h, 1d, 100d. Also test with invalid date strings.

### 88. ⚪ `low` — Weak test for simplifyDebts edge case: exact debtor-creditor pair
- **Boyut:** Test coverage & quality (`testing-gaps`)
- **Yer:** `src/features/money/money-logic.test.ts`
- **Kanıt:** Tests cover: (1) all debts in one direction, (2) circular/chained debts. But no test for the simplest case: one debtor, one creditor with exact match (net: {a: 500, b: -500}).
- **Etki:** While the algorithm is likely correct, this edge case is not explicitly verified. If someone refactors simplifyDebts, this boundary case might be missed.
- **Fix:** Add test: expect(simplifyDebts({a: 500, b: -500})).toEqual([{fromId: 'b', toId: 'a', amountCents: 500}]);

### 89. ⚪ `low` — Unnecessary type assertion due to overly-broad Record<string, unknown> type
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/workers/brain/src/groq.ts:131`
- **Kanıt:** model: (body.model as string) ?? GROQ_MODEL,
// where body is typed as Record<string, unknown>
- **Etki:** The assertion is necessary because body is typed as Record<string, unknown>, making body.model unknown. The real issue is the broad body typing. While the code is correct, it's fragile because narrowing is lost.
- **Fix:** Type the body object more precisely: const body: { model: string; messages: GroqMessage[]; temperature: number; max_tokens: number; response_format?: { type: string }; tools?: GroqTool[]; tool_choice?: unknown; } = { ... }

### 90. ⚪ `low` — Missing return type annotation on exported hook useColorScheme
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/hooks/use-color-scheme.web.ts:7`
- **Kanıt:** export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  // ...
  if (hasHydrated) {
    return colorScheme;
  }
  return 'light';
}
- **Etki:** The return type is implicit (inferred as 'light' | 'dark' | undefined). In strict mode, exported functions should have explicit types for documentation and correctness checking.
- **Fix:** Add explicit return type: export function useColorScheme(): 'light' | 'dark' | undefined

### 91. ⚪ `low` — Missing return type annotation on exported hook useTheme
- **Boyut:** TypeScript type safety (`typescript-safety`)
- **Yer:** `/Users/serrayildirim/roomie/src/hooks/use-theme.ts:9`
- **Kanıt:** export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  return Colors[theme];
}
- **Etki:** The return type is inferred from Colors indexing, making it implicit. Exported functions should have explicit return types.
- **Fix:** Add explicit return type: export function useTheme(): typeof Colors['light']

### 92. ⚪ `low` — emailName utility duplicated across 3 screen files
- **Boyut:** Reinvented wheels (`wheel-reinvention`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:38-41`
- **Kanıt:** function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

Identical definitions also at src/features/money/money-screen.tsx:33-36 and src/features/kitchen/kitchen-screen.tsx:35-38
- **Etki:** Code duplication makes maintenance harder - if the email parsing logic needs to change (e.g., to handle more email formats), it must be updated in three places.
- **Fix:** Extract emailName to a shared utility file (e.g., src/lib/email.ts or src/lib/string.ts) and import it in all three screen files.

### 93. ⚪ `low` — Centered layout component duplicated across 3 screen files
- **Boyut:** Reinvented wheels (`wheel-reinvention`)
- **Yer:** `src/features/tasks/tasks-screen.tsx:369-375`
- **Kanıt:** function Centered({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>{children}</View>
    </SafeAreaView>
  );
}

Identical implementations at src/features/money/money-screen.tsx:326-332 and src/features/kitchen/kitchen-screen.tsx:347-353
- **Etki:** Violates DRY principle - the same UI pattern is reimplemented three times, making style updates or behavior changes require changes across multiple files.
- **Fix:** Extract Centered component to src/components/centered.tsx and import it in all three screen files (tasks-screen, money-screen, kitchen-screen).

