export type MatchStatus = 'upcoming' | 'locked' | 'finished';
export type MatchPhase = 'group' | 'round_of_16' | 'quarter_finals' | 'semi_finals' | 'finals';
export type ResolutionMethod = 'normal' | 'extra_time' | 'penalties' | null;

export interface User {
  uid: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  age?: number;
  city?: string;
  neighborhood?: string;
  // How this account was admitted (invite-only gate). Set once at sign-up for
  // every account — points at the /invites code that admitted them. For a group
  // invite this is also the pending group the dashboard offers to join.
  inviteId?: string;
}

export interface Invite {
  code: string;
  type: 'app' | 'group';
  groupId: string | null;
  groupName?: string; // denormalized for the public login/confirm-join display
  maxUses: number;
  uses: number;
  consumedBy: string[];
  expiresAt: Date | null; // Timestamp in Firestore, converted to Date on client
  active: boolean;
  createdBy: string;
  createdAt: Date;
}

// Global, admin-only app configuration stored at /config/app.
export interface AppConfig {
  maxMembersPerGroup: number;
}

export interface GroupRules {
  exactScorePoints: number;
  correctOutcomePoints: number;
  uniquePredictionPoints: number;
  quarterFinalsBonus: number;
  semiFinalsBonus: number;
  finalsBonus: number;
}

export interface GroupPrizeDistribution {
  firstPlacePercent: number;
  secondPlacePercent: number;
  thirdPlacePercent: number;
}

export interface Group {
  id: string;
  name: string;
  creatorId: string;
  inviteCode: string;
  members: string[];
  createdAt: Date;
  entryFee?: number;
  rules?: GroupRules;
  prizeDistribution?: GroupPrizeDistribution;
}


export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: Date; // In Firestore this will be a Timestamp, but converted to Date in client
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  phase: MatchPhase;
  city: string;
  stadiumName: string;
  refereeName: string;
  refereeCountry: string;
  resolutionMethod: ResolutionMethod;
}

export interface Prediction {
  id: string;
  userId: string;
  // Predictions are scoped per group: a user makes a separate prediction for the
  // same match in each group they belong to, so points stay independent across
  // groups. Doc id is `${userId}_${groupId}_${matchId}`.
  groupId: string;
  matchId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  pointsEarned: number | null;
  timestamp: Date; // In Firestore this will be a Timestamp, but converted to Date in client
}

// A user's champion pick, scoped per group (parallels Prediction). Doc id is
// `${userId}_${groupId}`. Display-only for now — not used in scoring.
export interface Champion {
  id: string;
  userId: string;
  groupId: string;
  champion: string;
  timestamp: Date; // In Firestore this will be a Timestamp, but converted to Date on the client
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  timestamp: any; // Date or Timestamp
  read: boolean;
  type: 'reminder' | 'score_update' | 'group_invite';
}
