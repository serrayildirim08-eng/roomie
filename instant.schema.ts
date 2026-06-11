// Roomie InstantDB schema.
//
// Foundation phase only: users, households, memberships, activity feed.
// Each module (Money / Kitchen / Tasks) adds its own entities in its phase.
// Rule (from the spec): every shared entity is scoped to a household.
//
// Push to InstantDB with:  npx instant-cli@latest push schema

import { i } from '@instantdb/react-native';

const _schema = i.schema({
  entities: {
    // `$users` is InstantDB's built-in auth identity. We only extend it via links.
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),

    // Public-facing person info, one per user.
    profiles: i.entity({
      displayName: i.string(),
      avatarUrl: i.string().optional(),
      createdAt: i.date().indexed(),
    }),

    // A shared home. The unit everything else hangs off of.
    households: i.entity({
      name: i.string(),
      createdAt: i.date().indexed(),
    }),

    // Who belongs to which household, and how.
    memberships: i.entity({
      role: i.string(), // 'owner' | 'member'
      status: i.string(), // 'active' | 'invited' | 'removed'
      displayName: i.string().optional(), // denormalized name for member lists
      joinedAt: i.date().indexed(),
    }),

    // The home diary — the connective tissue across modules.
    activityEvents: i.entity({
      type: i.string(), // e.g. 'expense_added', 'chore_done', 'pantry_added'
      metadata: i.json().optional(),
      createdAt: i.date().indexed(),
    }),

    // Money — a shared expense (Splitwise-style core). v1 = equal split.
    expenses: i.entity({
      title: i.string(),
      amountCents: i.number(), // store money in cents to avoid float errors
      currency: i.string(), // 'EUR'
      createdAt: i.date().indexed(),
    }),

    // Money — a payback from one member to another (settle up).
    settlements: i.entity({
      amountCents: i.number(),
      currency: i.string(),
      createdAt: i.date().indexed(),
    }),

    // Kitchen — one row per item the home knows about. status 'in' = in the
    // pantry, 'out' = on the shopping list. normalizedName dedupes "süt"/"milk".
    pantryItems: i.entity({
      name: i.string(),
      normalizedName: i.string().indexed(),
      category: i.string(), // GroceryCategory
      status: i.string(), // 'in' | 'out'
      shelfLifeDays: i.number().optional(), // null = unknown → never ages
      addedAt: i.date().indexed(), // reset on every restock; drives aging
      createdAt: i.date().indexed(),
      updatedAt: i.date().indexed(),
    }),

    // Kitchen — append-only purchase log ("got it" events). Invisible in v1;
    // feeds the cadence/"running low" predictions later.
    purchases: i.entity({
      itemName: i.string().indexed(), // normalized name
      at: i.date().indexed(),
    }),
  },

  links: {
    profileUser: {
      forward: { on: 'profiles', has: 'one', label: '$user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
    householdCreator: {
      forward: { on: 'households', has: 'one', label: 'creator' },
      reverse: { on: '$users', has: 'many', label: 'createdHouseholds' },
    },
    membershipHousehold: {
      forward: { on: 'memberships', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'memberships' },
    },
    membershipUser: {
      forward: { on: 'memberships', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'many', label: 'memberships' },
    },
    activityHousehold: {
      forward: { on: 'activityEvents', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'activity' },
    },
    activityActor: {
      forward: { on: 'activityEvents', has: 'one', label: 'actor' },
      reverse: { on: '$users', has: 'many', label: 'actorEvents' },
    },

    // Money links.
    expenseHousehold: {
      forward: { on: 'expenses', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'expenses' },
    },
    expensePaidBy: {
      forward: { on: 'expenses', has: 'one', label: 'paidBy' },
      reverse: { on: '$users', has: 'many', label: 'expensesPaid' },
    },
    expenseParticipants: {
      forward: { on: 'expenses', has: 'many', label: 'participants' },
      reverse: { on: '$users', has: 'many', label: 'expensesIn' },
    },
    settlementHousehold: {
      forward: { on: 'settlements', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'settlements' },
    },
    settlementFrom: {
      forward: { on: 'settlements', has: 'one', label: 'fromUser' },
      reverse: { on: '$users', has: 'many', label: 'settlementsOut' },
    },
    settlementTo: {
      forward: { on: 'settlements', has: 'one', label: 'toUser' },
      reverse: { on: '$users', has: 'many', label: 'settlementsIn' },
    },

    // Kitchen links.
    pantryHousehold: {
      forward: { on: 'pantryItems', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'pantryItems' },
    },
    pantryClaimedBy: {
      forward: { on: 'pantryItems', has: 'one', label: 'claimedBy' },
      reverse: { on: '$users', has: 'many', label: 'claimedItems' },
    },
    purchaseHousehold: {
      forward: { on: 'purchases', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'purchases' },
    },
    purchaseBy: {
      forward: { on: 'purchases', has: 'one', label: 'by' },
      reverse: { on: '$users', has: 'many', label: 'purchases' },
    },
  },
});

// TS helpers so the rest of the app gets typed queries.
type _AppSchema = typeof _schema;
export interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export default schema;
