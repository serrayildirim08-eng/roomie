# Starter chores — research (2026-06-11)

Deep-research run (5 search angles → 20 sources → 96 claims → 25 adversarially
verified, 24 survived). Question: what are the most common recurring chores in
shared/roommate households, with typical frequencies, to pick Roomie's preset?

## Headline findings

1. **No competitor ships a default chore list.** Flatastic, OurFlat, Tody and
   Sweepy all offer recurrence engines / room-based suggestion libraries — the
   user builds the list from scratch. Roomie's preloaded classics are a real
   differentiator. (high confidence; store listings + product pages)
2. **The classics + frequency norms** (each anchored by ≥2 independent sources):

   | Chore | Norm | Anchors |
   |---|---|---|
   | Dishes / kitchen reset | daily | YouGov 17-market (51% clean kitchen sink daily), Eurostat HETUS, HGTV, NBC |
   | Wipe counters & sink | daily — but skews **personal** clean-as-you-go, not rota | YouGov, NBC, HGTV |
   | Trash & recycling | fixed collection day (NL: municipal calendar) | OurFlat archetype example |
   | Bathroom (toilet+sink+shower, bundled) | weekly (floor; shared bathrooms → 2x/week) | YouGov (51% weekly), NBC microbiologist, HGTV, Today |
   | Vacuum common areas | weekly | HGTV, NBC |
   | Mop floors | every 2 weeks (kitchen more often) | NBC, HGTV |
   | Tidy/dust living room | weekly (weaker evidence) | HGTV |
   | Bed sheets | ~every 2–3 weeks — **personal** | Sweepy default |

3. **Genre pattern:** Tody/Sweepy expose a room-scoped suggested-task library
   with adjustable frequencies. Sweepy's defaults reviewed as "quite
   aggressive" → Roomie defaults relaxed (ADHD-safe).
4. **Shared vs personal (weakest-evidenced):** common areas (kitchen, bathroom,
   floors, trash) are rota material; bedroom, sheets, own laundry are personal;
   dishes straddle ("own dishes immediately" vs rotating kitchen reset) — houses
   should choose.

## Product decisions taken (Serra, 2026-06-11)

- **Core preset (auto-seeded):** Dishes · Trash · Bathroom · Vacuum · Mop floors
- **Suggestion library (~20 incl. core):** one-tap add from grouped list — the
  "pizza menu" model (water+bread on the table, rest on the menu)
- **Frequencies NOT in-app yet** — rotation is event-driven; the norms above are
  banked here for the calendar phase ("Sonrası")

## Open questions (parked)

- Rotterdam trash streams: single Trash task vs split restafval/GFT/paper/glass/
  plastic keyed to the municipal calendar → library offers the splits, houses
  pick (underground-container buildings have no collection day at all)
- No verified shared-house-specific conflict ranking ("dishes are the #1
  roommate fight" did NOT survive verification — don't quote it)
- Laundry / groceries-restock placement: evidence silent; restock already lives
  in Kitchen's shopping list

## Caveats

Surveys are general-household, not roommate-specific; Reddit consensus produced
zero verified claims; competitor evidence is store-listing-level (in-app
onboarding not audited); several pages verified via archives due to 403s.
Frequencies are floors, not universals.

## Key sources

- YouGov, "How often do people around the world clean everyday items" (Mar 2024, 17 markets)
- Eurostat HETUS time-use statistics
- NBC News Better — microbiologist (Tetro) cleaning-frequency guidance
- HGTV "Ultimate Cleaning Schedule"; Today.com bathroom checklist (Nelson)
- Store listings/product pages: Flatastic, OurFlat, Tody, Sweepy; Apartment Therapy reviews
