const {
  optionLevelWeight,
  computeLevelMinMaxTotals,
  getQuestionMaxima,
  buildEqualTBands,
  bandsUseRawAchieved,
  normalizedTFromAchieved,
  clamp01,
} = require("./levelBandMetrics");

function getDimensions(quiz) {
  return (quiz?.scoring?.dimensions || []).map((dim) => (typeof dim === "string" ? dim : dim.id)).filter(Boolean);
}

/**
 * When scoring.bands is missing (e.g. legacy upload), derive tier cutoffs on normalized t.
 */
function defaultBandsFromResults(quiz) {
  let results = (quiz.results || []).slice();
  if (results.some((r) => typeof r.levelRank === "number")) {
    results.sort((a, b) => (a.levelRank || 0) - (b.levelRank || 0));
  }
  return buildEqualTBands(results);
}

function scoreLevelBand(quiz, answers) {
  const dimensions = getDimensions(quiz);
  const raw = {};
  dimensions.forEach((dim) => {
    raw[dim] = 0;
  });
  let achievedTotal = 0;

  answers.forEach(({ questionId, optionId, sliderValue }) => {
    const question = (quiz.questions || []).find((q) => q.id === questionId);
    if (!question) return;
    const qType = question.type || question.interaction;

    if (qType === "likert-slider" || qType === "slider-likert" || qType === "slider") {
      if (typeof sliderValue !== "number") return;
      const factor = Math.max(0, Math.min(100, sliderValue)) / 100;
      const sliderScores = question.sliderScores || question.scores || {};
      Object.entries(sliderScores).forEach(([dim, base]) => {
        const safe = Math.max(0, base || 0) * factor;
        if (raw[dim] !== undefined) raw[dim] += safe;
        achievedTotal += safe;
      });
      return;
    }

    const option = (question.options || []).find((o) => o.id === optionId);
    if (!option) return;

    achievedTotal += optionLevelWeight(option);

    if (option.scores && Object.keys(option.scores).length > 0) {
      Object.entries(option.scores).forEach(([dim, val]) => {
        const safe = Math.max(0, val || 0);
        if (raw[dim] !== undefined) raw[dim] += safe;
      });
    } else if (typeof option.bandPoints === "number" && dimensions.length > 0) {
      const d0 = dimensions[0];
      raw[d0] += Math.max(0, option.bandPoints);
    }
  });

  const { maxPerDim, maxTotal: maxDimGrandTotal } = getQuestionMaxima(quiz, dimensions);
  const { minTotal, maxTotal } = computeLevelMinMaxTotals(quiz, dimensions);

  const normalized = {};
  dimensions.forEach((dim) => {
    normalized[dim] = maxPerDim[dim] > 0 ? clamp01(raw[dim] / maxPerDim[dim]) : 0;
  });

  const legacyOverall = maxDimGrandTotal > 0 ? clamp01(achievedTotal / maxDimGrandTotal) : 0;
  const t = normalizedTFromAchieved(achievedTotal, minTotal, maxTotal);

  let bands = (quiz?.scoring?.bands || []).slice();
  if (bands.length === 0 && (quiz.results || []).length > 0) {
    bands = defaultBandsFromResults(quiz);
  }
  bands.sort((a, b) => (a.rank || 0) - (b.rank || 0));

  const useRaw = bandsUseRawAchieved(bands, maxTotal);
  const metric = useRaw ? achievedTotal : t;
  const metricMax = useRaw ? maxTotal : 1;

  let matchedBand = bands.find((band) => {
    const lo = band.min || 0;
    const hi = band.max == null ? metricMax : band.max;
    return metric >= lo && metric <= hi;
  }) || null;

  if (!matchedBand && bands.length > 0) {
    matchedBand = bands.reduce((best, band) => {
      const lo = band.min || 0;
      const hi = band.max == null ? metricMax : band.max;
      const mid = (lo + hi) / 2;
      const bestLo = best.min || 0;
      const bestHi = best.max == null ? metricMax : best.max;
      const bestMid = (bestLo + bestHi) / 2;
      return Math.abs(metric - mid) < Math.abs(metric - bestMid) ? band : best;
    }, bands[0]);
  }

  const bandDistanceMetric = useRaw ? legacyOverall : t;
  const ranked = bands.map((band) => {
    const loN = useRaw ? (band.min || 0) / maxTotal : band.min || 0;
    const hiN = useRaw
      ? (band.max == null ? 1 : band.max) / maxTotal
      : (band.max == null ? 1 : band.max);
    const center = (loN + hiN) / 2;
    const result = (quiz.results || []).find((item) => item.id === band.resultId);
    return {
      resultId: band.resultId,
      title: result ? result.title : band.resultId,
      score: 1 - Math.abs(bandDistanceMetric - center),
    };
  }).sort((a, b) => b.score - a.score);

  return {
    resultId: matchedBand ? matchedBand.resultId : (quiz.results[0] || {}).id,
    raw,
    normalized,
    ranked,
    overallScore: useRaw ? legacyOverall : t,
    levelBandMeta: {
      achievedTotal,
      minTotal,
      maxTotal,
      normalizedT: t,
      legacyOverall,
      bandsMetric: useRaw ? "raw" : "normalized-t",
    },
  };
}

module.exports = { scoreLevelBand };
