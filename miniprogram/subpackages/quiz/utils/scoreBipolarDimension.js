function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function getDimensions(quiz) {
  return (quiz?.scoring?.dimensions || []).map((dim) => typeof dim === "string" ? dim : dim.id).filter(Boolean);
}

function getMaxAbsByDimension(quiz, dimensions) {
  const maxAbs = {};
  dimensions.forEach((dim) => { maxAbs[dim] = 0; });

  (quiz.questions || []).forEach((question) => {
    const qType = question.type || question.interaction;
    if (qType === "likert-slider" || qType === "slider-likert" || qType === "slider") {
      const sliderScores = question.sliderScores || question.scores || {};
      Object.entries(sliderScores).forEach(([dim, val]) => {
        if (maxAbs[dim] !== undefined) maxAbs[dim] += Math.abs(val || 0);
      });
      return;
    }

    const perQuestion = {};
    dimensions.forEach((dim) => { perQuestion[dim] = 0; });
    (question.options || []).forEach((option) => {
      Object.entries(option.scores || {}).forEach(([dim, val]) => {
        if (perQuestion[dim] !== undefined) {
          perQuestion[dim] = Math.max(perQuestion[dim], Math.abs(val || 0));
        }
      });
    });
    dimensions.forEach((dim) => { maxAbs[dim] += perQuestion[dim]; });
  });

  return maxAbs;
}

function scoreBipolarDimension(quiz, answers) {
  const dimensions = getDimensions(quiz);
  const raw = {};
  dimensions.forEach((dim) => { raw[dim] = 0; });

  answers.forEach(({ questionId, optionId, sliderValue }) => {
    const question = (quiz.questions || []).find((q) => q.id === questionId);
    if (!question) return;
    const qType = question.type || question.interaction;

    if (qType === "likert-slider" || qType === "slider-likert" || qType === "slider") {
      if (typeof sliderValue !== "number") return;
      const factor = (Math.max(0, Math.min(100, sliderValue)) - 50) / 50;
      const sliderScores = question.sliderScores || question.scores || {};
      Object.entries(sliderScores).forEach(([dim, base]) => {
        if (raw[dim] !== undefined) raw[dim] += (base || 0) * factor;
      });
      return;
    }

    const option = (question.options || []).find((o) => o.id === optionId);
    if (!option || !option.scores) return;
    Object.entries(option.scores).forEach(([dim, val]) => {
      if (raw[dim] !== undefined) raw[dim] += val;
    });
  });

  const maxAbs = getMaxAbsByDimension(quiz, dimensions);
  const normalized = {};
  dimensions.forEach((dim) => {
    const denom = maxAbs[dim] || 0;
    normalized[dim] = denom > 0 ? clamp01(0.5 + (raw[dim] / (2 * denom))) : 0.5;
  });

  const centeredUser = {};
  dimensions.forEach((dim) => { centeredUser[dim] = (normalized[dim] || 0.5) - 0.5; });
  const userMag = Math.sqrt(dimensions.reduce((sum, dim) => sum + (centeredUser[dim] || 0) ** 2, 0)) || 1;

  const ranked = (quiz.results || [])
    .map((result) => {
      const profile = result.dimension_profile || {};
      let dot = 0;
      let profileMagSquared = 0;
      dimensions.forEach((dim) => {
        const centeredProfile = (profile[dim] || 0.5) - 0.5;
        dot += (centeredUser[dim] || 0) * centeredProfile;
        profileMagSquared += centeredProfile ** 2;
      });
      const score = dot / ((Math.sqrt(profileMagSquared) || 1) * userMag);
      return { resultId: result.id, title: result.title, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestResult = ranked[0] || null;
  return {
    resultId: bestResult ? bestResult.resultId : (quiz.results[0] || {}).id,
    raw,
    normalized,
    ranked,
  };
}

module.exports = { scoreBipolarDimension };
