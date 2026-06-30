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
      // Denormalized creator auth id. The `creator` LINK can't be read by a
      // create permission (the link is born in the same transaction), so the
      // create rule checks this plain field instead. See instant.perms.ts.
      // Optional because pre-migration rows predate the field (they're already
      // created, so the create rule never re-checks them).
      creatorId: i.string().optional().indexed(),
      createdAt: i.date().indexed(),
    }),

    // Who belongs to which household, and how.
    memberships: i.entity({
      role: i.string(), // 'owner' | 'member'
      status: i.string(), // 'active' | 'invited' | 'removed'
      // Denormalized owner auth id — the security-critical create check
      // (`you may only create your OWN membership`) reads this, not the `user`
      // link, which isn't visible to a create rule in the same transaction.
      // Optional because pre-migration rows predate the field.
      userId: i.string().optional().indexed(),
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
      barcode: i.string().optional().indexed(), // set when added via Grocery Scan
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

    // Tasks — a chore the home defined. The current turn holder lives in the
    // `turn` link; rotation order is membership join order.
    chores: i.entity({
      name: i.string(),
      createdAt: i.date().indexed(),
      updatedAt: i.date().indexed(),
    }),

    // Tasks — append-only effort diary: who actually did (or passed) what.
    // History only, never counts — the no-shame rule.
    choreEvents: i.entity({
      type: i.string(), // 'done' | 'pass'
      at: i.date().indexed(),
    }),

    // Tasks — personal to-dos. One owner, no rotation. Scoped to the
    // household so "need a favor" can read them later.
    personalTasks: i.entity({
      title: i.string(),
      status: i.string(), // 'open' | 'done'
      createdAt: i.date().indexed(),
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

    // Tasks links.
    choreHousehold: {
      forward: { on: 'chores', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'chores' },
    },
    choreTurn: {
      forward: { on: 'chores', has: 'one', label: 'turn' },
      reverse: { on: '$users', has: 'many', label: 'choreTurns' },
    },
    choreEventChore: {
      forward: { on: 'choreEvents', has: 'one', label: 'chore' },
      reverse: { on: 'chores', has: 'many', label: 'events' },
    },
    choreEventBy: {
      forward: { on: 'choreEvents', has: 'one', label: 'by' },
      reverse: { on: '$users', has: 'many', label: 'choreEvents' },
    },
    personalTaskHousehold: {
      forward: { on: 'personalTasks', has: 'one', label: 'household' },
      reverse: { on: 'households', has: 'many', label: 'personalTasks' },
    },
    personalTaskOwner: {
      forward: { on: 'personalTasks', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'personalTasks' },
    },
  },
});

// TS helpers so the rest of the app gets typed queries.
type _AppSchema = typeof _schema;
export interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export default schema;
