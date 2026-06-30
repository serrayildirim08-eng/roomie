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
// Leaving a home DELETES the membership row (not a status flip), so access is
// cut immediately — the row no longer satisfies any household check. Money math
// no longer depends on the row surviving: it reconstructs a former member's
// balance from the expense/settlement links, which point at $users directly.
//
// Known follow-ups (NOT covered here, tracked in docs/CHECKLIST.md):
//   - Invite code == raw household UUID, so knowing an id is enough to self-
//     join (membership create is self-only, but not invite-gated yet) — #34.
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
      // create can't read the `creator` link (born in the same transaction),
      // so it checks the denormalized creatorId field instead.
      create: 'auth.id != null && auth.id == data.creatorId',
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

  // Membership is the escalation vector. You may only create or edit YOUR OWN
  // row (so nobody can flip someone else to 'owner' or kick them — F7). You may
  // delete your own row (leave) and the household creator may delete anyone's
  // (evict) — but a plain member can no longer evict the owner (F3).
  memberships: {
    allow: {
      view: 'isSelf || isMember',
      // SECURITY-CRITICAL: you may only create your OWN membership (else a
      // stranger could join any home / escalate). The `user` link isn't
      // readable in a create rule, so this checks the denormalized userId.
      create: 'auth.id != null && auth.id == data.userId',
      update: 'isSelf',
      delete: 'isSelf || isHouseholdCreator',
    },
    bind: [
      'isSelf',
      "auth.id == data.ref('user.id')",
      'isMember',
      "auth.id in data.ref('household.memberships.user.id')",
      'isHouseholdCreator',
      "auth.id in data.ref('household.creator.id')",
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
  // A settlement is a claim "I paid you back", so only the PAYER (fromUser) may
  // record or undo one — a creditor can't forge a debtor's payment (F4). Rows
  // are otherwise immutable.
  settlements: {
    allow: {
      view: memberOfHousehold,
      create: "auth.id in data.ref('fromUser.id')",
      update: 'false',
      delete: "auth.id in data.ref('fromUser.id')",
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
