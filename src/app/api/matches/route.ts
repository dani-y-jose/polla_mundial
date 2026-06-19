// Cached read of the global match list.
//
// `matches` is public World Cup fixture data (see firestore.rules), so this
// reads it via the Firestore REST API with the public web API key — no Admin
// SDK / service account needed, identical locally and on App Hosting. The
// response is cached and revalidated every REVALIDATE_SECONDS so every user
// hits one cheap cached endpoint instead of each running the same Firestore
// query on every login.
//
// The client helper getMatches() (src/lib/matches.ts) calls this and falls back
// to a direct Firestore read if the endpoint is unavailable (e.g. the public
// read rule hasn't been deployed yet).

import { firebaseConfig } from "@/lib/firebase";

export const dynamic = "force-static";
export const revalidate = 60;

// Reuse the public web config (projectId + apiKey) instead of re-hardcoding it.
const PROJECT_ID = firebaseConfig.projectId;
const API_KEY = firebaseConfig.apiKey;

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
};
type RestDoc = { name: string; fields?: Record<string, RestValue> };

// Firestore REST encodes each field by type; flatten to a plain JS value.
function readValue(v: RestValue): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue; // ISO string
  if ("nullValue" in v) return null;
  return undefined;
}

function toMatch(doc: RestDoc): Record<string, unknown> {
  const out: Record<string, unknown> = { id: doc.name.split("/").pop() };
  const fields = doc.fields ?? {};
  for (const k of Object.keys(fields)) out[k] = readValue(fields[k]);
  return out;
}

export async function GET() {
  // World Cup is ~104 matches; pageSize 500 covers it without pagination.
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/matches?pageSize=500&key=${API_KEY}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return Response.json({ matches: [], error: `firestore ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { documents?: RestDoc[] };
    const matches = (data.documents ?? []).map(toMatch);
    return Response.json({ matches });
  } catch (e) {
    return Response.json({ matches: [], error: String(e) }, { status: 502 });
  }
}
