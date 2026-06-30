// Starter chores + suggestion library — the "pizza menu" model:
// the 5 classics land on the table automatically (research-backed: every
// shared home has them), the rest wait on a one-tap menu so the screen stays
// clean and nobody starts their Roomie life by deleting ten chores.
//
// Frequencies are HINTS only (shown faintly in the library) — rotation is
// event-driven; real scheduling waits for the calendar phase. Sources +
// decisions: docs/research/STARTER_CHORES_2026-06-11.md

export interface SuggestedChore {
  name: string;
  hint: string; // typical cadence, faint copy only
}

export interface ChoreGroup {
  group: string;
  chores: SuggestedChore[];
}

// Home-type keys for the starter packs below. The chooser at home creation maps
// these to friendly labels ("2-roommate apartment", "Student flat", …).
export type HomeType = 'apartment' | 'student' | 'couple' | 'house';

// Starter packs by home type — each is a different opening hand of chores, all
// drawn from CHORE_LIBRARY/STARTER_CHORES below so suggestions + dedup stay
// consistent. 'apartment' is the default and reproduces the original 5.
export const STARTER_PACKS: Record<HomeType, string[]> = {
  apartment: ['Dishes', 'Trash', 'Bathroom', 'Vacuum', 'Mop floors'],
  student: ['Dishes', 'Trash', 'Bathroom', 'Vacuum', 'Paper & cardboard'],
  couple: ['Dishes', 'Trash', 'Bathroom', 'Clean fridge'],
  house: [
    'Dishes',
    'Trash',
    'Bathroom',
    'Vacuum',
    'Mop floors',
    'Tidy living room',
    'Paper & cardboard',
  ],
};

// Auto-seeded at home creation when no home type is chosen. Subset of the
// library below; identical to the default 'apartment' pack.
export const STARTER_CHORES = STARTER_PACKS.apartment;

export const CHORE_LIBRARY: ChoreGroup[] = [
  {
    group: 'Kitchen',
    chores: [
      { name: 'Dishes', hint: 'daily' },
      { name: 'Empty dishwasher', hint: 'daily' },
      { name: 'Wipe counters & sink', hint: 'daily' },
      { name: 'Mop kitchen floor', hint: 'weekly' },
      { name: 'Clean fridge', hint: 'monthly' },
      { name: 'Oven & stove', hint: 'monthly' },
    ],
  },
  {
    group: 'Bathroom',
    chores: [
      { name: 'Bathroom', hint: 'weekly' },
      { name: 'Wash towels', hint: 'weekly' },
    ],
  },
  {
    group: 'Floors & living room',
    chores: [
      { name: 'Vacuum', hint: 'weekly' },
      { name: 'Mop floors', hint: 'every 2 weeks' },
      { name: 'Tidy living room', hint: 'weekly' },
      { name: 'Dust surfaces', hint: 'every 2 weeks' },
      { name: 'Clean windows', hint: 'monthly' },
    ],
  },
  {
    group: 'Trash & recycling',
    chores: [
      { name: 'Trash', hint: 'collection day' },
      { name: 'Organic waste (GFT)', hint: 'collection day' },
      { name: 'Paper & cardboard', hint: 'collection day' },
      { name: 'Glass', hint: 'when full' },
      { name: 'Plastic (PMD)', hint: 'collection day' },
    ],
  },
  {
    group: 'Other',
    chores: [
      { name: 'Water plants', hint: 'weekly' },
      { name: 'Packages & mail', hint: 'as needed' },
    ],
  },
];
