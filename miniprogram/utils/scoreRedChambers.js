/**
 * scoreRedChambers — custom scoring engine for the Red Chambers branching quiz.
 *
 * Algorithm (from red-chamber-logic.txt):
 * 1. Sum scores for every answered question (screening + branch).
 *    Each option has a `scores` map: { typeId: weight }.
 * 2. Rank all types by accumulated score.
 * 3. Check balance conditions → possibly route to special type (jia_mu / liu_laolao).
 * 4. mainType = top-ranked main type.
 * 5. subType = second-ranked IF its score ≥ 0.7 × top score; else null.
 * 6. hasTension = subType exists AND (mainType, subType) is a conflict pair.
 *
 * Returns { resultId, subTypeId, hasTension, breakdown, rankedDimensions }
 */

/**
 * Collect every question from all phases so we can look up answers.
 */
function buildQuestionIndex(quizData) {
  const index = {};
  const { phases } = quizData;

  if (phases && phases.screening && phases.screening.questions) {
    phases.screening.questions.forEach((q) => { index[q.id] = q; });
  }
  if (phases && phases.branches) {
    phases.branches.forEach((branch) => {
      (branch.questions || []).forEach((q) => { index[q.id] = q; });
    });
  }
  return index;
}

/**
 * Accumulate scores from all answered questions.
 * Returns breakdown: { typeId: totalScore }
 */
function accumulateScores(allAnswers, questionIndex) {
  const breakdown = {};

  Object.entries(allAnswers).forEach(([questionId, optionId]) => {
    const question = questionIndex[questionId];
    if (!question) return;

    const opt = question.options.find((o) => o.id === optionId);
    if (!opt || !opt.scores) return;

    Object.entries(opt.scores).forEach(([typeId, weight]) => {
      breakdown[typeId] = (breakdown[typeId] || 0) + weight;
    });
  });

  return breakdown;
}

/**
 * Count how many trigger option strings match the current answers.
 * Trigger format: "<questionId>_<optionId>", e.g. "I1_a".
 */
function countTriggerMatches(triggerOptions, allAnswers) {
  return triggerOptions.filter((trigger) => {
    const lastUnderscore = trigger.lastIndexOf("_");
    const qId = trigger.slice(0, lastUnderscore);
    const optId = trigger.slice(lastUnderscore + 1);
    return allAnswers[qId] === optId;
  }).length;
}

/**
 * Check if two type IDs are a conflict pair.
 */
function isConflictPair(conflictPairs, typeA, typeB) {
  return conflictPairs.some(
    ([a, b]) => (a === typeA && b === typeB) || (a === typeB && b === typeA)
  );
}

/**
 * Resolve special balanced type (jia_mu or liu_laolao) when scores are even.
 */
function resolveSpecialType(scoring, allAnswers, breakdown) {
  const { specialTypeRules } = scoring;

  const jiaMuTriggers = specialTypeRules.jia_mu.triggerOptions;
  const liuLaolaoTriggers = specialTypeRules.liu_laolao.triggerOptions;

  const jiaMuMatches = countTriggerMatches(jiaMuTriggers, allAnswers);
  const liuLaolaoMatches = countTriggerMatches(liuLaolaoTriggers, allAnswers);

  const jiaMuScore = breakdown.jia_mu || 0;
  const liuLaolaoScore = breakdown.liu_laolao || 0;

  // Calculate average score of all main types to compare against
  const mainTypeScores = scoring.mainTypes.map((t) => breakdown[t] || 0);
  const avgScore = mainTypeScores.reduce((a, b) => a + b, 0) / (mainTypeScores.length || 1);

  if (jiaMuMatches >= 2 || jiaMuScore >= avgScore * 1.2) return "jia_mu";
  if (liuLaolaoMatches >= 2 || liuLaolaoScore >= avgScore * 1.2) return "liu_laolao";

  return null; // fall through to regular top-type logic
}

/**
 * Main scoring entry point.
 *
 * @param {object} quizData — full quiz object from red-chambers-full.json
 * @param {object} allAnswers — { [questionId]: optionId }
 * @returns {{ resultId, subTypeId, hasTension, breakdown, rankedDimensions }}
 */
function scoreRedChambers(quizData, allAnswers) {
  const { scoring } = quizData;
  const {
    mainTypes,
    subTypeThreshold,
    balanceThreshold,
    conflictPairs,
  } = scoring;

  // Step 1: Accumulate scores
  const questionIndex = buildQuestionIndex(quizData);
  const breakdown = accumulateScores(allAnswers, questionIndex);

  // Step 2: Rank all main types by score
  const rankedMain = mainTypes
    .map((id) => ({ id, score: breakdown[id] || 0 }))
    .sort((a, b) => b.score - a.score);

  const totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
  const answeredCount = Object.keys(allAnswers).length;

  const topScore = rankedMain[0]?.score || 0;
  const secondScore = rankedMain[1]?.score || 0;

  // Step 3: Detect balance conditions
  const conditionA = topScore <= totalScore / 8 + balanceThreshold.maxScoreCeiling;
  const conditionB =
    topScore - secondScore <= balanceThreshold.balanceDiff &&
    answeredCount >= balanceThreshold.minQuestions;

  const isBalanced = conditionA || conditionB;

  let mainTypeId;
  if (isBalanced) {
    const special = resolveSpecialType(scoring, allAnswers, breakdown);
    mainTypeId = special || rankedMain[0].id;
  } else {
    mainTypeId = rankedMain[0].id;
  }

  // Step 5: Detect sub-type (second type scoring ≥ threshold × top)
  // Pick second-ranked that is not the same as mainTypeId
  const secondRanked = rankedMain.find((r) => r.id !== mainTypeId);
  const mainScore = breakdown[mainTypeId] || 0;
  const subTypeId =
    secondRanked && secondRanked.score >= subTypeThreshold * mainScore
      ? secondRanked.id
      : null;

  // Step 6: Tension detection
  const hasTension =
    !!subTypeId && isConflictPair(conflictPairs, mainTypeId, subTypeId);

  // Build rankedDimensions for display (all main types, scored)
  const rankedDimensions = rankedMain.map((r) => ({
    id: r.id,
    score: r.score,
  }));

  return {
    resultId: mainTypeId,
    subTypeId,
    hasTension,
    breakdown,
    rankedDimensions,
  };
}

module.exports = { scoreRedChambers };
