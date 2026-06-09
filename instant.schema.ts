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
      joinedAt: i.date().indexed(),
    }),

    // The home diary — the connective tissue across modules.
    activityEvents: i.entity({
      type: i.string(), // e.g. 'expense_added', 'chore_done', 'pantry_added'
      metadata: i.json().optional(),
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
  },
});

// TS helpers so the rest of the app gets typed queries.
type _AppSchema = typeof _schema;
export interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export default schema;
