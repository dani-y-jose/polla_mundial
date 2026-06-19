// Read-boundary validation for Firestore.
//
// Every read from Firestore is untyped `DocumentData`. Instead of an unchecked
// `as Match` cast (which asserts a shape without verifying it), these helpers
// validate the doc against its Zod schema. A malformed/incomplete doc is logged
// and dropped (null) rather than silently propagating `undefined` downstream.
//
// SECURITY NOTE: this is robustness, not a security control — it runs on the
// client. Authority stays in firestore.rules.
import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase/firestore";
import type { ZodType } from "zod";

// Validate a single document. The doc id is injected as `id` so schemas that
// carry an `id` field get it; schemas keyed otherwise (User.uid, Invite.code)
// read the key from the data and Zod strips the surplus `id`.
export function parseDoc<T>(
  schema: ZodType<T>,
  snap: DocumentSnapshot | QueryDocumentSnapshot
): T | null {
  const raw = snap.data();
  if (!raw) return null;
  const result = schema.safeParse({ id: snap.id, ...raw });
  if (!result.success) {
    console.error(`[firestore] doc inválido en ${snap.ref.path}:`, result.error.issues);
    return null;
  }
  return result.data;
}

// Validate every document in a query snapshot, dropping the ones that fail.
export function parseDocs<T>(schema: ZodType<T>, snap: QuerySnapshot): T[] {
  return snap.docs
    .map((d) => parseDoc(schema, d))
    .filter((d): d is T => d !== null);
}
