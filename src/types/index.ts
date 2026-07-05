// Public type surface for the app.
//
// Types are the source of truth as Zod schemas in src/lib/schemas.ts and are
// re-exported here so existing `@/types` imports keep working unchanged. Import
// the schemas themselves (for parsing) from "@/lib/schemas".
export type {
  MatchStatus,
  MatchPhase,
  ResolutionMethod,
  User,
  Invite,
  AppConfig,
  GroupRules,
  GroupPrizeDistribution,
  Group,
  Match,
  Prediction,
  Champion,
  Album,
  Notification,
} from "@/lib/schemas";
