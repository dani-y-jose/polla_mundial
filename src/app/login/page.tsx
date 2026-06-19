"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, runTransaction } from "firebase/firestore";

// The single /invites code (if any) that admitted the visitor to the sign-up
// form. A group invite carries groupId + groupName; a generic admin invite has
// groupId === null and shows remaining cupos instead.
type InviteState =
  | { status: "none" }
  | { status: "checking" }
  | { status: "invalid"; reason: string }
  | { status: "valid"; code: string; groupId: string | null; groupName?: string; remaining: number };

// Firebase Auth surfaces failures via a stable `error.code`. Map the ones a user
// can actually hit to friendly Spanish copy instead of leaking the raw SDK
// message (which is English and exposes internals like "auth/...").
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "El correo electrónico no es válido.",
  "auth/user-disabled": "Esta cuenta fue deshabilitada.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/network-request-failed": "Error de conexión. Revisa tu internet e inténtalo de nuevo.",
  "auth/popup-closed-by-user": "Cerraste la ventana antes de completar el inicio de sesión.",
  "auth/cancelled-popup-request": "Se canceló el inicio de sesión.",
  "auth/popup-blocked": "El navegador bloqueó la ventana emergente. Habilítala e inténtalo de nuevo.",
  "auth/account-exists-with-different-credential":
    "Ya existe una cuenta con ese correo usando otro método de acceso.",
  "auth/operation-not-allowed": "Este método de acceso no está habilitado.",
};

// Resolve a user-facing message: a known Firebase code wins; otherwise our own
// provisioning errors (thrown with safe Spanish messages and no code) pass
// through; everything else falls back to a generic message.
function authErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code;
  if (code) return AUTH_ERROR_MESSAGES[code] ?? fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<InviteState>({ status: "none" });

  const router = useRouter();
  // Guards the auth listener from redirecting while a sign-up/sign-in we
  // triggered here is still in flight (those flows redirect themselves).
  const manualAuthInProgress = useRef(false);

  // The invite code from the URL (?invite=CODE), captured once so both the
  // resolver effect and the post-auth redirect use the same value.
  const inviteCodeFromUrl = (() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("invite")?.trim() || null;
  })();

  // Resolve the single invite from the URL (?invite=CODE) so we know whether to
  // show the sign-up form and which group (if any) the account will be offered.
  // Resolving the invite reads the browser URL, so this state must be derived
  // client-side after hydration — the setState calls here are intentional, not a
  // syncing-effect smell.
  useEffect(() => {
    const code = inviteCodeFromUrl;
    if (!code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInvite({ status: "none" });
      return;
    }

    setInvite({ status: "checking" });
    setIsSignUp(true);

    (async () => {
      try {
        const snap = await getDoc(doc(db, "invites", code));
        if (!snap.exists()) {
          setInvite({ status: "invalid", reason: "Esta invitación no existe." });
          return;
        }
        const inv = snap.data();
        const expMs = inv.expiresAt?.toMillis?.() ?? null;
        if (inv.active === false) {
          setInvite({ status: "invalid", reason: "Esta invitación fue desactivada." });
        } else if (expMs !== null && expMs < Date.now()) {
          setInvite({ status: "invalid", reason: "Esta invitación expiró." });
        } else if ((inv.uses ?? 0) >= (inv.maxUses ?? 0)) {
          setInvite({ status: "invalid", reason: "Esta invitación alcanzó su límite de usos." });
        } else {
          setInvite({
            status: "valid",
            code,
            groupId: (inv.groupId as string | null) ?? null,
            groupName: (inv.groupName as string | undefined) ?? undefined,
            remaining: (inv.maxUses ?? 0) - (inv.uses ?? 0),
          });
        }
      } catch (err) {
        console.error(err);
        setInvite({ status: "invalid", reason: "No se pudo validar la invitación." });
      }
    })();
  }, [inviteCodeFromUrl]);

  // If a user is already signed in and arrives via an invite link, send them
  // straight to the dashboard, where the confirm-join card handles the group.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (current) => {
      if (current && !manualAuthInProgress.current && inviteCodeFromUrl) {
        router.replace(`/dashboard?join=${encodeURIComponent(inviteCodeFromUrl)}`);
      }
    });
    return () => unsub();
  }, [router, inviteCodeFromUrl]);

  // Create the profile and consume the invite in one atomic transaction. The
  // Firestore rules only allow the profile to be written when the invite is
  // consumed in the same commit, so this is the real enforcement point. The
  // actual group join is deferred to the confirm-join card on the dashboard.
  const provisionProfile = async (fbUser: FirebaseUser) => {
    if (invite.status !== "valid") {
      throw new Error("Necesitas una invitación válida para registrarte.");
    }
    const baseProfile = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: name || fbUser.displayName || fbUser.email?.split("@")[0] || "Usuario",
      isAdmin: false,
      age: age ? parseInt(age, 10) : undefined,
      city: city || undefined,
      neighborhood: neighborhood || undefined,
    };
    const code = invite.code;

    await runTransaction(db, async (tx) => {
      const invRef = doc(db, "invites", code);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error("La invitación ya no existe.");
      const inv = invSnap.data();
      const expMs = inv.expiresAt?.toMillis?.() ?? null;
      if (inv.active === false) throw new Error("Esta invitación fue desactivada.");
      if (expMs !== null && expMs < Date.now()) throw new Error("Esta invitación expiró.");
      if ((inv.uses ?? 0) >= (inv.maxUses ?? 0)) throw new Error("Esta invitación alcanzó su límite de usos.");
      const consumedBy: string[] = inv.consumedBy ?? [];
      if (consumedBy.includes(fbUser.uid)) throw new Error("Ya usaste esta invitación.");

      tx.set(doc(db, "users", fbUser.uid), { ...baseProfile, inviteId: code });
      tx.update(invRef, {
        uses: (inv.uses ?? 0) + 1,
        consumedBy: [...consumedBy, fbUser.uid],
      });
    });
  };

  // Where to land after auth: the dashboard, with the invite code as ?join so
  // the confirm-join card can offer the group (no-op for generic invites).
  const dashboardTarget = () =>
    inviteCodeFromUrl ? `/dashboard?join=${encodeURIComponent(inviteCodeFromUrl)}` : "/dashboard";

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    manualAuthInProgress.current = true;

    try {
      if (isSignUp) {
        if (invite.status !== "valid") {
          setError("Necesitas una invitación válida para registrarte.");
          setLoading(false);
          manualAuthInProgress.current = false;
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        try {
          await provisionProfile(userCredential.user);
        } catch (provisionErr) {
          // The auth account exists but we couldn't admit them — roll back by
          // deleting the half-created account so they can retry cleanly.
          await userCredential.user.delete().catch(() => {});
          throw provisionErr;
        }
        router.push(dashboardTarget());
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        router.push(dashboardTarget());
      }
    } catch (err: unknown) {
      manualAuthInProgress.current = false;
      setError(authErrorMessage(err, "Error al autenticar"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    manualAuthInProgress.current = true;

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Existing users may always sign in. New users need a valid invite.
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        if (invite.status !== "valid") {
          await signOut(auth);
          setError("Necesitas una invitación válida para crear una cuenta.");
          setLoading(false);
          manualAuthInProgress.current = false;
          return;
        }
        await provisionProfile(user);
      }

      router.push(dashboardTarget());
    } catch (err: unknown) {
      manualAuthInProgress.current = false;
      console.error(err);
      setError(authErrorMessage(err, "Error al iniciar sesión con Google"));
    } finally {
      setLoading(false);
    }
  };

  const canSignUp = invite.status === "valid";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 py-8">
      {/* Mascots — crisp foreground banner above the card */}
      <Image
        src="/mascots.png"
        alt="Mascotas del Mundial 2026"
        width={1200}
        height={675}
        priority
        className="w-full max-w-md -mb-4 select-none pointer-events-none drop-shadow-2xl"
        style={{ height: "auto" }}
      />

      <div className="max-w-md w-full p-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl">
        <h2 className="text-3xl font-bold mb-6 text-center">
          {isSignUp ? "Crear una Cuenta" : "Iniciar Sesión"}
        </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Invite-only gate feedback (only relevant while signing up). */}
        {isSignUp && invite.status === "checking" && (
          <div className="mb-4 p-3 bg-white/5 border border-white/10 text-gray-300 rounded-lg text-sm">
            Validando invitación…
          </div>
        )}
        {isSignUp && invite.status === "valid" && (
          <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-lg text-sm">
            {invite.groupId
              ? <>Invitación válida 🎉 Al registrarte podrás unirte a <span className="font-bold">{invite.groupName || "tu grupo"}</span>.</>
              : <>Invitación válida 🎉 {invite.remaining} {invite.remaining === 1 ? "cupo disponible" : "cupos disponibles"}.</>}
          </div>
        )}
        {isSignUp && (invite.status === "invalid" || invite.status === "none") && (
          <div className="mb-4 p-3 bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-lg text-sm">
            {invite.status === "invalid"
              ? (invite as { reason: string }).reason
              : "El registro es solo por invitación."}{" "}
            Necesitas un enlace de invitación para crear una cuenta. Si ya tienes cuenta, inicia sesión.
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && canSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  placeholder="¿Cómo quieres que te llamemos?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Edad</label>
                <input
                  type="number"
                  required
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  placeholder="Tu edad"
                  min="1"
                  max="120"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Ciudad</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  placeholder="Tu ciudad"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Barrio (Opcional)</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  placeholder="Tu barrio"
                />
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Correo Electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="usuario@ejemplo.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-black/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || (isSignUp && !canSignUp)}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {loading ? "Por favor espera..." : isSignUp ? "Registrarse" : "Iniciar Sesión"}
          </button>
        </form>

        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="px-3 text-xs text-gray-500 uppercase tracking-widest font-bold">o</span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading || (isSignUp && !canSignUp)}
          className="w-full py-3 px-4 bg-white text-black hover:bg-neutral-100 font-semibold rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Continuar con Google
        </button>

        <div className="mt-6 text-center text-sm text-gray-400">
          {isSignUp ? "¿Ya tienes una cuenta? " : "¿No tienes una cuenta? "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            {isSignUp ? "Inicia sesión" : "Regístrate"}
          </button>
        </div>
      </div>
    </div>
  );
}
