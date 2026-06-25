# E2E — outsider / stranger access test (run after pushing perms)

The perms are enforced **server-side** by InstantDB. Code review can't prove the
live database is locked down — only two real accounts can. Run this once after
`npx instant-cli@latest push perms`, before sharing any build.

You need **two devices / two accounts**: account **A** (in a home) and a brand
new account **S** (the "stranger", in no home).

## 1. Stranger is walled off (the P0)

1. Sign in as **A**, create or open a home, add one expense.
2. Sign in as **S** on the other device. Do **not** join any home.
3. Expected: S sees the "create or join a home" screen on every tab. S can read
   **nothing** of A's home (no expenses, no chores, no pantry, no activity).
4. ❌ If S can see any of A's data → perms did **not** push. Stop and re-push.

## 2. Joining a home still works (the F1 regression guard)

1. As **A**, copy the invite code.
2. As **S**, tap "Have a code? Join a home", paste it, Join.
3. Expected: S lands in the home and now sees A's expenses/chores/pantry.
4. Try a **bogus** code (random text) → expected: "No home found for that code",
   and S is **not** left in a broken half-joined state.

## 3. Money trust (F4 / F6)

1. A and S both in the home. A adds a €30 expense split between both.
2. Expected: each side shows the other a €15 debt. **S only sees a "Settle"
   button on debts S owes** — never on what someone owes S.
3. As the debtor, tap Settle → confirm dialog → debt clears on both devices.
4. As the **creditor**, confirm there is no way to mark the other's debt paid.

## 4. Leaving a home (F5 / F6 + the locked decision)

1. With an **open balance**, have S tap "Leave home".
2. Expected: S immediately loses access (back to "create or join"). S can read
   nothing of the home anymore.
3. On A's device: the books still **sum to zero** — S's open balance is still
   shown (labelled by S's name or email handle), money is **not** silently lost.

## 5. Owner safety (F3 / F7)

1. A non-owner member cannot evict the owner or promote themselves.
   (Verified at the perms layer; spot-check via the app: a plain member has no
   path to remove the owner.)

---

✅ All five pass → the access/money layer is dogfood-safe. Record the date and
tick T5 / the Phase-1 items in `docs/CHECKLIST.md`.
