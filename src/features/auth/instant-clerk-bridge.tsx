// Bridges Clerk auth → InstantDB. When Clerk has a signed-in user, we hand its
// session token (which now carries the `email` claim) to InstantDB so the two
// share one identity. When Clerk signs out, InstantDB follows.
//
// `clientName: 'clerk'` matches the client added in the Instant dashboard.

import { useAuth as useClerkAuth } from '@clerk/expo';
import { useEffect } from 'react';

import { db } from '@/lib/db';

export function InstantClerkBridge() {
  const { isSignedIn, getToken } = useClerkAuth();
  const { user } = db.useAuth();

  useEffect(() => {
    // Clerk signed out → ensure Instant is signed out too.
    if (!isSignedIn) {
      if (user) void db.auth.signOut();
      return;
    }

    // Already bridged into Instant — nothing to do.
    if (user) return;

    let cancelled = false;
    (async () => {
      try {
        const idToken = await getToken();
        if (!idToken || cancelled) return;
        await db.auth.signInWithIdToken({ clientName: 'clerk', idToken });
      } catch (err) {
        console.warn('Instant↔Clerk bridge failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user, getToken]);

  return null;
}
