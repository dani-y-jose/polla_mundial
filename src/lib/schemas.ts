// Single source of truth for the app's data shapes.
//
// Each Firestore collection has a Zod schema here; the TypeScript types are
// derived from the schemas with `z.infer` and re-exported via `@/types`. This
// replaces the hand-written interfaces so the runtime validator and the compile
// -time type can never drift apart.
//
// Two distinct uses:
//   - READ schemas (this file): lenient — tolerate the shapes Firestore returns
//     (Timestamp on reads, Date on writes) and default missing optional fields,
//     so a slightly-incomplete doc is repaired rather than dropped.
//   - FORM schemas (./form-schemas.ts): strict — enforce ranges/integers and
//     carry Spanish messages for user-facing validation.
//
// SECURITY NOTE: Zod runs on the client and can be bypassed via the SDK. It is
// for DX/UX/robustness, NOT a security control — authority stays in
// firestore.rules.
import { z } from "zod";
import type { Timestamp } from "firebase/firestore";

// Firestore returns a `Timestamp` on reads while client code writes a `Date`.
// We accept both. Duck-typed (not `instanceof`) on purpose: the admin CLI uses
// the firebase-admin SDK whose Timestamp is a *different* class, and this schema
// is shared with it. `toMs()` normalizes either shape downstream.
const hasToMillis = (v: unknown): v is { toMillis: () => number } =>
  typeof v === "object" && v !== null && typeof (v as { toMillis?: unknown }).toMillis === "function";

// Accepts a JS Date, a Firestore Timestamp, or — for data that crossed an HTTP
// boundary (e.g. the /api/matches cache) — epoch millis or an ISO string. All
// shapes are normalized downstream by toMs().
export const zTimestamp = z.custom<Date | Timestamp | number | string>(
  (v) => v instanceof Date || typeof v === "number" || typeof v === "string" || hasToMillis(v),
  { message: "Se esperaba una fecha, Timestamp, epoch o ISO string" }
);

// Looser variant for notifications, whose timestamp may also arrive as epoch
// millis or an ISO string. Matches `TimestampLike` in @/lib/dates.
export const zTimestampLoose = z.custom<Date | Timestamp | number | string>(
  (v) => v instanceof Date || typeof v === "number" || typeof v === "string" || hasToMillis(v)
);

// ---- Enums ----
export const matchStatusSchema = z.enum(["upcoming", "locked", "finished"]);
export const matchPhaseSchema = z.enum(["group", "round_of_32", "round_of_16", "quarter_finals", "semi_finals", "finals"]);
export const resolutionMethodSchema = z.enum(["normal", "extra_time", "penalties"]).nullable();

export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type MatchPhase = z.infer<typeof matchPhaseSchema>;
export type ResolutionMethod = z.infer<typeof resolutionMethodSchema>;

// ---- Users ----
export const userSchema = z.object({
  uid: z.string(),
  displayName: z.string(),
  email: z.string(),
  isAdmin: z.boolean(),
  age: z.number().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  inviteId: z.string().optional(),
  fcmTokens: z.array(z.string()).optional(),
});
export type User = z.infer<typeof userSchema>;

// ---- Invites ----
export const inviteSchema = z.object({
  code: z.string(),
  type: z.enum(["app", "group"]),
  groupId: z.string().nullable(),
  groupName: z.string().optional(),
  maxUses: z.number(),
  uses: z.number(),
  consumedBy: z.array(z.string()),
  expiresAt: zTimestamp.nullable(),
  active: z.boolean(),
  createdBy: z.string(),
  createdAt: zTimestamp,
});
export type Invite = z.infer<typeof inviteSchema>;

// ---- App config ----
export const appConfigSchema = z.object({
  maxMembersPerGroup: z.number(),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

// ---- Group rules & prizes ----
export const groupRulesSchema = z.object({
  exactScorePoints: z.number(),
  correctOutcomePoints: z.number(),
  uniquePredictionPoints: z.number(),
  quarterFinalsBonus: z.number(),
  semiFinalsBonus: z.number(),
  finalsBonus: z.number(),
});
export type GroupRules = z.infer<typeof groupRulesSchema>;

export const groupPrizeDistributionSchema = z.object({
  firstPlacePercent: z.number(),
  secondPlacePercent: z.number(),
  thirdPlacePercent: z.number(),
});
export type GroupPrizeDistribution = z.infer<typeof groupPrizeDistributionSchema>;

// ---- Groups ----
export const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  creatorId: z.string(),
  inviteCode: z.string(),
  members: z.array(z.string()),
  createdAt: zTimestamp,
  entryFee: z.number().optional(),
  rules: groupRulesSchema.optional(),
  prizeDistribution: groupPrizeDistributionSchema.optional(),
});
export type Group = z.infer<typeof groupSchema>;

// ---- Matches ----
// Venue/referee metadata defaults to "" so a match missing those fields is
// repaired, not dropped, by the read-boundary parser.
export const matchSchema = z.object({
  id: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  kickoffTime: zTimestamp,
  status: matchStatusSchema,
  homeScore: z.number().nullable(),
  awayScore: z.number().nullable(),
  phase: matchPhaseSchema,
  city: z.string().default(""),
  stadiumName: z.string().default(""),
  refereeName: z.string().default(""),
  refereeCountry: z.string().default(""),
  resolutionMethod: resolutionMethodSchema,
  // Which team advanced. Only meaningful for knockout matches decided by
  // penalties (where the 120' score is a draw and the winner can't be derived
  // from homeScore/awayScore). null otherwise. "home"/"away" mirrors getOutcome.
  qualifier: z.enum(["home", "away"]).nullable().default(null),
  reminderSent: z.boolean().optional(),
});
export type Match = z.infer<typeof matchSchema>;

// ---- Predictions ----
export const predictionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  groupId: z.string(),
  matchId: z.string(),
  predictedHomeScore: z.number(),
  predictedAwayScore: z.number(),
  // The user's "clasifica" pick for knockout matches: which team they think
  // advances. Worth a fixed bonus (QUALIFIER_POINTS) only when the match was
  // decided by penalties. null for group-stage predictions and legacy docs.
  predictedQualifier: z.enum(["home", "away"]).nullable().default(null),
  pointsEarned: z.number().nullable(),
  timestamp: zTimestamp,
});
export type Prediction = z.infer<typeof predictionSchema>;

// ---- Champions ----
export const championSchema = z.object({
  id: z.string(),
  userId: z.string(),
  groupId: z.string(),
  champion: z.string(),
  timestamp: zTimestamp,
});
export type Champion = z.infer<typeof championSchema>;

// ---- Albums (colección de figuritas por usuario) ----
// Un doc por usuario (id = uid). `owned` = códigos de figuritas que tiene.
// Personal, NO por grupo. Lenient en la lectura: repara docs incompletos.
export const albumSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  owned: z.array(z.string()).default([]),
  updatedAt: zTimestamp.optional(),
});
export type Album = z.infer<typeof albumSchema>;

// ---- Notifications ----
export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().default(""),
  message: z.string().default(""),
  timestamp: zTimestampLoose.nullish(),
  read: z.boolean().default(false),
  type: z.enum(["reminder", "score_update", "group_invite"]),
});
export type Notification = z.infer<typeof notificationSchema>;
