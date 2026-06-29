import { Match, Prediction, GroupRules } from "@/types";
import { QUALIFIER_POINTS } from "@/lib/constants";

/**
 * Calculates the points earned for a prediction based on the actual match score.
 * 
 * - 3 Points: Exact score guessed correctly.
 * - 1 Point: Correct outcome guessed (winner or draw), but incorrect score.
 * - 0 Points: Wrong outcome entirely.
 */
export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
): number {
  // Exact match
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 3;
  }

  // Determine outcomes
  const predictedOutcome = getOutcome(predictedHome, predictedAway);
  const actualOutcome = getOutcome(actualHome, actualAway);

  // Correct outcome
  if (predictedOutcome === actualOutcome) {
    return 1;
  }

  // Wrong outcome
  return 0;
}

export function getOutcome(home: number, away: number): 'home_win' | 'away_win' | 'draw' {
  if (home > away) return 'home_win';
  if (away > home) return 'away_win';
  return 'draw';
}

/**
 * Dynamically calculates total points and exact guesses for all group members.
 * Supports custom scoring rules, unique prediction bonuses, and phase bonuses.
 *
 * Predictions are per-group: only predictions whose `groupId` matches this group
 * are counted, so a member's predictions in their *other* groups never leak into
 * this leaderboard. Callers may pass an unfiltered prediction list safely.
 */
export function calculateGroupScores(
  groupId: string,
  members: string[],
  matches: Match[],
  predictions: Prediction[],
  rules: GroupRules
): Record<string, { totalPoints: number; exactGuesses: number }> {
  const scores: Record<string, { totalPoints: number; exactGuesses: number }> = {};

  // Only this group's predictions count toward this group's standings.
  const groupPredictions = predictions.filter(p => p.groupId === groupId);

  // Initialize
  members.forEach(uid => {
    scores[uid] = { totalPoints: 0, exactGuesses: 0 };
  });

  const finishedMatches = matches.filter(m => m.status === 'finished');

  // 1. Calculate points for individual match predictions
  finishedMatches.forEach(match => {
    const actualHome = match.homeScore!;
    const actualAway = match.awayScore!;
    const actualOutcome = getOutcome(actualHome, actualAway);

    // Get predictions for this match by group members
    const matchPreds = groupPredictions.filter(p => p.matchId === match.id && members.includes(p.userId));

    // Keep track of who got exact score
    const exactScoreUsers: string[] = [];

    matchPreds.forEach(pred => {
      const predHome = pred.predictedHomeScore;
      const predAway = pred.predictedAwayScore;
      const predOutcome = getOutcome(predHome, predAway);

      let pts = 0;

      if (predHome === actualHome && predAway === actualAway) {
        pts = rules.exactScorePoints;
        exactScoreUsers.push(pred.userId);
        scores[pred.userId].exactGuesses += 1;
      } else if (predOutcome === actualOutcome) {
        pts = rules.correctOutcomePoints;
      }

      // "Clasifica" bonus: a fixed QUALIFIER_POINTS for correctly predicting
      // which team advanced, awarded ONLY when the match was decided by
      // penalties (the 120' score is a draw, so the score-based outcome above
      // can't reward picking the right qualifier).
      if (match.resolutionMethod === 'penalties' && match.qualifier
          && pred.predictedQualifier === match.qualifier) {
        pts += QUALIFIER_POINTS;
      }

      scores[pred.userId].totalPoints += pts;
    });

    // Unique prediction bonus: only 1 user in the group got the exact score correct
    if (rules.uniquePredictionPoints > 0 && exactScoreUsers.length === 1) {
      const uniqueUserId = exactScoreUsers[0];
      scores[uniqueUserId].totalPoints += rules.uniquePredictionPoints;
    }
  });

  // 2. Stage bonuses: correctly predicting the outcome of every match in a
  // round. Each round only pays out once it has fully finished (the expected
  // match count is present) and the group enabled that bonus.
  //   Bono Cuartos     — all 8 Round of 16 outcomes correct
  //   Bono Semifinales — all 4 Quarter Final outcomes correct
  //   Bono Final       — both Semifinal outcomes correct
  awardPhaseBonus(scores, members, groupPredictions,
    finishedMatches.filter(m => m.phase === 'round_of_16'), 8, rules.quarterFinalsBonus);
  awardPhaseBonus(scores, members, groupPredictions,
    finishedMatches.filter(m => m.phase === 'quarter_finals'), 4, rules.semiFinalsBonus);
  awardPhaseBonus(scores, members, groupPredictions,
    finishedMatches.filter(m => m.phase === 'semi_finals'), 2, rules.finalsBonus);

  return scores;
}

/**
 * Awards a round bonus to every member who predicted the correct outcome of
 * *all* matches in a phase. No-op unless the bonus is enabled (> 0) and the
 * whole round has finished (`phaseMatches.length === expectedCount`).
 * Mutates `scores` in place.
 */
function awardPhaseBonus(
  scores: Record<string, { totalPoints: number; exactGuesses: number }>,
  members: string[],
  groupPredictions: Prediction[],
  phaseMatches: Match[],
  expectedCount: number,
  bonusPoints: number
): void {
  if (bonusPoints <= 0 || phaseMatches.length !== expectedCount) return;

  members.forEach(uid => {
    const userPreds = groupPredictions.filter(p => p.userId === uid);
    const guessedAll = phaseMatches.every(match => {
      const pred = userPreds.find(p => p.matchId === match.id);
      if (!pred) return false;
      return getOutcome(pred.predictedHomeScore, pred.predictedAwayScore)
        === getOutcome(match.homeScore!, match.awayScore!);
    });
    if (guessedAll) {
      scores[uid].totalPoints += bonusPoints;
    }
  });
}
