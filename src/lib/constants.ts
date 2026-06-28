// Constants shared across routes. These maps and defaults used to be copy-pasted
// into the dashboard, admin and group-detail pages; this is now their single
// source of truth. UI strings stay in Spanish (see CLAUDE.md).

import type { GroupRules } from "@/types";

// Match phase → Spanish label. Shown wherever a match's phase is rendered.
// Callers use `PHASE_TRANSLATIONS[phase] || phase` to tolerate unknown phases.
export const PHASE_TRANSLATIONS: Record<string, string> = {
  group: "Fase de Grupos",
  round_of_32: "16avos de Final",
  round_of_16: "Octavos de Final",
  quarter_finals: "Cuartos de Final",
  semi_finals: "Semifinales",
  finals: "Gran Final",
};

// How a finished match was resolved → Spanish label (admin + group detail).
export const RESOLUTION_TRANSLATIONS: Record<string, string> = {
  normal: "90 Minutos",
  extra_time: "Tiempo Extra",
  penalties: "Penales",
};

// Fallback scoring rules for a group that has none configured. Mirrors the
// fixed 3/1/0 base rule in src/lib/scoring.ts.
export const DEFAULT_GROUP_RULES: GroupRules = {
  exactScorePoints: 3,
  correctOutcomePoints: 1,
  uniquePredictionPoints: 0,
  quarterFinalsBonus: 0,
  semiFinalsBonus: 0,
  finalsBonus: 0,
};

// A match counts as "starting soon" within this many minutes of kickoff
// (drives the dashboard home-tab reminders).
export const SOON_WINDOW_MIN = 60;

// Page size for the dashboard predictions list.
export const PREDICTIONS_PER_PAGE = 10;
