"use client";

// Living styleguide for the design-system primitives (src/components/ui).
// Not linked from the app — a dev reference for building/redesigning. Visit /dev.

import { useState } from "react";
import {
  Button,
  IconButton,
  Input,
  Select,
  Card,
  Badge,
  AlertBanner,
  FilterPill,
  FormLabel,
  Spinner,
  EmptyState,
} from "@/components/ui";
import {
  TeamLabel,
  MatchTeams,
  PhaseLabel,
  RankBadge,
  GroupSelector,
  WhatsAppShareButton,
} from "@/components/domain";
import type { Group } from "@/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  const [activeFilter, setActiveFilter] = useState("abiertos");
  const mockGroups = [
    { id: "g1", name: "Los Cracks", inviteCode: "ABC123" },
    { id: "g2", name: "Oficina FC", inviteCode: "XYZ789" },
  ] as unknown as Group[];
  const [selGroup, setSelGroup] = useState<Group | null>(mockGroups[0]);

  return (
    <div className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-10">
        <header>
          <h1 className="text-2xl font-black">Design System · Primitivos</h1>
          <p className="text-sm text-gray-400">Fase 2 — referencia viva de src/components/ui</p>
        </header>

        <Section title="Button · variants">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </Section>

        <Section title="Button · sizes + fullWidth">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <div className="w-full">
            <Button fullWidth>Full width</Button>
          </div>
        </Section>

        <Section title="IconButton (aria-label requerido)">
          <IconButton aria-label="Notificaciones">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1-1.5-1s-1.5.17-1.5 1v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
          </IconButton>
          <IconButton aria-label="Cerrar" variant="secondary">✕</IconButton>
        </Section>

        <Section title="Input / Select / FormLabel">
          <div className="w-full grid sm:grid-cols-2 gap-4">
            <div>
              <FormLabel htmlFor="sg-email">Correo</FormLabel>
              <Input id="sg-email" type="email" placeholder="usuario@ejemplo.com" />
            </div>
            <div>
              <FormLabel htmlFor="sg-bad">Con error</FormLabel>
              <Input id="sg-bad" invalid defaultValue="mal" />
            </div>
            <div>
              <FormLabel htmlFor="sg-phase">Fase</FormLabel>
              <Select id="sg-phase">
                <option className="bg-neutral-950">Grupos</option>
                <option className="bg-neutral-950">Octavos</option>
              </Select>
            </div>
            <div>
              <FormLabel variant="default" htmlFor="sg-name">Label default</FormLabel>
              <Input id="sg-name" placeholder="Nombre" />
            </div>
          </div>
        </Section>

        <Section title="Badge · tones">
          <Badge tone="primary">✓ Guardado</Badge>
          <Badge tone="danger">Cerrado</Badge>
          <Badge tone="warning">Pronto</Badge>
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="gold">1º 🏆</Badge>
          <Badge tone="silver">2º 🥈</Badge>
          <Badge tone="bronze">3º 🥉</Badge>
        </Section>

        <Section title="AlertBanner · tones">
          <div className="w-full space-y-2">
            <AlertBanner tone="error">Correo o contraseña incorrectos.</AlertBanner>
            <AlertBanner tone="success">Invitación válida 🎉</AlertBanner>
            <AlertBanner tone="warning">El registro es solo por invitación.</AlertBanner>
            <AlertBanner tone="neutral">Validando invitación…</AlertBanner>
          </div>
        </Section>

        <Section title="FilterPill (toggle)">
          {["abiertos", "finalizados", "todos"].map((f) => (
            <FilterPill key={f} active={activeFilter === f} accent="warning" onClick={() => setActiveFilter(f)}>
              {f}
            </FilterPill>
          ))}
          <FilterPill accent="primary" active>Grupos</FilterPill>
          <FilterPill accent="indigo" active>A</FilterPill>
        </Section>

        <Section title="Card">
          <Card padding="lg" className="w-full">
            <p className="text-sm text-gray-300">Card estándar (bg-white/5, border, rounded-2xl).</p>
          </Card>
        </Section>

        <Section title="Spinner · sizes">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </Section>

        <Section title="EmptyState">
          <EmptyState className="w-full" icon="⚽" title="Sin partidos">
            No hay partidos para mostrar todavía.
          </EmptyState>
        </Section>

        <div className="pt-4 border-t border-white/10">
          <h2 className="text-sm font-black uppercase tracking-widest text-primary-soft">Dominio</h2>
          <p className="text-xs text-gray-500">Componentes compuestos sobre los primitivos</p>
        </div>

        <Section title="PhaseLabel">
          <PhaseLabel phase="group" />
          <PhaseLabel phase="round_of_16" />
          <PhaseLabel phase="finals" className="text-sm" />
        </Section>

        <Section title="TeamLabel · align">
          <Card className="w-40"><TeamLabel team="Argentina" align="left" /></Card>
          <Card className="w-40"><TeamLabel team="Brasil" align="right" /></Card>
        </Section>

        <Section title="MatchTeams · center variable">
          <Card className="w-full">
            <MatchTeams homeTeam="Argentina" awayTeam="México" center={<span className="text-sm font-black tabular-nums">2 - 1</span>} />
          </Card>
          <Card className="w-full">
            <MatchTeams homeTeam="España" awayTeam="Alemania" center={<span className="text-[10px] text-gray-500 font-bold uppercase">vs</span>} />
          </Card>
        </Section>

        <Section title="RankBadge · circle / pill">
          {[1, 2, 3, 4].map((r) => <RankBadge key={`c${r}`} rank={r} variant="circle" />)}
          {[1, 2, 3, 4].map((r) => <RankBadge key={`p${r}`} rank={r} variant="pill" />)}
        </Section>

        <Section title="GroupSelector">
          <div className="w-full max-w-xs">
            <GroupSelector groups={mockGroups} selectedGroup={selGroup} onChange={(id) => setSelGroup(mockGroups.find((g) => g.id === id) ?? null)} label="Grupo Activo" />
          </div>
        </Section>

        <Section title="WhatsAppShareButton">
          <div className="w-full max-w-xs">
            <WhatsAppShareButton message="¡Únete a mi grupo! Código: ABC123" />
          </div>
        </Section>
      </div>
    </div>
  );
}
