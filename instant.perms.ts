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
// Push with:  npx instant-cli@latest push perms

import type { InstantRules } from '@instantdb/react-native';

// Reusable expressions (InstantDB `bind`): name, expression, name, expression…
const memberOfHousehold = "auth.id in data.ref('household.memberships.user.id')";
// CREATE rules can't traverse links born in the same transaction (see the
// memberships.userId note in the schema — this bit us live: every create that
// checked `memberOfHousehold` was silently rejected once perms were pushed).
// So creation is gated on the row's denormalized householdId, checked from the
// AUTH side, whose memberships already exist at rule-eval time.
const createsInOwnHousehold =
  "data.householdId != null && data.householdId in auth.ref('$user.memberships.household.id')";
// Money rows must carry a sane amount: positive, at most €10,000.00 in cents.
const validAmount = 'data.amountCents > 0 && data.amountCents <= 1000000';

// Files are gated by PATH ONLY ($files rules can't see links). Every upload
// lives under households/{householdId}/…, so a member may see/create exactly
// the files whose prefix matches one of their homes. CEL `exists` macro.
const fileInMyHousehold =
  "auth.id != null && auth.ref('$user.memberships.household.id')" +
  ".exists(h, data.path.startsWith('households/' + h + '/'))";

const rules = {
  // Photos (chore proof, receipts). Append-only like the diary — no deletes
  // in v1; a wrong photo is Serra-admin territory.
  $files: {
    allow: {
      view: fileInMyHousehold,
      create: fileInMyHousehold,
      delete: 'false',
    },
  },

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
      // Members see their home. A NON-member can see exactly one home: the one
      // whose inviteCode matches the code they pass as a query ruleParam. No
      // ruleParam (or a wrong code) → only `isMember` applies, so a stranger
      // can't enumerate or read homes — they must already know the code.
      view: "isMember || data.inviteCode == ruleParams.code",
      // create can't read the `creator` link (born in the same transaction),
      // so it checks the denormalized creatorId field instead.
      create: 'auth.id != null && auth.id == data.creatorId',
      // Only the creator may edit household fields (name, inviteCode) — a
      // member rewriting the invite code or name is an escalation vector.
      update: 'isCreator',
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
      // AND joining is invite-gated (#34): you must pass the home's invite
      // code as a ruleParam, or be the home's creator (owner bootstrap). Both
      // refs need the household to pre-exist, so the create flows commit the
      // household FIRST, then the membership in a second transaction.
      create:
        'auth.id != null && auth.id == data.userId && ' +
        "(ruleParams.code in data.ref('household.inviteCode') || auth.id in data.ref('household.creator.id'))",
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
      create: createsInOwnHousehold,
      update: 'false',
      delete: 'false',
    },
  },

  // Money. Full member scope — the debt math trusts these rows.
  expenses: {
    allow: {
      view: memberOfHousehold,
      create: `${createsInOwnHousehold} && ${validAmount}`,
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
      create: `auth.id != null && auth.id == data.fromUserId && ${createsInOwnHousehold} && ${validAmount}`,
      update: 'false',
      delete: "auth.id in data.ref('fromUser.id')",
    },
  },

  // Kitchen.
  pantryItems: {
    allow: {
      view: memberOfHousehold,
      create: createsInOwnHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },
  // Append-only purchase log — immutable audit trail.
  purchases: {
    allow: {
      view: memberOfHousehold,
      create: createsInOwnHousehold,
      update: 'false',
      delete: 'false',
    },
  },

  // Tasks. Seed chores are committed in their own transaction AFTER the owner
  // membership exists (see household.tsx), so createsInOwnHousehold holds.
  chores: {
    allow: {
      view: memberOfHousehold,
      create: createsInOwnHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },
  // Effort diary — append-only, scoped via the chore's household.
  choreEvents: {
    allow: {
      view: "auth.id in data.ref('chore.household.memberships.user.id')",
      create: createsInOwnHousehold,
      update: 'false',
      delete: 'false',
    },
  },

  // Bill templates — same trust level as expenses; the stamped expense rows
  // are what the ledger actually reads.
  bills: {
    allow: {
      view: memberOfHousehold,
      create: `${createsInOwnHousehold} && ${validAmount}`,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },

  // Calendar events — house-shared, any member may add or remove.
  events: {
    allow: {
      view: memberOfHousehold,
      create: createsInOwnHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },

  // Receipt photos — the PHOTO is immutable ($files has no delete), but the
  // row takes member edits: itemize attaches the stamped expense post-create.
  receipts: {
    allow: {
      view: memberOfHousehold,
      create: createsInOwnHousehold,
      update: memberOfHousehold,
      delete: memberOfHousehold,
    },
  },

  // Personal heads-ups — only the recipient can read or dismiss; any
  // housemate may create one (that's the point: "I got it, no need").
  nudges: {
    allow: {
      view: 'auth.id == data.toUserId',
      create: createsInOwnHousehold,
      update: 'auth.id == data.toUserId',
      delete: 'auth.id == data.toUserId',
    },
  },

  // Personal to-dos — private to their owner until a 'need a favor' feature
  // opens them to the household later.
  personalTasks: {
    allow: {
      view: 'isOwner',
      create: 'auth.id != null && auth.id == data.ownerId',
      update: 'isOwner',
      delete: 'isOwner',
    },
    bind: ['isOwner', "auth.id == data.ref('owner.id')"],
  },
} satisfies InstantRules;

export default rules;
