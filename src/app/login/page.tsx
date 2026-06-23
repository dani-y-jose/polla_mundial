"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The login page was merged into `/` (the app entry is now the auth screen).
// This shim stays so older invite links — /login?invite=CODE — still resolve:
// it forwards to `/` preserving the query string.
export default function LoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/${qs}`);
  }, [router]);
  return null;
}
