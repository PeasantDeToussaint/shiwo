/**
 * scoreMBTI.js
 * Scoring engine for MBTI-style 4-letter personality type tests.
 *
 * Quiz schema expected:
 *   scoring.type === "mbti"
 *   scoring.scale: number              — Likert scale max (default 5)
 *   scoring.dimensions: [{
 *     id: string,                      — "E" | "S" | "T" | "J"
 *     label: string,                   — Chinese label shown in UI
 *     reverseItems: string[]           — question ids that are reverse-scored
 *   }]
 *   questions[].dimension: string      — which bipolar axis this question measures
 *   questions[].interaction: "slider"  — slider UI (0-100 maps to Likert 1-scale)
 *
 * Algorithm:
 *   1. Map slider value 0-100 → Likert 1-scale per question
 *   2. Reverse-score flagged items: reversed = (scale + 1) - raw
 *   3. Average scores per dimension → normalize to 0-1
 *      normalized[E] > 0.5 means Extraversion, <= 0.5 means Introversion
 *      normalized[S] > 0.5 means Sensing,      <= 0.5 means iNtuition
 *      normalized[T] > 0.5 means Thinking,     <= 0.5 means Feeling
 *      normalized[J] > 0.5 means Judging,      <= 0.5 means Perceiving
 *   4. Derive 4-letter type code (e.g. "ENTJ")
 *   5. Match result by id === typeCode.toLowerCase()
 *
 * Ranked list is computed by measuring how well each of the 16 types
 * matches the user's normalized scores — useful for display in generic-result.
 *
 * Output shape is identical to scoreBigFive — { resultId, normalized, ranked }
 */

/**
 * @param {Object} quiz
 * @param {Array<{questionId: string, sliderValue?: number}>} answers
 * @returns {{ resultId: string, normalized: Object, ranked: Array }}
 */
function scoreMBTI(quiz, answers) {
  const scale = (quiz.scoring || {}).scale || 5;
  const dimensions = (quiz.scoring || {}).dimensions || [];

  // Build reverse-item lookup
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

    const raw = (effectiveValue / 100) * (scale - 1) + 1;
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

  // Derive 4-letter type from threshold (0.5 midpoint of each bipolar axis)
  const letter1 = (normalized['E'] || 0) >= 0.5 ? 'E' : 'I';
  const letter2 = (normalized['S'] || 0) >= 0.5 ? 'S' : 'N';
  const letter3 = (normalized['T'] || 0) >= 0.5 ? 'T' : 'F';
  const letter4 = (normalized['J'] || 0) >= 0.5 ? 'J' : 'P';
  const typeCode = letter1 + letter2 + letter3 + letter4;

  // Rank all 16 types by how well the user's scores align with each type's poles.
  // Each dimension contributes a score 0-1: 1 = perfect match, 0 = opposite pole.
  const typePolarity = {
    E: 'E', I: 'E',
    S: 'S', N: 'S',
    T: 'T', F: 'T',
    J: 'J', P: 'J',
  };
  const ranked = (quiz.results || [])
    .map(result => {
      const code = result.id.toUpperCase();
      let matchScore = 0;
      // E/I axis
      matchScore += code.includes('E') ? (normalized['E'] || 0) : (1 - (normalized['E'] || 0));
      // S/N axis
      matchScore += code.includes('S') ? (normalized['S'] || 0) : (1 - (normalized['S'] || 0));
      // T/F axis
      matchScore += code.includes('T') ? (normalized['T'] || 0) : (1 - (normalized['T'] || 0));
      // J/P axis
      matchScore += code.includes('J') ? (normalized['J'] || 0) : (1 - (normalized['J'] || 0));
      return { resultId: result.id, title: result.title, score: matchScore / 4 };
    })
    .sort((a, b) => b.score - a.score);

  const resultId = typeCode.toLowerCase();

  return { resultId, normalized, ranked };
}

module.exports = { scoreMBTI };
