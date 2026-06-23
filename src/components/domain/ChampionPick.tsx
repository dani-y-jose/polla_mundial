"use client";

import { useState } from "react";
import { Card, Button, Select, Badge, cn } from "@/components/ui";
import { TeamFlag } from "./TeamFlag";

// "Tu campeón": elección compacta del campeón del torneo (una por grupo).
// Colapsado por defecto — figurita + nombre + botón "Cambiar"; el selector se
// revela SÓLO al editar (progressive disclosure → ocupa poco). `locked` (pasó el
// plazo) lo deja en sólo lectura; `hint` cubre el estado sin grupo.
export type ChampionPickProps = {
  champion?: string | null;
  teams: string[];
  locked?: boolean;
  deadlineLabel?: string;
  saving?: boolean;
  onSave?: (team: string) => void;
  hint?: string;
  className?: string;
};

const LABEL = "Tu campeón";
const Label = () => (
  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{LABEL}</span>
);

export function ChampionPick({
  champion,
  teams,
  locked = false,
  deadlineLabel,
  saving = false,
  onSave,
  hint,
  className,
}: ChampionPickProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(champion ?? "");

  // Sin grupo (u otro motivo): sólo el hint.
  if (hint) {
    return (
      <Card padding="md" className={cn("space-y-1.5", className)}>
        <Label />
        <p className="text-xs text-ink-muted">{hint}</p>
      </Card>
    );
  }

  // Editando: el selector + acciones (revelado).
  if (editing && !locked) {
    return (
      <Card padding="md" className={cn("space-y-2.5", className)}>
        <Label />
        <Select value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={LABEL}>
          <option value="" className="bg-surface">Elige tu campeón…</option>
          {teams.map((t) => (
            <option key={t} value={t} className="bg-surface">
              {t}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button
            size="sm"
            fullWidth
            disabled={!draft || draft === champion || saving}
            onClick={() => {
              onSave?.(draft);
              setEditing(false);
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(champion ?? "");
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
        {deadlineLabel && (
          <p className="text-[11px] text-ink-faint">Puedes cambiarlo hasta el {deadlineLabel}.</p>
        )}
      </Card>
    );
  }

  // Colapsado (editable o locked).
  return (
    <Card padding="md" className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {champion ? (
          <TeamFlag team={champion} size="md" />
        ) : (
          <span aria-hidden className="text-xl leading-none">🏆</span>
        )}
        <div className="min-w-0 leading-tight">
          <Label />
          {champion ? (
            <p className="truncate font-display text-lg font-extrabold text-ink">{champion}</p>
          ) : (
            <p className="text-xs text-ink-muted">{locked ? "Sin campeón" : "Elige tu campeón"}</p>
          )}
        </div>
      </div>
      {locked ? (
        champion ? <Badge tone="neutral">Cerrado</Badge> : null
      ) : (
        <Button
          size="sm"
          variant={champion ? "ghost" : "primary"}
          className="shrink-0"
          onClick={() => {
            setDraft(champion ?? "");
            setEditing(true);
          }}
        >
          {champion ? "Cambiar" : "Elegir"}
        </Button>
      )}
    </Card>
  );
}
