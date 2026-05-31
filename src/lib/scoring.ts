import { Match, Prediction, GroupRules } from "@/types";

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

      scores[pred.userId].totalPoints += pts;
    });

    // Unique prediction bonus: only 1 user in the group got the exact score correct
    if (rules.uniquePredictionPoints > 0 && exactScoreUsers.length === 1) {
      const uniqueUserId = exactScoreUsers[0];
      scores[uniqueUserId].totalPoints += rules.uniquePredictionPoints;
    }
  });

  // 2. Stage bonuses: Guessing all qualifiers in a round
  const roundOf16Matches = finishedMatches.filter(m => m.phase === 'round_of_16');
  const quarterFinalsMatches = finishedMatches.filter(m => m.phase === 'quarter_finals');
  const semiFinalsMatches = finishedMatches.filter(m => m.phase === 'semi_finals');

  members.forEach(uid => {
    const userPreds = groupPredictions.filter(p => p.userId === uid);

    // Bono Cuartos: Guess all Round of 16 winners correctly
    if (rules.quarterFinalsBonus > 0 && roundOf16Matches.length === 8) {
      let guessedAll = true;
      roundOf16Matches.forEach(match => {
        const pred = userPreds.find(p => p.matchId === match.id);
        if (!pred) {
          guessedAll = false;
          return;
        }
        const predOutcome = getOutcome(pred.predictedHomeScore, pred.predictedAwayScore);
        const actualOutcome = getOutcome(match.homeScore!, match.awayScore!);
        if (predOutcome !== actualOutcome) {
          guessedAll = false;
        }
      });
      if (guessedAll) {
        scores[uid].totalPoints += rules.quarterFinalsBonus;
      }
    }

    // Bono Semifinales: Guess all Quarter Finals winners correctly
    if (rules.semiFinalsBonus > 0 && quarterFinalsMatches.length === 4) {
      let guessedAll = true;
      quarterFinalsMatches.forEach(match => {
        const pred = userPreds.find(p => p.matchId === match.id);
        if (!pred) {
          guessedAll = false;
          return;
        }
        const predOutcome = getOutcome(pred.predictedHomeScore, pred.predictedAwayScore);
        const actualOutcome = getOutcome(match.homeScore!, match.awayScore!);
        if (predOutcome !== actualOutcome) {
          guessedAll = false;
        }
      });
      if (guessedAll) {
        scores[uid].totalPoints += rules.semiFinalsBonus;
      }
    }

    // Bono Final: Guess all Semifinals winners correctly
    if (rules.finalsBonus > 0 && semiFinalsMatches.length === 2) {
      let guessedAll = true;
      semiFinalsMatches.forEach(match => {
        const pred = userPreds.find(p => p.matchId === match.id);
        if (!pred) {
          guessedAll = false;
          return;
        }
        const predOutcome = getOutcome(pred.predictedHomeScore, pred.predictedAwayScore);
        const actualOutcome = getOutcome(match.homeScore!, match.awayScore!);
        if (predOutcome !== actualOutcome) {
          guessedAll = false;
        }
      });
      if (guessedAll) {
        scores[uid].totalPoints += rules.finalsBonus;
      }
    }
  });

  return scores;
}
