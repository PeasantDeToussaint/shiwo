/**
 * scoreGeneric.js
 * Weighted-dimension scoring engine for AI-generated cloud quizzes.
 *
 * Quiz schema expected:
 *   scoring.type === "weighted-dimension"
 *   scoring.dimensions: string[]
 *   questions[].options[].scores: { [dimension]: number }
 *   results[].dimension_profile: { [dimension]: number }  (0–1 weights)
 *
 * Algorithm:
 *   1. Sum raw scores per dimension from user's answers
 *   2. Normalize to [0,1] range across all dimensions
 *   3. Find result whose dimension_profile has highest dot-product with normalized scores
 */

const { scoreTwoPhaseArchetype } = require("./scoreTwoPhaseArchetype");
const { scoreBigFive } = require("./scoreBigFive");
const { scoreMBTI } = require("./scoreMBTI");

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, optionId?: string, sliderValue?: number}>} answers
 * @returns {{ resultId: string, scores: Object, normalized: Object }}
 */
function scoreGeneric(quiz, answers) {
  if (quiz.scoring && quiz.scoring.type === "two-phase-archetype") {
    return scoreTwoPhaseArchetype(quiz, answers);
  }

  if (quiz.scoring && quiz.scoring.type === "big-five") {
    return scoreBigFive(quiz, answers);
  }

  if (quiz.scoring && quiz.scoring.type === "mbti") {
    return scoreMBTI(quiz, answers);
  }

  const dimensions = quiz.scoring.dimensions || [];

  // 1. Accumulate raw scores
  const raw = {};
  dimensions.forEach((d) => (raw[d] = 0));

  answers.forEach(({ questionId, optionId, sliderValue }) => {
    const question = (quiz.questions || []).find((q) => q.id === questionId);
    if (!question) return;
    const qType = question.type || question.interaction;

    // Likert slider question:
    // value 0..100 -> factor 0..1, multiplied by sliderScores baseline weights.
    if (qType === "likert-slider" || qType === "slider-likert" || qType === "slider") {
      if (typeof sliderValue !== "number") return;
      const clamped = Math.max(0, Math.min(100, sliderValue));
      const factor = clamped / 100;
      const sliderScores = question.sliderScores || question.scores || {};
      Object.entries(sliderScores).forEach(([dim, base]) => {
        if (raw[dim] !== undefined) raw[dim] += base * factor;
      });
      return;
    }

    // Default single-choice / binary question
    const option = (question.options || []).find((o) => o.id === optionId);
    if (!option || !option.scores) return;
    Object.entries(option.scores).forEach(([dim, val]) => {
      if (raw[dim] !== undefined) raw[dim] += val;
    });
  });

  // 2. Normalize
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const normalized = {};
  dimensions.forEach((d) => (normalized[d] = raw[d] / total));

  // 3. Match result
  // 3. Score and rank all results
  const ranked = (quiz.results || [])
    .map((result) => {
      const profile = result.dimension_profile || {};
      const score = Object.entries(profile).reduce((acc, [dim, weight]) => {
        return acc + (normalized[dim] || 0) * weight;
      }, 0);
      return { resultId: result.id, title: result.title, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestResult = ranked[0] || null;
  const resultId = bestResult ? bestResult.resultId : (quiz.results[0] || {}).id;
  return { resultId, raw, normalized, ranked };
}

module.exports = { scoreGeneric };
