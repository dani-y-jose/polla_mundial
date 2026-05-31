// firebase-admin bootstrap for the admin CLI.
//
// Credentials are resolved in this order:
//   1. FIRESTORE_EMULATOR_HOST set      -> talk to the local emulator, no key.
//   2. GOOGLE_APPLICATION_CREDENTIALS   -> path to a service-account key JSON.
//   3. scripts/admin/.service-account.json (default, gitignored).
//
// The Admin SDK bypasses firestore.rules entirely — this key grants full
// project access. Never commit it (see .gitignore).
//
// Init is LAZY: `db` only reads credentials on first use, so keyless commands
// (e.g. `help`) work without a service-account file.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { FieldValue, type Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "polla-mundial-dj-2026";

const here = dirname(fileURLToPath(import.meta.url));
const defaultKeyPath = join(here, ".service-account.json");
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || defaultKeyPath;

function ensureApp(): void {
  if (getApps().length) return;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: PROJECT_ID });
  } else if (existsSync(keyPath)) {
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8")) as ServiceAccount;
    initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  } else {
    console.error(
      `\nMissing service-account key.\n\n` +
        `Expected it at:\n  ${keyPath}\n\n` +
        `Get one from the Firebase console:\n` +
        `  Project settings → Service accounts → Generate new private key\n` +
        `then save it to scripts/admin/.service-account.json (it is gitignored),\n` +
        `or point GOOGLE_APPLICATION_CREDENTIALS at it.\n`,
    );
    process.exit(1);
  }
}

// Lazy proxies: the first property access initializes the app. Methods are
// bound to the real instance so `this` is correct (db.collection(), etc.).
function lazy<T extends object>(resolve: () => T): T {
  let cached: T | undefined;
  return new Proxy({} as T, {
    get(_target, prop) {
      cached ??= (ensureApp(), resolve());
      const value = (cached as any)[prop];
      return typeof value === "function" ? value.bind(cached) : value;
    },
  });
}

export const db: Firestore = lazy(getFirestore);
export const auth: Auth = lazy(getAuth);

export { FieldValue, Timestamp, PROJECT_ID };
