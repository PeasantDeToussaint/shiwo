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
 *   3. Find result whose dimension_profile has highest cosine similarity with normalized scores
 *      (cosine similarity removes magnitude bias — results with uniformly high profiles
 *       no longer have a structural advantage over results with a single strong peak)
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

  // 3. Rank results by cosine similarity between normalized user scores and each dimension_profile.
  //    Cosine similarity = dot(user, profile) / (|user| * |profile|)
  //    This removes magnitude bias: a profile with uniformly high values no longer
  //    beats a sharply-peaked profile just because its sum is larger.
  const userMag = Math.sqrt(dimensions.reduce((s, d) => s + (normalized[d] || 0) ** 2, 0)) || 1;

  const ranked = (quiz.results || [])
    .map((result) => {
      const profile = result.dimension_profile || {};
      const dot = Object.entries(profile).reduce((acc, [dim, w]) => acc + (normalized[dim] || 0) * w, 0);
      const profileMag = Math.sqrt(Object.values(profile).reduce((s, v) => s + v * v, 0)) || 1;
      const score = dot / (profileMag * userMag);
      return { resultId: result.id, title: result.title, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestResult = ranked[0] || null;
  const resultId = bestResult ? bestResult.resultId : (quiz.results[0] || {}).id;
  return { resultId, raw, normalized, ranked };
}

module.exports = { scoreGeneric };
