/**
 * scoreTemple — 寺庙缘分测试评分引擎
 *
 * 算法：
 * 1. 遍历所有已回答题目，按选项 scores 对象累加各寺院原始积分
 * 2. 对 T05（五行缺口题）的得分乘以 q5WeightMultiplier（1.5）
 * 3. 计算每座寺院的「理论最高分」（各题最优选项的最大值），用于归一化
 * 4. 归一化得分 = 原始得分 / 理论最高分
 * 5. 按归一化得分降序排列
 * 6. 主结果 = 最高分寺院
 * 7. 若次高分 ≥ 主最高分 × 0.75，输出「副缘寺院」
 * 8. 总原始分 < 15 → 低置信度，兜底推荐白马寺
 */
function scoreTemple(data, allAnswers) {
  const regions = data.scoring.regions;
  const q5Multiplier = data.scoring.q5WeightMultiplier || 1.5;

  const rawScores = {};
  const maxPossible = {};
  regions.forEach((r) => { rawScores[r] = 0; maxPossible[r] = 0; });

  data.questions.forEach((q) => {
    const isQ5 = q.id === "T05";
    const multiplier = isQ5 ? q5Multiplier : 1;

    // Compute per-question max for each temple (normalization denominator)
    const qMax = {};
    (q.options || []).forEach((opt) => {
      Object.entries(opt.scores || {}).forEach(([temple, pts]) => {
        if (regions.includes(temple)) {
          qMax[temple] = Math.max(qMax[temple] || 0, pts);
        }
      });
    });
    Object.entries(qMax).forEach(([temple, max]) => {
      maxPossible[temple] += max * multiplier;
    });

    // Accumulate chosen answer
    const answerId = allAnswers[q.id];
    if (!answerId) return;
    const opt = (q.options || []).find((o) => o.id === answerId);
    if (!opt) return;
    Object.entries(opt.scores || {}).forEach(([temple, pts]) => {
      if (rawScores[temple] !== undefined) {
        rawScores[temple] += pts * multiplier;
      }
    });
  });

  // Normalize
  const normalizedScores = {};
  regions.forEach((r) => {
    normalizedScores[r] = maxPossible[r] > 0
      ? parseFloat((rawScores[r] / maxPossible[r]).toFixed(4))
      : 0;
  });

  // Rank
  const ranked = regions
    .map((id) => ({ id, score: normalizedScores[id], raw: rawScores[id] }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0] || { id: "baima", score: 0, raw: 0 };
  const second = ranked[1] || { id: "baima", score: 0, raw: 0 };

  // Total raw score for confidence check
  const totalRaw = Object.values(rawScores).reduce((s, v) => s + v, 0);
  const isLowConfidence = totalRaw < 15;

  // Secondary temple (副缘)
  const subTempleId =
    !isLowConfidence && top.score > 0 && second.score / top.score >= 0.75
      ? second.id
      : null;

  return {
    resultId:    isLowConfidence ? "baima" : top.id,
    subTempleId: isLowConfidence ? null : subTempleId,
    isLowConfidence,
    confidence:  Math.round((top.score || 0) * 100),
    ranked,
    breakdown:   rawScores,
  };
}

module.exports = { scoreTemple };
