// InstantDB permission rules — T5 household scoping.
//
// THE INVARIANT: a row that belongs to a household is only readable/writable
// by the active+former members of that household. A stranger account (no
// membership) can touch nothing. Enforcement lives HERE, server-side — the
// per-screen query `where` clauses are convenience, NOT a security boundary.
//
// In InstantDB, an entity/action with NO rule defaults to ALLOW (open). So
// every entity below must spell out view/create/update/delete explicitly.
//
// The membership check walks each row's `household` link to its memberships'
// users: `auth.id in data.ref('household.memberships.user.id')`. This is the
// same traversal the $users rule already relies on, so it's a proven path.
//
// Known follow-ups (NOT covered here, tracked in docs/CHECKLIST.md):
//   - Invite code == raw household UUID, so knowing an id is enough to self-
//     join (membership create is self-only, but not invite-gated yet) — #34.
//   - A `status:'removed'` member's membership row still satisfies the check
//     until deleted, so they keep read access until truly removed — by design
//     for now (money math needs removed members visible; see money bug fix).
//
// Push with:  npx instant-cli@latest push perms

import type { InstantRules } from '@instantdb/react-native';

// Reusable expressions (InstantDB `bind`): name, expression, name, expression…
const memberOfHousehold = "auth.id in data.ref('household.memberships.user.id')";
const creatorOfHousehold = "auth.id in data.ref('household.creator.id')";

const rules = {
  // A user is visible to themselves and to anyone sharing a household.
  $users: {
    allow: {
      view: "auth.id == data.id || auth.id in data.ref('memberships.household.memberships.user.id')",
    },
  },

  // Public person info. Visible to housemates; only the owner can write it.
  profiles: {
    allow: {
      view: "isSelf || isHousemate",
      create: 'isSelf',
      update: 'isSelf',
      delete: 'isSelf',
    },
    bind: [
      'isSelf',
      "auth.id == data.ref('$user.id')",
      'isHousemate',
      "auth.id in data.ref('$user.memberships.household.memberships.user.id')",
    ],
  },

  // A home. Members see it; the creator owns destructive actions.
  households: {
    allow: {
      view: 'isMember',
      create: 'isCreator',
      update: 'isMember',
      delete: 'isCreator',
    },
    bind: [
      'isMember',
      "auth.id in data.ref('memberships.user.id')",
      'isCreator',
      "auth.id in data.ref('creator.id')",
    ],
  },

  // Membership is the escalation vector: you may only create/leave YOUR OWN
  // row; existing members may adjust rows within their household.
  memberships: {
    allow: {
      view: 'isSelf || isMember',
      create: 'isSelf',
      update: 'isSelf || isMember',
      delete: 'isMember',
    },
    bind: [
      'isSelf',
      "auth.id == data.ref('user.id')",
      'isMember',
      "auth.id in data.ref('household.memberships.user.id')",
    ],
  },

  // Home diary — append-only. Members read; no edits/deletes.
  activityEvents: {
    allow: {
      view: memberOfHousehold,
      create: memberOfHousehold,
      update: 'false',
      delete: 'false',
    },
  },

  // Money. Full member scope — the debt math trusts these rows.
  expenses: {
    allow: {
      view: memberOfHousehold,
      create: memberOfHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },
  settlements: {
    allow: {
      view: memberOfHousehold,
      create: memberOfHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },

  // Kitchen.
  pantryItems: {
    allow: {
      view: memberOfHousehold,
      create: memberOfHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },
  // Append-only purchase log — immutable audit trail.
  purchases: {
    allow: {
      view: memberOfHousehold,
      create: memberOfHousehold,
      update: 'false',
      delete: 'false',
    },
  },

  // Tasks. Chores are seeded in the SAME transaction that creates the home's
  // owner membership, so create also accepts the household creator.
  chores: {
    allow: {
      view: memberOfHousehold,
      create: `${memberOfHousehold} || ${creatorOfHousehold}`,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },
  // Effort diary — append-only, scoped via the chore's household.
  choreEvents: {
    allow: {
      view: "auth.id in data.ref('chore.household.memberships.user.id')",
      create: "auth.id in data.ref('chore.household.memberships.user.id')",
      update: 'false',
      delete: 'false',
    },
  },

  // Personal to-dos — private to their owner until a 'need a favor' feature
  // opens them to the household later.
  personalTasks: {
    allow: {
      view: 'isOwner',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'isOwner',
    },
    bind: ['isOwner', "auth.id == data.ref('owner.id')"],
  },
} satisfies InstantRules;

export default rules;
