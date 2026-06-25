# Roomie — Direction A: Command Center / Bento Dashboard (2026-06-24)

**Big idea:** the Home screen is a live command center, not a list. A bento grid of
tiles that each do real work — "you're owed €15," "your turn: trash," "to buy: milk+
coffee," "latest in the house." You learn the whole house's state in one glance, then
tap any tile to dive deeper. The home *earns* the space.

## Palette (locked)
- Lead: deep forest green `#1A6B43` / lighter `#268A57` / deep `#11502F`.
- Accents (sparing pop): coral `#FF6A3D` (your-turn / add), gold `#FFCB2E` (low-stock,
  glints on the money hero), pink `#FF4D8D` reserved.
- Neutrals: warm canvas `#F3F1EC`, paper white, ink `#1B211D`.
- Identity colors: You = forest, Kai = blue `#4C6FE0`, Vfya = burnt orange `#C2410C`.
  Color carries *identity*, never status; severity/importance carried by tile size + fill.

## Fonts
- Display / numbers / names: **Baloo 2** (friendly rounded) — greetings, balances, tile headlines.
- Body / labels / rows: **Nunito** — quiet, legible.

## Navigation model
- **Top app bar** on every screen: hamburger (the missing menu/drawer affordance) +
  household name "Maple Street 14" + notification bell + profile avatar.
- **Bottom tab bar** on every screen: Home · Money · [+ FAB] · Kitchen · Tasks.
  Center forest FAB = quick-add (expense / item / chore from anywhere).
- Detail screens reuse the bar with household as kicker + section as title — clear "where am I."

## Why this uses space well
- **Varied tile size = visual hierarchy.** Money hero is full-width + filled forest (most
  important); your-turn + to-buy are half-tiles; pantry + activity span full width as quiet lists.
- **Density with air.** Tiles are dense (amounts, people, mini-actions) but separated by
  generous 13px gutters and rounded 22px corners — Monarch/Wallet density made warm.
- **Every tile is an action surface**, not decoration: settle, add, "I did it," check off.
- **No wasted top third.** Greeting + status line ("3 things want a look") frames the grid.

## Locked-rule compliance
No streaks, points, scores, leaderboards, or shame. Chores use soft language ("your turn,"
"I did it," "moved on from") and a purely chronological history.
