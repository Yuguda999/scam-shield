// The web-extension build of Auth avoids loading remote scripts (MV3 forbids
// remote code) and works in normal web pages too for anonymous sign-in.
import { getAuth, signInAnonymously, type User } from 'firebase/auth/web-extension';
import { addDoc, collection, getCount, getDocs, getFirestore, limit, query, serverTimestamp, where, type Firestore } from 'firebase/firestore/lite';
import { firebase } from './app';
import { deviceAvailability, redactOnDevice } from './checker';
import { fingerprint, isoWeek, tally, type TrendRow } from '../core/community';
import { redact } from '../core/redact';
import type { CheckOutcome } from '../core/types';

let db: Firestore | undefined;
let userPromise: Promise<User> | undefined;

function store(): Firestore {
  db ??= getFirestore(firebase().app);
  return db;
}

async function user(): Promise<User> {
  userPromise ??= (async () => {
    const auth = getAuth(firebase().app);
    await auth.authStateReady();
    return auth.currentUser ?? (await signInAnonymously(auth)).user;
  })().catch((e) => {
    userPromise = undefined;
    throw e;
  });
  return userPromise;
}

/**
 * The text that represents a check in the community: always the on-device
 * redacted copy, never the original message.
 */
export async function communityText(outcome: CheckOutcome, original: string): Promise<string> {
  if (outcome.redacted) return outcome.sentText;
  return (await redactOnDevice(original, await deviceAvailability())).text;
}

/** How many people reported this same message this week. */
export async function seenThisWeek(redactedText: string): Promise<number> {
  await user();
  const q = query(
    collection(store(), 'reports'),
    where('fingerprint', '==', await fingerprint(redactedText)),
    where('week', '==', isoWeek()),
  );
  return (await getCount(q)).data().count;
}

export async function report(outcome: CheckOutcome, redactedText: string): Promise<void> {
  const u = await user();
  const r = outcome.result;
  await addDoc(collection(store(), 'reports'), {
    uid: u.uid,
    createdAt: serverTimestamp(),
    week: isoWeek(),
    fingerprint: await fingerprint(redactedText),
    scamType: r.scamType,
    verdict: r.verdict === 'safe' ? 'suspicious' : r.verdict,
    risk: r.risk,
    text: redactedText.slice(0, 2000),
    // Only the explanations, redacted again: quotes could contain personal details.
    flags: r.redFlags.map((f) => redact(f.why).text.slice(0, 300)).slice(0, 4),
    source: outcome.source,
  });
}

/** What scams people are reporting this week, by type. */
export async function trendsThisWeek(): Promise<{ total: number; rows: TrendRow[] }> {
  await user();
  const snap = await getDocs(query(collection(store(), 'reports'), where('week', '==', isoWeek()), limit(500)));
  const rows = tally(snap.docs.map((d) => ({ scamType: String(d.get('scamType')) })));
  return { total: snap.size, rows };
}
