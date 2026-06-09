// Roomie's single InstantDB client. Import `db` anywhere to read/write/auth.
//
// The App ID is a PUBLIC client identifier — it ships in every app build, so
// committing it is fine. The admin/secret token is NOT here and must never be
// committed; it lives only in your shell when running CLI/admin tasks.

import { init } from '@instantdb/react-native';
import schema from '../instant.schema';

const APP_ID = process.env.EXPO_PUBLIC_INSTANT_APP_ID ?? '47fa1999-3f62-45e4-a202-7a8ee3ba65e7';

export const db = init({ appId: APP_ID, schema });

export type { AppSchema } from '../instant.schema';
