// InstantDB permission rules.
//
// $users is hidden-from-others by default in Instant. Roomie's member lists,
// expense payers and debt math all walk membership→user links, so housemates
// must be able to SEE each other: allow viewing a user when you share at least
// one household with them (or it's you).
//
// Full household scoping for every entity (T5) comes before opening the app to
// anyone outside the flat — tracked in docs/CHECKLIST.md (Faz 7).
//
// Push with:  npx instant-cli@latest push perms

import type { InstantRules } from '@instantdb/react-native';

const rules = {
  $users: {
    allow: {
      view: "auth.id == data.id || auth.id in data.ref('memberships.household.memberships.user.id')",
    },
  },
} satisfies InstantRules;

export default rules;
