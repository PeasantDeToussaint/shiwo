/**
 * scoreBigFive.js
 * Scoring engine for Big Five Inventory (BFI-44) tests.
 *
 * Quiz schema expected:
 *   scoring.type === "big-five"
 *   scoring.scale: number          — Likert scale max (default 5)
 *   scoring.dimensions: [{
 *     id: string,                  — "O" | "C" | "E" | "A" | "N"
 *     label: string,               — Chinese label shown in UI
 *     reverseItems: string[]       — question ids that are reverse-scored
 *   }]
 *   questions[].dimension: string  — which dimension this question measures
 *   questions[].interaction: "slider" — uses existing slider UI (0-100 maps to 1-scale)
 *
 * Algorithm:
 *   1. Map slider value 0-100 → Likert 1-scale
 *   2. Reverse-score flagged items: reversed = (scale + 1) - raw
 *   3. Average scores per dimension
 *   4. Normalize each dimension average to 0-1: (avg - 1) / (scale - 1)
 *   5. Match result via dot product with result.dimension_profile (same as weighted-dimension)
 *
 * Output shape is identical to scoreGeneric — { resultId, normalized, ranked }
 * so generic-result page works without modification.
 */

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, sliderValue?: number}>} answers
 * @returns {{ resultId: string, normalized: Object, ranked: Array }}
 */
function scoreBigFive(quiz, answers) {
  const scale = (quiz.scoring || {}).scale || 5;
  const dimensions = (quiz.scoring || {}).dimensions || [];

  // Build reverse-item lookup: { questionId → true }
  const reverseMap = {};
  dimensions.forEach(({ reverseItems = [] }) => {
    reverseItems.forEach(id => (reverseMap[id] = true));
  });

  // Pool of per-dimension Likert values
  const pool = {};
  dimensions.forEach(d => (pool[d.id] = []));

  answers.forEach(({ questionId, sliderValue, optionId }) => {
    const q = (quiz.questions || []).find(q => q.id === questionId);
    if (!q) return;
    if (!q.dimension || pool[q.dimension] === undefined) return;

    // Resolve effective 0-100 value from slider OR option value field
    let effectiveValue = sliderValue;
    if (typeof effectiveValue !== 'number' && optionId) {
      const opt = (q.options || []).find(o => o.id === optionId);
      effectiveValue = (opt && typeof opt.value === 'number') ? opt.value : 50;
    }
    if (typeof effectiveValue !== 'number') return;

    // Map 0-100 → Likert 1-scale (linear)
    const raw = (effectiveValue / 100) * (scale - 1) + 1;

    // Reverse if flagged
    const val = reverseMap[questionId] ? (scale + 1 - raw) : raw;

    pool[q.dimension].push(val);
  });

  // Average per dimension → normalize to 0-1
  const normalized = {};
  dimensions.forEach(({ id }) => {
    const vals = pool[id];
    const avg = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : (scale + 1) / 2;
    normalized[id] = Math.max(0, Math.min(1, (avg - 1) / (scale - 1)));
  });

  // Match result via dot product with each result's dimension_profile
  const ranked = (quiz.results || [])
    .map(result => {
      const profile = result.dimension_profile || {};
      const score = Object.entries(profile).reduce((acc, [dim, w]) => {
        return acc + (normalized[dim] || 0) * w;
      }, 0);
      return { resultId: result.id, title: result.title, score };
    })
    .sort((a, b) => b.score - a.score);

  const resultId = ranked[0]
    ? ranked[0].resultId
    : ((quiz.results || [])[0] || {}).id;

  return { resultId, normalized, ranked };
}

module.exports = { scoreBigFive };
