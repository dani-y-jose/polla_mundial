"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Group management now lives in the dashboard's "Grupos" tab. This route is kept
// only to redirect any old links/bookmarks back into the unified flow.
export default function GroupsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return <div className="min-h-screen flex items-center justify-center bg-black text-white">Cargando...</div>;
}
