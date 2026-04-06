/**
 * Shared level-band math: per-option weight, per-quiz min/max totals, band building.
 * Used by scoreLevelBand.js and (from Node) quiz-generator assemble.
 */

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Tier weight for one option: explicit bandPoints wins; else sum of non-negative scores.
 */
function optionLevelWeight(option) {
  if (!option) return 0;
  if (typeof option.bandPoints === "number" && Number.isFinite(option.bandPoints)) {
    return Math.max(0, option.bandPoints);
  }
  let t = 0;
  for (const v of Object.values(option.scores || {})) {
    t += Math.max(0, Number(v) || 0);
  }
  return t;
}

function sliderQuestionMaxWeight(question) {
  const sliderScores = question.sliderScores || question.scores || {};
  let s = 0;
  for (const v of Object.values(sliderScores)) {
    s += Math.max(0, Number(v) || 0);
  }
  return s;
}

/**
 * Per multiple-choice (or slider) question: min and max achievable level weight.
 */
function questionLevelMinMax(question, dimensions) {
  const qType = question.type || question.interaction;
  if (qType === "likert-slider" || qType === "slider-likert" || qType === "slider") {
    const maxW = sliderQuestionMaxWeight(question);
    return { min: 0, max: maxW };
  }

  const opts = question.options || [];
  if (opts.length === 0) return { min: 0, max: 0 };

  let qMin = Infinity;
  let qMax = -Infinity;
  for (const o of opts) {
    const w = optionLevelWeight(o);
    qMin = Math.min(qMin, w);
    qMax = Math.max(qMax, w);
  }
  if (!Number.isFinite(qMin)) qMin = 0;
  if (!Number.isFinite(qMax)) qMax = 0;
  return { min: qMin, max: qMax };
}

/**
 * Sum per-question maxima for dimension bars (unchanged semantics) + level totals.
 */
function getQuestionMaxima(quiz, dimensions) {
  const maxPerDim = {};
  dimensions.forEach((dim) => {
    maxPerDim[dim] = 0;
  });
  let maxTotal = 0;

  (quiz.questions || []).forEach((question) => {
    const qType = question.type || question.interaction;
    if (qType === "likert-slider" || qType === "slider-likert" || qType === "slider") {
      const sliderScores = question.sliderScores || question.scores || {};
      let sliderTotal = 0;
      Object.entries(sliderScores).forEach(([dim, base]) => {
        const safe = Math.max(0, base || 0);
        if (maxPerDim[dim] !== undefined) maxPerDim[dim] += safe;
        sliderTotal += safe;
      });
      maxTotal += sliderTotal;
      return;
    }

    let questionMaxTotal = 0;
    const questionMaxPerDim = {};
    dimensions.forEach((dim) => {
      questionMaxPerDim[dim] = 0;
    });

    (question.options || []).forEach((option) => {
      let optionTotal = 0;
      Object.entries(option.scores || {}).forEach(([dim, val]) => {
        const safe = Math.max(0, val || 0);
        if (questionMaxPerDim[dim] !== undefined) {
          questionMaxPerDim[dim] = Math.max(questionMaxPerDim[dim], safe);
        }
        optionTotal += safe;
      });
      questionMaxTotal = Math.max(questionMaxTotal, optionTotal);
    });

    dimensions.forEach((dim) => {
      maxPerDim[dim] += questionMaxPerDim[dim];
    });
    maxTotal += questionMaxTotal;
  });

  return { maxPerDim, maxTotal };
}

function computeLevelMinMaxTotals(quiz, dimensions) {
  let minTotal = 0;
  let maxTotal = 0;
  (quiz.questions || []).forEach((q) => {
    const { min, max } = questionLevelMinMax(q, dimensions);
    minTotal += min;
    maxTotal += max;
  });
  return { minTotal, maxTotal };
}

/**
 * Equal partitions of [0, 1] for normalized tier t (same as legacy defaultBandsFromResults).
 */
function buildEqualTBands(resultsInOrder) {
  const count = Math.max(1, resultsInOrder.length);
  return resultsInOrder.map((r, idx) => {
    const min = parseFloat((idx / count).toFixed(2));
    const max = idx === count - 1 ? 1 : parseFloat((((idx + 1) / count) - 0.01).toFixed(2));
    return {
      resultId: r.id,
      rank: idx,
      min,
      max: idx === count - 1 ? 1 : Math.max(min, max),
    };
  });
}

/**
 * True when bands target raw achieved totals (e.g. 0–66 exam), not normalized t.
 */
function bandsUseRawAchieved(bands, maxTotal) {
  if (!bands || bands.length === 0) return false;
  const last = bands[bands.length - 1];
  const lastMax = last && typeof last.max === "number" ? last.max : 0;
  if (lastMax <= 1) return false;
  return maxTotal > 1 && Math.abs(lastMax - maxTotal) < 0.02;
}

function normalizedTFromAchieved(achievedTotal, minTotal, maxTotal) {
  if (maxTotal <= minTotal) return achievedTotal >= maxTotal ? 1 : 0;
  return clamp01((achievedTotal - minTotal) / (maxTotal - minTotal));
}

module.exports = {
  optionLevelWeight,
  questionLevelMinMax,
  computeLevelMinMaxTotals,
  getQuestionMaxima,
  buildEqualTBands,
  bandsUseRawAchieved,
  normalizedTFromAchieved,
  clamp01,
};
