/**
 * Two-phase investor archetype quiz scoring.
 * Phase 1: tally A组 / B组 / C组 (first N questions with phase === 1).
 * Phase 2: tally nine archetype dimensions (questions with phase === 2, branch injected in UI).
 * Winner group from phase 1; final archetype = max raw score within that group's three dimensions (tie: fixed order).
 */

function winningBranchFromGroupRaw(groupRaw) {
  const order = [
    { key: "A组", branch: "A" },
    { key: "B组", branch: "B" },
    { key: "C组", branch: "C" },
  ];
  const pri = { A: 0, B: 1, C: 2 };
  order.sort((a, b) => {
    const d = groupRaw[b.key] - groupRaw[a.key];
    if (d !== 0) return d;
    return pri[a.branch] - pri[b.branch];
  });
  return order[0].branch;
}

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, optionId: string}>} phase1Answers
 * @returns {"A"|"B"|"C"}
 */
function computePhase1Branch(quiz, phase1Answers) {
  const groupRaw = { A组: 0, B组: 0, C组: 0 };
  const index = Object.fromEntries((quiz.questions || []).map((q) => [q.id, q]));
  phase1Answers.forEach(({ questionId, optionId }) => {
    const q = index[questionId];
    const opt = q?.options?.find((o) => o.id === optionId);
    if (!opt?.scores) return;
    Object.entries(opt.scores).forEach(([k, v]) => {
      if (groupRaw[k] !== undefined) groupRaw[k] += Number(v) || 0;
    });
  });
  return winningBranchFromGroupRaw(groupRaw);
}

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, optionId: string}>} answers
 */
function scoreTwoPhaseArchetype(quiz, answers) {
  const dims = quiz.scoring.dimensions || [];
  const groups = quiz.scoring.groups || {};
  const raw = {};
  dims.forEach((d) => (raw[d] = 0));
  const groupRaw = { A组: 0, B组: 0, C组: 0 };
  const qIndex = Object.fromEntries((quiz.questions || []).map((q) => [q.id, q]));

  answers.forEach(({ questionId, optionId }) => {
    const q = qIndex[questionId];
    const opt = q?.options?.find((o) => o.id === optionId);
    if (!q || !opt?.scores) return;
    if (q.phase === 1) {
      Object.entries(opt.scores).forEach(([k, v]) => {
        if (groupRaw[k] !== undefined) groupRaw[k] += Number(v) || 0;
      });
    } else if (q.phase === 2) {
      Object.entries(opt.scores).forEach(([k, v]) => {
        if (raw[k] !== undefined) raw[k] += Number(v) || 0;
      });
    }
  });

  const phase1Answers = answers.filter((a) => {
    const q = qIndex[a.questionId];
    return q && q.phase === 1;
  });
  const winner = computePhase1Branch(quiz, phase1Answers);

  const subKeys = groups[winner] || groups.A || [];
  const sortedKeys = [...subKeys].sort((a, b) => {
    const va = raw[a] || 0;
    const vb = raw[b] || 0;
    if (vb !== va) return vb - va;
    return subKeys.indexOf(a) - subKeys.indexOf(b);
  });
  const bestKey = sortedKeys[0] || dims[0];

  const results = quiz.results || [];
  const primary = results.find((r) => r.primaryDimension === bestKey) || results[0];

  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const normalized = {};
  dims.forEach((d) => (normalized[d] = raw[d] / total));

  const ranked = results
    .map((r) => ({
      resultId: r.id,
      title: r.title,
      score: raw[r.primaryDimension] || 0,
    }))
    .sort((a, b) => b.score - a.score);

  return { resultId: primary.id, raw, normalized, ranked, phase1Group: winner };
}

module.exports = { computePhase1Branch, scoreTwoPhaseArchetype, winningBranchFromGroupRaw };
