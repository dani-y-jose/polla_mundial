// Constants shared across routes. These maps and defaults used to be copy-pasted
// into the dashboard, admin and group-detail pages; this is now their single
// source of truth. UI strings stay in Spanish (see CLAUDE.md).

import type { Group, GroupRules, Match, MatchPhase } from "@/types";

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

// Chronological order of the tournament phases. Used to compare phases (a group
// that "starts at cuartos" includes every phase whose index is >= that of
// quarter_finals). Keep in sync with matchPhaseSchema.
export const PHASE_ORDER: MatchPhase[] = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarter_finals",
  "semi_finals",
  "finals",
];

// Numeric rank of a phase (earlier = smaller). Unknown phases sort last, so a
// stray/mislabeled phase is shown (>= any floor) rather than silently hidden.
// Real matches always carry a valid enum phase (matchPhaseSchema), so this only
// governs defensive edge cases.
export const phaseIndex = (phase: string): number => {
  const i = PHASE_ORDER.indexOf(phase as MatchPhase);
  return i === -1 ? PHASE_ORDER.length : i;
};

// A group's phase floor: the earliest phase it plays. Groups created before
// `startPhase` existed have none → they play the whole tournament ("group").
export const groupStartPhase = (group: Pick<Group, "startPhase">): MatchPhase =>
  group.startPhase ?? "group";

// True when a match belongs to a group's scope — i.e. its phase is at or after
// the group's floor. A cuartos-only group hides all group/octavos matches from
// display, prediction and scoring. This is the single gate for per-group match
// visibility; filter with it before rendering or scoring a group's matches.
export const matchInGroupScope = (
  match: Pick<Match, "phase">,
  group: Pick<Group, "startPhase">,
): boolean => phaseIndex(match.phase) >= phaseIndex(groupStartPhase(group));

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

// Fixed bonus for correctly predicting which team advances ("clasifica"),
// awarded only when a knockout match was decided by penalties. Not a per-group
// rule by design — see src/lib/scoring.ts.
export const QUALIFIER_POINTS = 1;

// Knockout matches (everything past the group stage) can't end in a draw, so
// they carry the "clasifica" pick. Used by the dashboard (when to show the
// qualifier toggle) and admin (when to ask which team advanced on penalties).
export const isKnockoutPhase = (phase: string): boolean => phase !== "group";

// A match counts as "starting soon" within this many minutes of kickoff
// (drives the dashboard home-tab reminders).
export const SOON_WINDOW_MIN = 60;

// Lo máximo que puede durar un partido (90' + prórroga + penales + descansos y
// añadidos). Pasado este margen desde el kickoff sin resultado cargado, el
// partido deja de mostrarse "en vivo" y pasa a "esperando resultado": el admin
// todavía no cargó el marcador. Evita el "en vivo" eterno.
export const MATCH_MAX_DURATION_MIN = 210; // 3.5 h

// Page size for the dashboard predictions list.
export const PREDICTIONS_PER_PAGE = 10;
