// Web push (FCM) client helpers. Everything that touches the browser's
// Notification / Push / Service Worker APIs lives here so the rest of the app
// stays unaware of FCM. All functions are safe to import during SSR — they only
// touch browser APIs when actually called (never at module load).

import { getApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";
import { doc, updateDoc, arrayRemove, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Public Web Push (VAPID) key: Firebase Console → Project Settings →
// Cloud Messaging → "Web Push certificates" → Generate key pair. It's a public
// key, safe to ship to the browser. Until it's filled in, enrollment is disabled
// and the UI explains that notifications aren't configured yet.
const VAPID_KEY = "REPLACE_WITH_WEB_PUSH_VAPID_KEY";

export type EnablePushResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: "unsupported" | "no-vapid" | "denied" | "no-sw" | "error";
      detail?: string;
    };

let messagingSingleton: Messaging | null = null;

// Returns a Messaging instance only in a browser that supports FCM web push,
// otherwise null. `isSupported()` also covers the iOS rule (false until the PWA
// is installed to the home screen on iOS 16.4+).
async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isSupported())) return null;
  if (!messagingSingleton) messagingSingleton = getMessaging(getApp());
  return messagingSingleton;
}

// Whether this browser can do web push at all — used to decide what the UI shows
// before the user clicks "enable".
export async function pushIsSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return (
    (await isSupported()) &&
    "serviceWorker" in navigator &&
    "Notification" in window
  );
}

// False while the VAPID key is still the placeholder, so the UI can say
// "not configured yet" instead of failing on a click.
export function isVapidConfigured(): boolean {
  return !!VAPID_KEY && !VAPID_KEY.startsWith("REPLACE_WITH");
}

// Asks for notification permission, mints an FCM token bound to our existing
// service worker, and stores it on the user's doc. fcmTokens is a set (one entry
// per device/browser), so calling this again on a new device just adds to it.
export async function enablePushNotifications(
  uid: string
): Promise<EnablePushResult> {
  try {
    const messaging = await getMessagingIfSupported();
    if (!messaging) return { ok: false, reason: "unsupported" };
    if (!isVapidConfigured()) return { ok: false, reason: "no-vapid" };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    // Reuse the SW that ServiceWorkerRegistrar already registered at "/sw.js"
    // rather than letting FCM register its own firebase-messaging-sw.js.
    const registration = await navigator.serviceWorker.ready;
    if (!registration) return { ok: false, reason: "no-sw" };

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: "error", detail: "empty token" };

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    return { ok: true, token };
  } catch (err) {
    console.error("enablePushNotifications failed:", err);
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// Removes a token from the user's doc (e.g. when the user disables push).
export async function disablePushNotifications(
  uid: string,
  token: string
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
}

// Optional foreground handler (app open & focused). The Cloud Function also
// writes an in-app notification doc that the dashboard already renders live via
// onSnapshot, so wiring this up is only needed if you later want an extra toast.
// Returns an unsubscribe function.
export async function onForegroundMessage(
  handler: (data: Record<string, string>) => void
): Promise<() => void> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => handler(payload.data || {}));
}
