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
  totalPoints?: number;
  exactGuesses?: number;
  champion?: string;
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
  matchId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  pointsEarned: number | null;
  timestamp: Date; // In Firestore this will be a Timestamp, but converted to Date in client
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
