/**
 * scoreDialect — 方言词汇溯源评分引擎
 *
 * 算法：
 * 1. 遍历所有已回答题目，按选项的 scores 对象累加各方言区积分
 * 2. 按总积分降序排列所有方言区
 * 3. 主方言区 = 积分最高区
 * 4. 若次高区积分 ≥ 主高区 × 0.60，标记为 subRegionId（边界/过渡带提示）
 * 5. 置信度 = 主区积分 / 总积分（0~1），低于 0.25 视为散乱无法定位
 */
function scoreDialect(data, allAnswers) {
  const regions = data.scoring.regions;
  const totals = {};
  regions.forEach((r) => { totals[r] = 0; });

  data.questions.forEach((q) => {
    const answerId = allAnswers[q.id];
    if (!answerId) return;
    const opt = q.options.find((o) => o.id === answerId);
    if (!opt || !opt.scores) return;
    Object.entries(opt.scores).forEach(([region, points]) => {
      if (totals[region] !== undefined) totals[region] += points;
    });
  });

  const ranked = Object.entries(totals)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  const total = ranked.reduce((sum, r) => sum + r.score, 0);
  const top = ranked[0];
  const second = ranked[1];

  const confidence = total > 0 ? Math.round((top.score / total) * 100) : 0;
  const subRegionId =
    second && top.score > 0 && second.score >= top.score * 0.60
      ? second.id
      : null;

  // Collect matched words (options with non-zero scores for the top region)
  const matchedWords = [];
  data.questions.forEach((q) => {
    const answerId = allAnswers[q.id];
    if (!answerId) return;
    const opt = q.options.find((o) => o.id === answerId);
    if (!opt || !opt.scores || !opt.scores[top.id]) return;
    if (opt.scores[top.id] >= 3) {
      matchedWords.push(opt.label);
    }
  });

  return {
    resultId:    top.id,
    subRegionId,
    confidence,
    ranked,
    breakdown:   totals,
    matchedWords,
  };
}

module.exports = { scoreDialect };
