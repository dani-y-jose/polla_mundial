"use client";

// Álbum de figuritas del Mundial 2026 — seguimiento personal "tengo / me falta"
// por usuario (colección albums/{uid}, en vivo vía onSnapshot). Ligado a la
// cuenta como los pronósticos, pero NO por grupo (la figurita es tuya). Escritura
// optimista con setDoc(merge) + arrayUnion/arrayRemove (crea el doc en el primer
// toque). Auth-gated: redirige a "/" si no hay sesión. Reusa el DS (AlbumProgress
// / AlbumSection / StickerCell). El catálogo es provisional (ver @/lib/stickers).

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, arrayUnion, arrayRemove, serverTimestamp } from "firebase/firestore";
import { ALBUM_SECTIONS, ALBUM_TOTAL } from "@/lib/stickers";
import { Input, Spinner, FilterPill, EmptyState } from "@/components/ui";
import { PageHeader, AlbumProgress, AlbumSection } from "@/components/domain";
import {
  AppShell,
  ThemeToggle,
  HomeIcon,
  PredictionsIcon,
  TableIcon,
  GroupsIcon,
  ProfileIcon,
  AlbumIcon,
  type NavItem,
} from "@/components/shell";

const Brand = () => (
  <span className="font-display text-lg font-extrabold tracking-tight text-ink">
    Polla <span className="text-[var(--accent)]">2026</span>
  </span>
);

type Filter = "all" | "owned" | "missing";

export default function AlbumPage() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const albumUnsub = useRef<null | (() => void)>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        // Desmontar el listener ANTES de irnos (evita permission-denied).
        albumUnsub.current?.();
        albumUnsub.current = null;
        router.replace("/");
        return;
      }
      setUser(u);
      albumUnsub.current?.();
      albumUnsub.current = onSnapshot(
        doc(db, "albums", u.uid),
        (snap) => {
          const raw = snap.data()?.owned;
          setOwned(new Set(Array.isArray(raw) ? (raw as string[]) : []));
          setLoading(false);
        },
        (err) => {
          // Ignorar permission-denied durante el teardown (signOut en otra pestaña).
          if ((err as { code?: string }).code !== "permission-denied") console.error(err);
          setLoading(false);
        },
      );
    });
    return () => {
      unsub();
      albumUnsub.current?.();
      albumUnsub.current = null;
    };
  }, [router]);

  function goNav(key: string) {
    if (key === "album") return;
    if (key === "groups") {
      router.push("/grupos");
      return;
    }
    router.push(`/dashboard?tab=${key}`);
  }

  async function toggle(code: string) {
    if (!user) return;
    const has = owned.has(code);
    // Optimista: refleja el cambio ya; revierte si el write falla.
    setOwned((prev) => {
      const n = new Set(prev);
      if (has) n.delete(code);
      else n.add(code);
      return n;
    });
    try {
      await setDoc(
        doc(db, "albums", user.uid),
        { userId: user.uid, owned: has ? arrayRemove(code) : arrayUnion(code), updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      console.error(err);
      setOwned((prev) => {
        const n = new Set(prev);
        if (has) n.add(code);
        else n.delete(code);
        return n;
      });
    }
  }

  const q = search.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!q) return ALBUM_SECTIONS;
    return ALBUM_SECTIONS.map((s) =>
      s.team.toLowerCase().includes(q)
        ? s
        : { ...s, stickers: s.stickers.filter((st) => st.code.toLowerCase().includes(q)) },
    ).filter((s) => s.stickers.length > 0);
  }, [q]);

  // Progreso: contar solo códigos que existen en el catálogo real.
  const have = useMemo(
    () => ALBUM_SECTIONS.reduce((n, s) => n + s.stickers.reduce((m, st) => m + (owned.has(st.code) ? 1 : 0), 0), 0),
    [owned],
  );

  const navItems: NavItem[] = [
    { key: "home", label: "Inicio", icon: <HomeIcon /> },
    { key: "predictions", label: "Pronósticos", icon: <PredictionsIcon /> },
    { key: "table", label: "Tabla", icon: <TableIcon /> },
    { key: "album", label: "Álbum", icon: <AlbumIcon /> },
    { key: "groups", label: "Grupos", icon: <GroupsIcon /> },
    { key: "profile", label: "Perfil", icon: <ProfileIcon /> },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <AppShell
      items={navItems}
      activeKey="album"
      onSelect={goNav}
      brand={<Brand />}
      sidebarFooter={<ThemeToggle className="w-full justify-center" />}
    >
      <div className="space-y-5">
        <PageHeader title="Álbum Mundial 2026" subtitle="Marca las figuritas que tienes y las que te faltan." />

        <AlbumProgress owned={have} total={ALBUM_TOTAL} />

        <div className="flex flex-wrap items-center gap-2">
          {(["all", "owned", "missing"] as const).map((f) => (
            <FilterPill key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "Todas" : f === "owned" ? "Tengo" : "Faltan"}
            </FilterPill>
          ))}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código o equipo"
            aria-label="Buscar figurita"
            className="ml-auto w-full sm:w-56"
          />
        </div>

        {sections.length === 0 ? (
          <EmptyState icon="🔍" title="Sin resultados">
            No encontramos figuritas para “{search}”.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {sections.map((s) => (
              <AlbumSection
                key={s.team + (q ? ":q" : "")}
                team={s.team}
                stickers={s.stickers}
                owned={owned}
                filter={filter}
                onToggle={toggle}
                defaultOpen={!!q}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
