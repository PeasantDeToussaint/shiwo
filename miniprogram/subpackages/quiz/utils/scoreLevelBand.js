function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function getDimensions(quiz) {
  return (quiz?.scoring?.dimensions || []).map((dim) => typeof dim === "string" ? dim : dim.id).filter(Boolean);
}

function getQuestionMaxima(quiz, dimensions) {
  const maxPerDim = {};
  dimensions.forEach((dim) => { maxPerDim[dim] = 0; });
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
    dimensions.forEach((dim) => { questionMaxPerDim[dim] = 0; });

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

    dimensions.forEach((dim) => { maxPerDim[dim] += questionMaxPerDim[dim]; });
    maxTotal += questionMaxTotal;
  });

  return { maxPerDim, maxTotal };
}

function scoreLevelBand(quiz, answers) {
  const dimensions = getDimensions(quiz);
  const raw = {};
  dimensions.forEach((dim) => { raw[dim] = 0; });
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
    if (!option || !option.scores) return;
    Object.entries(option.scores).forEach(([dim, val]) => {
      const safe = Math.max(0, val || 0);
      if (raw[dim] !== undefined) raw[dim] += safe;
      achievedTotal += safe;
    });
  });

  const { maxPerDim, maxTotal } = getQuestionMaxima(quiz, dimensions);
  const normalized = {};
  dimensions.forEach((dim) => {
    normalized[dim] = maxPerDim[dim] > 0 ? clamp01(raw[dim] / maxPerDim[dim]) : 0;
  });

  const overall = maxTotal > 0 ? clamp01(achievedTotal / maxTotal) : 0;
  const bands = (quiz?.scoring?.bands || []).slice().sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const matchedBand = bands.find((band) => overall >= (band.min || 0) && overall <= (band.max == null ? 1 : band.max))
    || bands[bands.length - 1]
    || null;

  const ranked = bands.map((band) => {
    const center = ((band.min || 0) + (band.max == null ? 1 : band.max)) / 2;
    const result = (quiz.results || []).find((item) => item.id === band.resultId);
    return {
      resultId: band.resultId,
      title: result ? result.title : band.resultId,
      score: 1 - Math.abs(overall - center),
    };
  }).sort((a, b) => b.score - a.score);

  return {
    resultId: matchedBand ? matchedBand.resultId : (quiz.results[0] || {}).id,
    raw,
    normalized,
    ranked,
    overallScore: overall,
  };
}

module.exports = { scoreLevelBand };
