/**
 * Generic quiz scoring (cloud archetype / scale quizzes).
 *
 * scoring.type === "weighted-dimension"
 *   dimensions[] + options[].scores → raw sums → normalize → cosine match vs results[].dimension_profile
 *
 * scoring.type === "archetype-argmax"  （互斥原型：谁的主维度 raw 分最高）
 *   Same raw + normalize for UI；胜者 = max raw[result.primaryDimension]，平局按 results[] 顺序。
 *   不用 dimension_profile 定输赢；profile 仍可给结果页条形/雷达作展示锚点。
 *
 * Other types: two-phase-archetype, big-five, mbti, bipolar-dimension, level-band.
 */

const { scoreTwoPhaseArchetype } = require("./scoreTwoPhaseArchetype");
const { scoreBigFive } = require("./scoreBigFive");
const { scoreMBTI } = require("./scoreMBTI");
const { scoreBipolarDimension } = require("./scoreBipolarDimension");
const { scoreLevelBand } = require("./scoreLevelBand");

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, optionId?: string, sliderValue?: number}>} answers
 * @returns {Object<string, number>}
 */
function accumulateDimensionRaw(quiz, answers) {
  const dimensions = (quiz.scoring && quiz.scoring.dimensions) || [];
  const raw = {};
  dimensions.forEach((d) => (raw[d] = 0));

  answers.forEach(({ questionId, optionId, sliderValue }) => {
    const question = (quiz.questions || []).find((q) => q.id === questionId);
    if (!question) return;
    const qType = question.type || question.interaction;

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

    const option = (question.options || []).find((o) => o.id === optionId);
    if (!option || !option.scores) return;
    Object.entries(option.scores).forEach(([dim, val]) => {
      if (raw[dim] !== undefined) raw[dim] += val;
    });
  });

  return raw;
}

function scoreArchetypeArgmax(quiz, answers) {
  const dimensions = (quiz.scoring && quiz.scoring.dimensions) || [];
  const raw = accumulateDimensionRaw(quiz, answers);
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const normalized = {};
  dimensions.forEach((d) => (normalized[d] = raw[d] / total));

  const results = quiz.results || [];
  const ranked = results
    .map((result, idx) => {
      const dim = result.primaryDimension;
      const score = dim && raw[dim] !== undefined ? raw[dim] : 0;
      return { resultId: result.id, title: result.title, score, _idx: idx };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a._idx - b._idx;
    })
    .map(({ _idx, ...rest }) => rest);

  const bestResult = ranked[0] || null;
  const resultId = bestResult ? bestResult.resultId : (results[0] || {}).id;
  return { resultId, raw, normalized, ranked };
}

function scoreWeightedDimensionCosine(quiz, answers) {
  const dimensions = (quiz.scoring && quiz.scoring.dimensions) || [];
  const raw = accumulateDimensionRaw(quiz, answers);
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const normalized = {};
  dimensions.forEach((d) => (normalized[d] = raw[d] / total));

  const results = quiz.results || [];
  const userMag = Math.sqrt(dimensions.reduce((s, d) => s + (normalized[d] || 0) ** 2, 0)) || 1;

  const ranked = results
    .map((result) => {
      const profile = result.dimension_profile || {};
      const dot = Object.entries(profile).reduce((acc, [dim, w]) => acc + (normalized[dim] || 0) * w, 0);
      const profileMag = Math.sqrt(Object.values(profile).reduce((s, v) => s + v * v, 0)) || 1;
      const score = dot / (profileMag * userMag);
      return { resultId: result.id, title: result.title, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestResult = ranked[0] || null;
  const resultId = bestResult ? bestResult.resultId : (results[0] || {}).id;
  return { resultId, raw, normalized, ranked };
}

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, optionId?: string, sliderValue?: number}>} answers
 * @returns {{ resultId: string, raw: Object, normalized: Object, ranked: Array }}
 */
function scoreGeneric(quiz, answers) {
  const type = quiz.scoring && quiz.scoring.type;

  if (type === "two-phase-archetype") {
    const hasPhase1 = (quiz.questions || []).some((q) => q.phase === 1);
    if (hasPhase1) {
      return scoreTwoPhaseArchetype(quiz, answers);
    }
    // Mis-tagged: fall through to cosine (same as weighted-dimension body).
  }

  if (type === "big-five") {
    return scoreBigFive(quiz, answers);
  }

  if (type === "mbti") {
    return scoreMBTI(quiz, answers);
  }

  if (type === "bipolar-dimension") {
    return scoreBipolarDimension(quiz, answers);
  }

  if (type === "level-band") {
    return scoreLevelBand(quiz, answers);
  }

  if (type === "archetype-argmax") {
    return scoreArchetypeArgmax(quiz, answers);
  }

  return scoreWeightedDimensionCosine(quiz, answers);
}

module.exports = { scoreGeneric };
