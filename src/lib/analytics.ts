// Minimal behavioral telemetry — funnel + retention events, sent through the
// brain worker's /ingest-event (the worker hashes identity and holds the only
// Supabase credential; the app never talks to Supabase).
//
// Contract: every function here is fire-and-forget and NEVER throws — a dead
// telemetry pipe must never dent the app. Everything is gated on the same
// one-time AI consent the brain box uses ('roomie:ai-consent'): no consent,
// no event, silently.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { BRAIN_URL } from '@/features/brain/types';

const AI_CONSENT_KEY = 'roomie:ai-consent'; // mirrors brain-input.tsx
const K = {
  installTs: 'roomie:analytics:install-ts',
  sessionCount: 'roomie:analytics:session-count',
  deviceId: 'roomie:analytics:device-id',
  firstDump: 'roomie:analytics:first-dump-sent',
  dReturned: (d: number) => `roomie:analytics:d${d}-returned-sent`,
};

const APP_VERSION: string | undefined = Constants.expoConfig?.version ?? undefined;

export type FunnelEventType =
  | 'onboarding_completed'
  | 'first_dump'
  | 'dump_submitted'
  | 'route_corrected'
  | 'notif_permission'
  | 'account_deleted';

export interface RetentionRow {
  event_type: 'installed' | 'session_started' | 'd1_returned' | 'd7_returned' | 'd30_returned';
  session_count?: number;
  hours_since_install?: number;
  device_id?: string;
  app_version?: string;
  event_at?: string;
}

// Set by initAnalytics from a signed-in Clerk context; null = no-op.
let getTokenFn: (() => Promise<string | null>) | null = null;
let booted = false;

async function send(table: 'funnel_events' | 'retention_events', row: Record<string, unknown>) {
  try {
    if (!getTokenFn) return;
    if (!(await AsyncStorage.getItem(AI_CONSENT_KEY))) return; // no consent → no event
    const token = await getTokenFn();
    if (!token) return;
    await fetch(`${BRAIN_URL}/ingest-event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        table,
        row: { app_version: APP_VERSION, event_at: new Date().toISOString(), ...row },
      }),
    });
  } catch {
    /* telemetry never surfaces */
  }
}

/** Funnel event (funnel_events). Fire-and-forget. */
export function track(
  eventType: FunnelEventType,
  extra?: { value?: string; minutes_since_install?: number },
): void {
  void send('funnel_events', { event_type: eventType, ...extra });
}

/** Retention event (retention_events). Fire-and-forget. */
export function trackRetention(row: RetentionRow): void {
  void send('retention_events', { ...row });
}

/** Minutes since first run, or undefined before init/first run. */
export async function minutesSinceInstall(): Promise<number | undefined> {
  try {
    const ts = Number(await AsyncStorage.getItem(K.installTs));
    if (!ts) return undefined;
    return Math.round((Date.now() - ts) / 60_000);
  } catch {
    return undefined;
  }
}

/** One-time 'first_dump' funnel event; subsequent calls are silent no-ops. */
export async function trackFirstDumpOnce(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(K.firstDump)) return;
    await AsyncStorage.setItem(K.firstDump, '1');
    track('first_dump', { minutes_since_install: await minutesSinceInstall() });
  } catch {
    /* never throws */
  }
}

async function deviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(K.deviceId);
  if (existing) return existing;
  // crypto.getRandomValues is polyfilled at the app root (react-native-get-random-values).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const fresh = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  await AsyncStorage.setItem(K.deviceId, fresh);
  return fresh;
}

/**
 * Call once per cold start from a signed-in Clerk context (app root).
 * First run: stamps install_ts + emits 'installed'. Every run: emits
 * 'session_started'. Past 24h/7d/30d: emits d1/d7/d30_returned once each.
 */
export function initAnalytics(getToken: () => Promise<string | null>): void {
  getTokenFn = getToken;
  if (booted) return; // one boot per cold start
  booted = true;
  void (async () => {
    try {
      const now = Date.now();
      const device = await deviceId();

      let installTs = Number(await AsyncStorage.getItem(K.installTs));
      const firstRun = !installTs;
      if (firstRun) {
        installTs = now;
        await AsyncStorage.setItem(K.installTs, String(now));
      }

      const sessionCount = (Number(await AsyncStorage.getItem(K.sessionCount)) || 0) + 1;
      await AsyncStorage.setItem(K.sessionCount, String(sessionCount));
      const hours = Math.round(((now - installTs) / 3_600_000) * 100) / 100;

      const base = { session_count: sessionCount, hours_since_install: hours, device_id: device };
      if (firstRun) trackRetention({ event_type: 'installed', ...base });
      trackRetention({ event_type: 'session_started', ...base });

      for (const [day, threshold] of [
        [1, 24],
        [7, 168],
        [30, 720],
      ] as const) {
        if (hours >= threshold && !(await AsyncStorage.getItem(K.dReturned(day)))) {
          await AsyncStorage.setItem(K.dReturned(day), '1');
          trackRetention({ event_type: `d${day}_returned`, ...base });
        }
      }
    } catch {
      /* telemetry never surfaces */
    }
  })();
}
