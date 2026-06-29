import { calculatePoints, calculateGroupScores } from "./scoring";
import { Match, Prediction, GroupRules } from "@/types";
import { QUALIFIER_POINTS } from "@/lib/constants";

function runTests() {
  console.log("Testing calculatePoints...");

  // Exact Match
  console.assert(calculatePoints(2, 1, 2, 1) === 3, "Exact Match: 2-1 vs 2-1 should be 3");
  console.assert(calculatePoints(0, 0, 0, 0) === 3, "Exact Match: 0-0 vs 0-0 should be 3");

  // Correct Outcome (Home Win)
  console.assert(calculatePoints(2, 0, 1, 0) === 1, "Correct Outcome (Home Win): 2-0 vs 1-0 should be 1");
  console.assert(calculatePoints(3, 1, 2, 1) === 1, "Correct Outcome (Home Win): 3-1 vs 2-1 should be 1");

  // Correct Outcome (Away Win)
  console.assert(calculatePoints(0, 1, 1, 2) === 1, "Correct Outcome (Away Win): 0-1 vs 1-2 should be 1");

  // Correct Outcome (Draw)
  console.assert(calculatePoints(1, 1, 2, 2) === 1, "Correct Outcome (Draw): 1-1 vs 2-2 should be 1");

  // Wrong Outcome
  console.assert(calculatePoints(2, 1, 0, 2) === 0, "Wrong Outcome: Predicted Home Win, Actual Away Win");
  console.assert(calculatePoints(1, 1, 2, 0) === 0, "Wrong Outcome: Predicted Draw, Actual Home Win");

  console.log("Testing calculateGroupScores (dynamic group scoring rules)...");

  // Predictions are per-group; every fixture carries this group's id.
  const GROUP = "g1";
  const members = ["user1", "user2", "user3"];
  const rules: GroupRules = {
    exactScorePoints: 5,
    correctOutcomePoints: 2,
    uniquePredictionPoints: 10,
    quarterFinalsBonus: 20,
    semiFinalsBonus: 30,
    finalsBonus: 40
  };

  const dummyDate = new Date();

  // Test Case A: Single match with 1 exact score (unique), 1 outcome correct, 1 wrong
  const matchesA: Match[] = [
    {
      id: "match1",
      homeTeam: "Argentina",
      awayTeam: "Brasil",
      kickoffTime: dummyDate,
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      phase: "group",
      city: "Miami",
      stadiumName: "Hard Rock",
      refereeName: "Ref",
      refereeCountry: "US",
      resolutionMethod: "normal",
      qualifier: null
    }
  ];

  const predictionsA: Prediction[] = [
    {
      id: "p1",
      userId: "user1",
      groupId: GROUP,
      matchId: "match1",
      predictedHomeScore: 2,
      predictedAwayScore: 1, // Exact (5 pts) + Unique Score (10 pts) = 15 pts
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    },
    {
      id: "p2",
      userId: "user2",
      groupId: GROUP,
      matchId: "match1",
      predictedHomeScore: 1,
      predictedAwayScore: 0, // Outcome (2 pts)
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    },
    {
      id: "p3",
      userId: "user3",
      groupId: GROUP,
      matchId: "match1",
      predictedHomeScore: 0,
      predictedAwayScore: 3, // Wrong (0 pts)
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    }
  ];

  const scoresA = calculateGroupScores(GROUP, members, matchesA, predictionsA, rules);
  console.assert(scoresA["user1"].totalPoints === 15, `user1 should have 15 pts (5 exact + 10 unique score bonus), got ${scoresA["user1"].totalPoints}`);
  console.assert(scoresA["user1"].exactGuesses === 1, `user1 should have 1 exact guess, got ${scoresA["user1"].exactGuesses}`);
  console.assert(scoresA["user2"].totalPoints === 2, `user2 should have 2 pts (outcome), got ${scoresA["user2"].totalPoints}`);
  console.assert(scoresA["user3"].totalPoints === 0, `user3 should have 0 pts, got ${scoresA["user3"].totalPoints}`);

  // Test Case A2: a prediction from ANOTHER group must never count toward this
  // group's standings, even for the same user and match.
  const predictionsA2: Prediction[] = [
    ...predictionsA,
    {
      id: "p_other",
      userId: "user3",
      groupId: "other-group",
      matchId: "match1",
      predictedHomeScore: 2,
      predictedAwayScore: 1, // exact, but in a different group -> ignored here
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    }
  ];
  const scoresA2 = calculateGroupScores(GROUP, members, matchesA, predictionsA2, rules);
  console.assert(scoresA2["user3"].totalPoints === 0, `user3 should still have 0 pts (other-group prediction ignored), got ${scoresA2["user3"].totalPoints}`);
  console.assert(scoresA2["user1"].totalPoints === 15, `user1 should still have 15 pts, got ${scoresA2["user1"].totalPoints}`);

  // Test Case B: Multiple users with exact score -> No unique prediction points awarded
  const predictionsB: Prediction[] = [
    {
      id: "p1b",
      userId: "user1",
      groupId: GROUP,
      matchId: "match1",
      predictedHomeScore: 2,
      predictedAwayScore: 1, // Exact (5 pts) (No unique since user2 also exact)
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    },
    {
      id: "p2b",
      userId: "user2",
      groupId: GROUP,
      matchId: "match1",
      predictedHomeScore: 2,
      predictedAwayScore: 1, // Exact (5 pts)
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    }
  ];

  const scoresB = calculateGroupScores(GROUP, members, matchesA, predictionsB, rules);
  console.assert(scoresB["user1"].totalPoints === 5, `user1 should have 5 pts, got ${scoresB["user1"].totalPoints}`);
  console.assert(scoresB["user2"].totalPoints === 5, `user2 should have 5 pts, got ${scoresB["user2"].totalPoints}`);

  // Test Case C: Round of 16 phase bonus (Bono Cuartos)
  // Create 8 finished Round of 16 matches
  const roundOf16Matches: Match[] = Array.from({ length: 8 }, (_, i) => ({
    id: `r16_${i}`,
    homeTeam: `Home_${i}`,
    awayTeam: `Away_${i}`,
    kickoffTime: dummyDate,
    status: "finished",
    homeScore: 2,
    awayScore: 0, // All matches are home wins (2-0)
    phase: "round_of_16",
    city: "City",
    stadiumName: "Stadium",
    refereeName: "Ref",
    refereeCountry: "US",
    resolutionMethod: "normal",
    qualifier: null
  }));

  // user1 predicts correct outcome (2-0, exact) for all 8 matches
  // user2 predicts correct outcome for 7, and wrong for 1
  const predictionsC: Prediction[] = [];

  roundOf16Matches.forEach((m, idx) => {
    // user1 correct predictions
    predictionsC.push({
      id: `p1_c_${idx}`,
      userId: "user1",
      groupId: GROUP,
      matchId: m.id,
      predictedHomeScore: 2,
      predictedAwayScore: 0, // Exact (5 pts * 8 = 40 pts)
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    });

    // user2 correct outcome except match 7
    predictionsC.push({
      id: `p2_c_${idx}`,
      userId: "user2",
      groupId: GROUP,
      matchId: m.id,
      predictedHomeScore: idx === 7 ? 0 : 2, // predicted away win for match 7
      predictedAwayScore: idx === 7 ? 1 : 0,
      predictedQualifier: null,
      pointsEarned: null,
      timestamp: dummyDate
    });
  });

  const scoresC = calculateGroupScores(GROUP, ["user1", "user2"], roundOf16Matches, predictionsC, rules);

  // user1 got all 8 Round of 16 winners correctly -> awarded the quarterFinalsBonus (20 pts)
  // user1 total: 8 matches * 5 points (exact) = 40 points, PLUS 20 points bonus = 60 points.
  // Wait, is there a unique prediction bonus? For each match, user1 and user2 both got exact or outcome for matches 0-6 (so no unique).
  // For match 7, user1 is the ONLY exact score (user2 got wrong outcome). So user1 gets 10 unique prediction points for match 7!
  // Therefore, user1 points = 40 (exacts) + 10 (unique score bonus for match 7) + 20 (bono cuartos) = 70 points.
  console.assert(scoresC["user1"].totalPoints === 70, `user1 should have 70 pts (40 exacts + 10 unique match 7 + 20 round bonus), got ${scoresC["user1"].totalPoints}`);

  // user2 got 7 correct (7 * 5 = 35) and 1 wrong (0) = 35 points, no bonuses.
  console.assert(scoresC["user2"].totalPoints === 35, `user2 should have 35 pts, got ${scoresC["user2"].totalPoints}`);

  console.log("Testing calculateGroupScores (knockout 'clasifica' qualifier bonus)...");

  // Test Case D: Knockout match decided by penalties (120' draw 1-1, "home" advances).
  // The score is judged at 120' (a draw), and a correct "clasifica" pick earns a
  // fixed QUALIFIER_POINTS on top — only because resolutionMethod is "penalties".
  const penaltyMatch: Match[] = [
    {
      id: "qf1",
      homeTeam: "España",
      awayTeam: "Francia",
      kickoffTime: dummyDate,
      status: "finished",
      homeScore: 1,
      awayScore: 1, // 120' draw
      phase: "quarter_finals",
      city: "City",
      stadiumName: "Stadium",
      refereeName: "Ref",
      refereeCountry: "US",
      resolutionMethod: "penalties",
      qualifier: "home" // España advanced on penalties
    }
  ];

  const predictionsD: Prediction[] = [
    {
      // Exact 120' draw + correct qualifier: 5 (exact) + 10 (unique, sole exact) + 1 (clasifica)
      id: "pd1",
      userId: "user1",
      groupId: GROUP,
      matchId: "qf1",
      predictedHomeScore: 1,
      predictedAwayScore: 1,
      predictedQualifier: "home",
      pointsEarned: null,
      timestamp: dummyDate
    },
    {
      // Correct outcome (a draw, 0-0) but WRONG qualifier: 2 (outcome) + 0 (clasifica)
      id: "pd2",
      userId: "user2",
      groupId: GROUP,
      matchId: "qf1",
      predictedHomeScore: 0,
      predictedAwayScore: 0,
      predictedQualifier: "away",
      pointsEarned: null,
      timestamp: dummyDate
    },
    {
      // Wrong outcome (home win) but correct qualifier: 0 (score) + 1 (clasifica)
      id: "pd3",
      userId: "user3",
      groupId: GROUP,
      matchId: "qf1",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      predictedQualifier: "home",
      pointsEarned: null,
      timestamp: dummyDate
    }
  ];

  const scoresD = calculateGroupScores(GROUP, members, penaltyMatch, predictionsD, rules);
  console.assert(scoresD["user1"].totalPoints === 5 + 10 + QUALIFIER_POINTS, `user1 should have ${5 + 10 + QUALIFIER_POINTS} pts (exact + unique + clasifica), got ${scoresD["user1"].totalPoints}`);
  console.assert(scoresD["user2"].totalPoints === 2, `user2 should have 2 pts (outcome, wrong qualifier), got ${scoresD["user2"].totalPoints}`);
  console.assert(scoresD["user3"].totalPoints === QUALIFIER_POINTS, `user3 should have ${QUALIFIER_POINTS} pt (wrong score, correct qualifier), got ${scoresD["user3"].totalPoints}`);

  // Test Case E: a knockout match NOT decided by penalties grants no qualifier
  // bonus, even with a correct pick (the qualifier field stays null).
  const normalKnockout: Match[] = [
    {
      id: "r32_1",
      homeTeam: "Brasil",
      awayTeam: "Chile",
      kickoffTime: dummyDate,
      status: "finished",
      homeScore: 2,
      awayScore: 0,
      phase: "round_of_32",
      city: "City",
      stadiumName: "Stadium",
      refereeName: "Ref",
      refereeCountry: "US",
      resolutionMethod: "normal",
      qualifier: null
    }
  ];
  const predictionsE: Prediction[] = [
    {
      id: "pe1",
      userId: "user1",
      groupId: GROUP,
      matchId: "r32_1",
      predictedHomeScore: 2,
      predictedAwayScore: 0, // exact (5) + unique (10), NO clasifica bonus
      predictedQualifier: "home",
      pointsEarned: null,
      timestamp: dummyDate
    }
  ];
  const scoresE = calculateGroupScores(GROUP, members, normalKnockout, predictionsE, rules);
  console.assert(scoresE["user1"].totalPoints === 15, `user1 should have 15 pts (exact + unique, no qualifier bonus on a non-penalty match), got ${scoresE["user1"].totalPoints}`);

  console.log("All scoring and group bonus tests passed successfully.");
}

runTests();
