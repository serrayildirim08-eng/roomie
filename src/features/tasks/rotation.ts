// Chore rotation — pure functions, no I/O. The fairness core: whose turn is
// it, and who's next. Order = membership join order (stable, no surprises).
//
// Locked rules (Serra, 2026-06-11):
//   - event-driven: the turn advances when someone taps Done or Pass,
//     never on a clock
//   - anyone can Done (credit goes to the doer), the turn STILL advances
//   - Pass is penalty-free: turn moves on, nothing is owed

export function nextTurn(memberIds: string[], currentId: string | null | undefined): string | null {
  if (memberIds.length === 0) return null;
  const idx = currentId ? memberIds.indexOf(currentId) : -1;
  // Unknown/missing current holder (e.g. they left the home) → restart at the top.
  if (idx === -1) return memberIds[0];
  return memberIds[(idx + 1) % memberIds.length];
}

// Resolve who holds the turn right now, healing stale state: if the stored
// holder is gone (left the home), the first member inherits the turn.
export function effectiveTurn(
  memberIds: string[],
  storedTurnId: string | null | undefined,
): string | null {
  if (memberIds.length === 0) return null;
  if (storedTurnId && memberIds.includes(storedTurnId)) return storedTurnId;
  return memberIds[0];
}
