// Strict, user-facing validation for form inputs.
//
// Distinct from the lenient READ schemas in ./schemas.ts: these enforce ranges
// and integers and carry Spanish messages shown directly to the user. Form
// fields arrive as strings from <input>, so numeric fields are coerced.
//
// SECURITY NOTE: client-side only. The real guard for what reaches Firestore is
// firestore.rules — these schemas are UX, not authorization.
import { z } from "zod";

// First human-readable message from a failed parse, for a single-line alert.
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

// A non-negative integer field coerced from a string input. Empty string
// coerces to 0 (preserving the previous `Number("")` behavior for point rules).
const intField = (label: string, max = 9999) =>
  z.coerce
    .number()
    .int(`${label}: debe ser un número entero.`)
    .min(0, `${label}: no puede ser negativo.`)
    .max(max, `${label}: el valor es demasiado grande.`);

// ---- Match prediction (score entry) ----
export const predictionInputSchema = z.object({
  predictedHomeScore: intField("Marcador local", 99),
  predictedAwayScore: intField("Marcador visitante", 99),
});

// ---- Group scoring rules ----
export const groupRulesInputSchema = z.object({
  exactScorePoints: intField("Puntos por marcador exacto"),
  correctOutcomePoints: intField("Puntos por resultado correcto"),
  uniquePredictionPoints: intField("Bono de pronóstico único"),
  quarterFinalsBonus: intField("Bono de cuartos"),
  semiFinalsBonus: intField("Bono de semifinales"),
  finalsBonus: intField("Bono de final"),
});

// ---- Prize distribution (must total 100%) ----
export const prizeInputSchema = z
  .object({
    firstPlacePercent: intField("1er premio", 100),
    secondPlacePercent: intField("2do premio", 100),
    thirdPlacePercent: intField("3er premio", 100),
  })
  .refine(
    (p) => p.firstPlacePercent + p.secondPlacePercent + p.thirdPlacePercent === 100,
    { message: "La distribución de premios debe sumar exactamente 100%." }
  );

// ---- Group entry fee ----
export const entryFeeSchema = intField("Cuota de entrada", 1_000_000_000);

// ---- Admin: global member cap ----
export const maxMembersInputSchema = z.coerce
  .number()
  .int("El máximo de miembros por grupo debe ser un número entero.")
  .min(1, "El máximo de miembros por grupo debe ser al menos 1.");

// ---- Admin: create match ----
export const matchInputSchema = z.object({
  homeTeam: z.string().trim().min(1, "El equipo local es obligatorio."),
  awayTeam: z.string().trim().min(1, "El equipo visitante es obligatorio."),
  kickoffTime: z
    .string()
    .min(1, "La fecha y hora del partido es obligatoria.")
    .refine((s) => !Number.isNaN(Date.parse(s)), "La fecha y hora del partido no es válida."),
});
