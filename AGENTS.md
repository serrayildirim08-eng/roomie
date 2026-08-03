# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# InstantDB: create rules can't see same-transaction links

A `create` permission rule CANNOT traverse a link born in the same transact —
`data.ref('household...')` resolves empty and the create is SILENTLY rejected
(this broke every create in prod once perms went live, 2026-08-03). Every
household-scoped entity therefore carries a denormalized `householdId` (or
`ownerId`/`fromUserId`) field, and create rules gate on it via
`data.householdId in auth.ref('$user.memberships.household.id')`
(`createsInOwnHousehold` in instant.perms.ts). When adding a NEW entity:
add the denormalized field, set it at EVERY write site, use the shared rule.
Never gate a create on `memberOfHousehold`.
