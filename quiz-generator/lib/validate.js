// Validation functions extracted from generate-quiz.js
const {
  normalizePortraitText, looksLikeQuoteContent,
  normalizeResultExtras, findObviousTextCorruption,
  normalizeStrengthsWeaknesses,
} = require('./assemble');

const STANDARD_FIELD_KEYS = new Set([
  'portrait', 'strengths', 'weaknesses', 'temperament',
  'situation', 'lifeAdvice', 'destiny',
]);

const SCORING_FAMILIES = new Set([
  'weighted-dimension',
  'bipolar-dimension',
  'level-band',
]);

function normalizeResultName(name) {
  return String(name || '')
    .replace(/["']/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function nameSimilarity(a, b) {
  const x = normalizeResultName(a);
  const y = normalizeResultName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.95;
  const overlap = [...new Set([...x].filter(ch => y.includes(ch)))].length;
  return overlap / Math.max(x.length, y.length);
}

function validateArchitecture(architecture) {
  const errors = [];
  const scoringFamily = architecture?.scoringFamily;
  const resultType = architecture?.resultType || "archetype";
  const dimensionCount = architecture?.dimensionCount;
  const dimensions = Array.isArray(architecture?.dimensions) ? architecture.dimensions : [];
  const dimensionSpecs = Array.isArray(architecture?.dimensionSpecs) ? architecture.dimensionSpecs : [];
  const results = Array.isArray(architecture?.results) ? architecture.results : [];

  if (!SCORING_FAMILIES.has(scoringFamily)) {
    errors.push(`scoringFamily must be one of ${Array.from(SCORING_FAMILIES).join(", ")} (got ${JSON.stringify(scoringFamily)})`);
  }

  // Require at least 2 custom (non-standard) result fields
  const resultFields = Array.isArray(architecture?.resultFields) ? architecture.resultFields : [];
  const customFields = resultFields.filter(f => f?.standard === false);
  if (customFields.length < 2) {
    errors.push(`resultFields must include at least 2 custom fields (standard: false), got ${customFields.length} — add a second custom field like characterQuote, historicalNote, coreConflict, etc.`);
  }

  if (!Number.isInteger(dimensionCount)) {
    errors.push(`dimensionCount must be an integer (got ${JSON.stringify(dimensionCount)})`);
  }
  if (dimensions.length === 0) {
    errors.push("dimensions missing or empty");
  }
  if (Number.isInteger(dimensionCount) && dimensions.length !== dimensionCount) {
    errors.push(`dimensions.length (${dimensions.length}) must equal dimensionCount (${dimensionCount})`);
  }
  if (dimensionSpecs.length === 0) {
    errors.push("dimensionSpecs missing or empty");
  }
  if (dimensionSpecs.length > 0 && dimensionSpecs.length !== dimensions.length) {
    errors.push(`dimensionSpecs.length (${dimensionSpecs.length}) must equal dimensions.length (${dimensions.length})`);
  }
  if (results.length === 0) {
    errors.push("results missing or empty");
  }
  if (scoringFamily === "level-band" && (results.length < 4 || results.length > 6)) {
    errors.push(`level-band results.length should be 4-6 (got ${results.length})`);
  }
  if (scoringFamily === "weighted-dimension" && (results.length < 6 || results.length > 12)) {
    errors.push(`weighted-dimension results.length should be 6-12 (got ${results.length})`);
  }
  if (scoringFamily === "bipolar-dimension" && (results.length < 4 || results.length > 12)) {
    errors.push(`bipolar-dimension results.length should be 4-12 (got ${results.length})`);
  }

  const dimSet = new Set(dimensions);
  const resultNameSet = new Set(results.map(r => r?.name).filter(Boolean));
  const resultByName = new Map(results.map(r => [normalizeResultName(r?.name), r]));
  const normalizedNames = results.map(r => normalizeResultName(r?.name)).filter(Boolean);
  const duplicateNames = normalizedNames.filter((n, i) => normalizedNames.indexOf(n) !== i);
  if (duplicateNames.length > 0) {
    errors.push(`results contain duplicate names: ${Array.from(new Set(duplicateNames)).join('、')}`);
  }
  if (resultType === "figure") {
    for (const r of results) {
      if (!String(r?.name || "").trim()) errors.push(`figure result missing name`);
      if (!String(r?.nameContext || "").trim()) errors.push(`${r?.name || r?.conceptId || "figure result"}: nameContext missing`);
    }
  }
  for (const [i, spec] of dimensionSpecs.entries()) {
    if (!spec?.dimension || spec.dimension !== dimensions[i]) {
      errors.push(`dimensionSpecs[${i}].dimension must exactly match dimensions[${i}]`);
    }
    if (!spec?.highDefinition) errors.push(`${spec?.dimension || `dimensionSpecs[${i}]`}: highDefinition missing`);
    if (!spec?.lowDefinition) errors.push(`${spec?.dimension || `dimensionSpecs[${i}]`}: lowDefinition missing`);
    if (!Array.isArray(spec?.highAnchorResults) || spec.highAnchorResults.length === 0) {
      errors.push(`${spec?.dimension || `dimensionSpecs[${i}]`}: highAnchorResults missing or empty`);
    }
    if (!Array.isArray(spec?.lowAnchorResults) || spec.lowAnchorResults.length === 0) {
      errors.push(`${spec?.dimension || `dimensionSpecs[${i}]`}: lowAnchorResults missing or empty`);
    }
    if (!Array.isArray(spec?.forbiddenInterpretations) || spec.forbiddenInterpretations.length === 0) {
      errors.push(`${spec?.dimension || `dimensionSpecs[${i}]`}: forbiddenInterpretations missing or empty`);
    }
    for (const name of (spec?.highAnchorResults || [])) {
      if (!resultNameSet.has(name)) errors.push(`${spec.dimension}: highAnchorResults contains unknown result "${name}"`);
      const anchored = resultByName.get(normalizeResultName(name));
      const hint = anchored?.profileHints?.[spec.dimension];
      if (anchored && hint && hint !== "high") {
        errors.push(`${spec.dimension}: highAnchorResult "${name}" has profileHint "${hint}" instead of "high"`);
      }
    }
    for (const name of (spec?.lowAnchorResults || [])) {
      if (!resultNameSet.has(name)) errors.push(`${spec.dimension}: lowAnchorResults contains unknown result "${name}"`);
      const anchored = resultByName.get(normalizeResultName(name));
      const hint = anchored?.profileHints?.[spec.dimension];
      if (anchored && hint && hint !== "low") {
        errors.push(`${spec.dimension}: lowAnchorResult "${name}" has profileHint "${hint}" instead of "low"`);
      }
    }
  }
  for (const r of results) {
    if (!r?.primaryDimension || !dimSet.has(r.primaryDimension)) {
      errors.push(`${r?.conceptId || r?.name || "result"}: primaryDimension must be one of dimensions`);
    }
    if (r?.profileHints) {
      const keys = Object.keys(r.profileHints);
      for (const d of dimensions) {
        if (!keys.includes(d)) errors.push(`${r?.conceptId || r?.name || "result"}: profileHints missing "${d}"`);
      }
      for (const k of keys) {
        if (!dimSet.has(k)) errors.push(`${r?.conceptId || r?.name || "result"}: profileHints has unknown dimension "${k}"`);
      }
      if (r?.primaryDimension && r.profileHints[r.primaryDimension] !== "high") {
        errors.push(`${r?.conceptId || r?.name || "result"}: primaryDimension "${r.primaryDimension}" must be "high" in profileHints`);
      }
    }
  }
  // Every dimension must be claimed as primaryDimension by at least one result.
  // An unclaimed dimension can never be the peak for any result → it's a dead dimension
  // that wastes question real estate without driving any result separation.
  const primaryDimUsed = new Set(results.map(r => r?.primaryDimension).filter(Boolean));
  for (const dim of dimensions) {
    if (!primaryDimUsed.has(dim)) {
      errors.push(`dimension "${dim}" has no result with it as primaryDimension — every dimension must anchor at least one result`);
    }
  }
  return errors;
}

function validateOutlineStructure(outline, architecture) {
  const errors = [];
  const dimensions = Array.isArray(outline?.dimensions) ? outline.dimensions : [];
  const axes = Array.isArray(outline?.dimensionAxes) ? outline.dimensionAxes : [];
  const results = Array.isArray(outline?.results) ? outline.results : [];
  const dimSet = new Set(dimensions);
  const title = String(outline?.title || "").trim();
  const subtitle = String(outline?.subtitle || "").trim();
  const eyebrow = String(outline?.eyebrow || "").trim();
  const resultType = architecture?.resultType || "archetype";

  if (dimensions.length === 0) errors.push("outline.dimensions missing or empty");
  if (!title) errors.push("outline.title missing or empty");
  if (!subtitle) errors.push("outline.subtitle missing or empty");
  if (!eyebrow) errors.push("outline.eyebrow missing or empty");
  if (axes.length !== dimensions.length) {
    errors.push(`dimensionAxes.length (${axes.length}) must equal dimensions.length (${dimensions.length})`);
  }

  // Generic title patterns: formulaic endings that add no creative value
  if (title && /(角色匹配|人物匹配|角色测试|人物测试|角色相似度|人物相似度|分身|镜像|人格镜像|角色镜像|人物镜像|哪个角色|哪位角色|人物测|角色测)/.test(title)) {
    errors.push(`outline.title too generic: "${title}"`);
  }
  if (subtitle && /(找到你的剧中分身|看看你像谁|测出你的角色|寻找你的剧中化身|测测你是谁|你是哪个|真实分身|剧中分身|角色分身|人格分身|分身)/.test(subtitle)) {
    errors.push(`outline.subtitle too generic: "${subtitle}"`);
  }
  if (eyebrow && /(角色测试|角色原型测试|权谋中的你|江湖知己|人物测试|剧中分身)/.test(eyebrow)) {
    errors.push(`outline.eyebrow too generic: "${eyebrow}"`);
  }
  for (const axis of axes) {
    if (!dimSet.has(axis.dimension)) {
      errors.push(`dimensionAxes has unknown dimension "${axis.dimension}"`);
    }
  }
  for (const r of results) {
    if (!r?.dimension || !dimSet.has(r.dimension)) {
      errors.push(`${r?.id || r?.title || "result"}: dimension must be one of outline.dimensions`);
    }
    // dimension_profile is added in a separate phase — skip profile checks here
    if (r?.dimension_profile) {
      const keys = Object.keys(r.dimension_profile);
      for (const d of dimensions) {
        if (!keys.includes(d)) errors.push(`${r?.id || r?.title || "result"}: dimension_profile missing "${d}"`);
      }
      for (const k of keys) {
        if (!dimSet.has(k)) errors.push(`${r?.id || r?.title || "result"}: dimension_profile has unknown dimension "${k}"`);
      }
      // r.dimension (used for routing) must match the profile's peak dimension
      if (r?.dimension && dimSet.has(r.dimension)) {
        const peakDim = keys.reduce((best, k) =>
          (r.dimension_profile[k] > (r.dimension_profile[best] ?? -Infinity)) ? k : best, keys[0]);
        if (peakDim && peakDim !== r.dimension) {
          errors.push(`${r?.id || r?.title || "result"}: dimension="${r.dimension}" but profile peak is "${peakDim}" (${r.dimension_profile[peakDim]}) — routing will be wrong`);
        }
      }
    }
  }

  const normalizedOutlineTitles = results.map(r => normalizeResultName(r?.title)).filter(Boolean);
  const duplicateOutlineTitles = normalizedOutlineTitles.filter((n, i) => normalizedOutlineTitles.indexOf(n) !== i);
  if (duplicateOutlineTitles.length > 0) {
    errors.push(`outline results contain duplicate titles: ${Array.from(new Set(duplicateOutlineTitles)).join("、")}`);
  }

  if (architecture?.dimensions?.length) {
    const archDims = architecture.dimensions;
    if (archDims.length !== dimensions.length || archDims.some((d, i) => d !== dimensions[i])) {
      errors.push(`outline dimensions must exactly match Phase 0 dimensions: ${archDims.join(" / ")}`);
    }
  }

  // Enforce that outline uses the same cast as Phase 0.
  // The outline is allowed to shorten names (e.g. "霓凰郡主" → "霓凰") but must not
  // silently swap in characters that weren't in the architecture at all.
  if (architecture?.results?.length && results.length > 0) {
    const archNames = architecture.results.map(r => String(r?.name || "")).filter(Boolean);
    const outlineTitles = results.map(r => String(r?.title || "")).filter(Boolean);
    const matchThreshold = resultType === "figure" ? 0.75 : 0.6;
    const unmatched = outlineTitles.filter(title => {
      return !archNames.some(archName => nameSimilarity(archName, title) >= matchThreshold);
    });
    if (unmatched.length > 0) {
      errors.push(
        `outline cast deviates from Phase 0 architecture — unrecognized result title(s): ${unmatched.join("、")}. ` +
        `Phase 0 cast: ${archNames.join("、")}`
      );
    }
    if (outlineTitles.length !== archNames.length) {
      errors.push(
        `outline result count (${outlineTitles.length}) must match Phase 0 result count (${archNames.length})`
      );
    }
  }

  for (const issue of collectProfileSimilarityIssues(
    results.map(r => ({ id: r.id, dimension_profile: r.dimension_profile })),
    dimensions
  )) {
    errors.push(`${issue.pair}: profiles too similar (max diff ${issue.maxDiff.toFixed(2)})`);
  }

  return errors;
}

function collectProfileSimilarityIssues(results, dimensions) {
  const issues = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i].dimension_profile, b = results[j].dimension_profile;
      if (!a || !b) continue;
      const maxDiff = Math.max(...dimensions.map(d => Math.abs((a[d] || 0) - (b[d] || 0))));
      if (maxDiff < 0.15) {
        issues.push({
          pair: `${results[i].id} ↔ ${results[j].id}`,
          maxDiff,
          severe: maxDiff < 0.12,
        });
      }
    }
  }
  return issues;
}

/**
 * Detect Pareto-dominated results: a result that is beaten by some other result
 * on every single dimension. Such results are permanently unreachable — no user
 * score distribution will ever produce them as the winner under cosine similarity
 * or dot-product scoring.
 */
function collectDominanceIssues(results, dimensions) {
  const issues = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < results.length; j++) {
      if (i === j) continue;
      const a = results[i].dimension_profile;
      const b = results[j].dimension_profile;
      if (!a || !b) continue;
      const bDominatesA =
        dimensions.every(d => (b[d] || 0) >= (a[d] || 0)) &&
        dimensions.some(d =>  (b[d] || 0) >  (a[d] || 0));
      if (bDominatesA) {
        issues.push(`${results[i].id} is unreachable — dominated by ${results[j].id} on all dimensions`);
      }
    }
  }
  return issues;
}

function validateFinalQuiz(quiz) {
  const errors = [];
  const warnings = [];
  const scoringType = quiz?.scoring?.type || "weighted-dimension";

  for (const d of (quiz?.scoring?.dimensions || [])) {
    if (!d) errors.push("empty dimension label");
    if (/(更多维度按需补足|更多维度按已确定)/.test(d)) errors.push(`invalid dimension label "${d}"`);
  }

  for (const q of (quiz.questions || [])) {
    if (findObviousTextCorruption(q.text)) errors.push(`${q.id}: corrupted question text`);
    for (const o of (q.options || [])) {
      const textIssue = findObviousTextCorruption(o.text);
      if (textIssue) errors.push(`${q.id}.${o.id}: corrupted option text (${textIssue})`);
    }
  }

  for (const r of (quiz.results || [])) {
    const portrait = normalizePortraitText(r.portrait);
    if (portrait && !portrait.includes("\n\n") && portrait.length > 180) {
      errors.push(`${r.id}: portrait still has no paragraph breaks`);
    }
    for (const field of ["title", "subtitle", "token", "verse", "verseSource", "temperament", "lifeAdvice", "destiny"]) {
      const issue = findObviousTextCorruption(r[field]);
      if (issue) errors.push(`${r.id}.${field}: corrupted text (${issue})`);
    }
    for (const listKey of ["strengths", "weaknesses"]) {
      for (const [i, item] of (r[listKey] || []).entries()) {
        const labelIssue = findObviousTextCorruption(item?.label);
        if (labelIssue) errors.push(`${r.id}.${listKey}[${i}].label: corrupted text (${labelIssue})`);
        const descIssue = findObviousTextCorruption(item?.description);
        if (descIssue) errors.push(`${r.id}.${listKey}[${i}].description: corrupted text (${descIssue})`);
      }
    }
    for (const [i, extra] of (r.extras || []).entries()) {
      const labelIssue = findObviousTextCorruption(extra?.label);
      if (labelIssue) errors.push(`${r.id}.extras[${i}].label: corrupted text (${labelIssue})`);
      const contentIssue = findObviousTextCorruption(extra?.content);
      if (contentIssue) errors.push(`${r.id}.extras[${i}].content: corrupted text (${contentIssue})`);
      if (extra?.key === "keyQuote" && /代表名言/.test(extra?.label || "") && !looksLikeQuoteContent(extra?.content)) {
        errors.push(`${r.id}.extras[${i}]: label is 代表名言 but content does not look like a quote`);
      }
    }
  }

  if (scoringType !== "level-band") {
    const profileIssues = collectProfileSimilarityIssues(quiz.results || [], quiz?.scoring?.dimensions || []);
    for (const issue of profileIssues) {
      const msg = `${issue.pair}: profiles too similar (max diff ${issue.maxDiff.toFixed(2)})`;
      if (issue.severe) errors.push(msg);
      else warnings.push(msg);
    }

    for (const issue of collectDominanceIssues(quiz.results || [], quiz?.scoring?.dimensions || [])) {
      errors.push(issue);
    }
  }

  return { errors, warnings };
}

function validateQuestions(questions, dimensions, options = {}) {
  const warnings = [];
  const dimSet = new Set(dimensions);
  const seenIds = new Set();
  const scoringType = options.scoringType || "weighted-dimension";
  const minScore = scoringType === "bipolar-dimension" ? -2 : 0;
  const maxScore = 3;

  for (const q of questions) {
    if (seenIds.has(q.id)) warnings.push(`Duplicate question id: ${q.id}`);
    seenIds.add(q.id);

    if (!q.text) warnings.push(`${q.id}: missing text`);
    if (!q.options || q.options.length < 3) {
      warnings.push(`${q.id}: only ${q.options?.length ?? 0} options (need ≥3)`);
    }

    for (const o of (q.options || [])) {
      if (!o.scores || Object.keys(o.scores).length === 0) {
        warnings.push(`${q.id}.${o.id}: no scores`);
        continue;
      }
      for (const [dim, val] of Object.entries(o.scores)) {
        // Allow abbreviated dimension names (e.g. "传统" matching "传统与现代")
        const matched = dimSet.has(dim) || dimensions.some(d => d.startsWith(dim) || dim.startsWith(d.slice(0, 2)));
        if (!matched) warnings.push(`${q.id}.${o.id}: unknown dimension "${dim}" (valid: ${dimensions.join(", ")})`);
        if (typeof val !== "number" || val < minScore || val > maxScore) {
          warnings.push(`${q.id}.${o.id}: score ${val} out of range [${minScore},${maxScore}] for "${dim}"`);
        }
      }
    }
  }

  return warnings;
}

function validateResults(results, dimensions, resultFields) {
  const warnings = [];
  const standardKeys = STANDARD_FIELD_KEYS;
  const requiredKeys = (resultFields || [])
    .filter(f => standardKeys.has(f.key))
    .map(f => f.key);
  if (requiredKeys.length === 0) requiredKeys.push("portrait", "strengths", "weaknesses");

  for (const r of results) {
    for (const field of requiredKeys) {
      if (!r[field]) warnings.push(`${r.id}: missing "${field}"`);
    }
    if (requiredKeys.includes("strengths") && (r.strengths || []).length < 3)
      warnings.push(`${r.id}: only ${r.strengths?.length ?? 0} strengths (want 3)`);
    if (requiredKeys.includes("weaknesses") && (r.weaknesses || []).length < 3)
      warnings.push(`${r.id}: only ${r.weaknesses?.length ?? 0} weaknesses (want 3)`);
  }

  return warnings;
}

function validateDimensionProfiles(results, dimensions, options = {}) {
  const warnings = [];
  const dimSet = new Set(dimensions);
  const scoringType = options.scoringType || "weighted-dimension";
  const primaryDimensions = options.primaryDimensions || null;

  for (const r of results) {
    const profile = r.dimension_profile;
    if (!profile) { warnings.push(`${r.id}: missing dimension_profile`); continue; }

    const profileKeys = new Set(Object.keys(profile));
    for (const d of dimensions) {
      if (!profileKeys.has(d)) warnings.push(`${r.id}: profile missing dimension "${d}"`);
    }
    for (const [k, v] of Object.entries(profile)) {
      if (!dimSet.has(k)) warnings.push(`${r.id}: profile has unknown dimension "${k}"`);
      if (v <= 0 || v >= 1) warnings.push(`${r.id}: profile "${k}" = ${v} (should be in (0,1))`);
    }
  }

  if (scoringType !== "level-band") {
    for (const issue of collectProfileSimilarityIssues(results, dimensions)) {
      warnings.push(`${issue.pair}: profiles too similar (max diff ${issue.maxDiff.toFixed(2)}), users may cluster`);
    }

    for (const issue of collectDominanceIssues(results, dimensions)) {
      warnings.push(issue);
    }
  }

  if (primaryDimensions) {
    for (const r of results) {
      const profile = r.dimension_profile || {};
      const expected = primaryDimensions[r.id];
      if (!expected || !profile || typeof profile !== "object") continue;
      const keys = Object.keys(profile).filter(k => dimSet.has(k));
      if (keys.length === 0) continue;
      const peak = keys.reduce((best, k) => ((profile[k] ?? -Infinity) > (profile[best] ?? -Infinity) ? k : best), keys[0]);
      if (peak !== expected) {
        warnings.push(`${r.id}: primary dimension expected "${expected}" but profile peak is "${peak}"`);
      }
    }
  }

  return warnings;
}

function validateQuestionPlan(plan, dimensions, total) {
  const errors = [];

  if (!Array.isArray(plan) || plan.length < total)
    return [`plan has ${plan?.length ?? 0} items, expected ${total}`];

  // Dimension coverage
  const dimSet = new Set(dimensions);
  const dimCounts = {};
  for (const d of dimensions) dimCounts[d] = 0;
  for (const p of plan) {
    if (!dimSet.has(p.dimension))
      errors.push(`${p.id}: dimension "${p.dimension}" not in quiz dimensions`);
    else
      dimCounts[p.dimension]++;
  }
  const dimValues = Object.values(dimCounts);
  const maxDim = Math.max(...dimValues), minDim = Math.min(...dimValues);
  if (maxDim - minDim > Math.ceil(total / dimensions.length))
    errors.push(`dimension distribution too uneven: max ${maxDim}, min ${minDim} — ${JSON.stringify(dimCounts)}`);

  for (const p of plan) {
    if (!String(p?.angle || "").trim()) errors.push(`${p?.id || "plan item"}: missing angle`);
    if (String(p?.angle || "").trim().length < 4) errors.push(`${p?.id || "plan item"}: angle too short`);
    if (p?.contrast && String(p.contrast).trim().length < 2) errors.push(`${p?.id || "plan item"}: contrast too short`);
  }

  return errors;
}

/**
 * Check that every dimension gets a roughly proportional share of scoring
 * opportunities across all options. A dimension starved of signals can't
 * drive result differentiation even if its profiles are well-spread.
 */
function validateScoreMap(questions, dimensions) {
  const warnings = [];
  const dimScore = {};
  for (const d of dimensions) dimScore[d] = 0;

  for (const q of (questions || [])) {
    for (const o of (q.options || [])) {
      for (const [dim, val] of Object.entries(o.scores || {})) {
        if (dimScore[dim] !== undefined && typeof val === "number" && val > 0) {
          dimScore[dim]++;
        }
      }
    }
  }

  const total = Object.values(dimScore).reduce((a, b) => a + b, 0);
  if (total === 0) return warnings;
  const expected = total / dimensions.length;

  for (const [dim, count] of Object.entries(dimScore)) {
    if (count < expected * 0.4) {
      warnings.push(
        `dimension "${dim}" has only ${count} scoring opportunities (expected ~${Math.round(expected)}) — severely underrepresented`
      );
    }
  }
  return warnings;
}

/**
 * Validate a results plan generated by generateResultsPlan().
 * Checks label repetition across all results so the content phase
 * never repeats strengths/weaknesses labels.
 */
function validateResultsPlan(plan, results) {
  const errors = [];
  if (!Array.isArray(plan) || plan.length < results.length)
    return [`plan has ${plan?.length ?? 0} items, expected ${results.length}`];

  const allStrengthLabels = [];
  const allWeaknessLabels = [];

  for (const p of plan) {
    if (!p?.id) { errors.push("plan entry missing id"); continue; }
    if (!p.portraitAngle) errors.push(`${p.id}: missing portraitAngle`);

    if (!Array.isArray(p.strengthLabels) || p.strengthLabels.length < 3)
      errors.push(`${p.id}: strengthLabels must have 3 items (got ${p.strengthLabels?.length ?? 0})`);
    if (!Array.isArray(p.weaknessLabels) || p.weaknessLabels.length < 3)
      errors.push(`${p.id}: weaknessLabels must have 3 items (got ${p.weaknessLabels?.length ?? 0})`);

    for (const label of (p.strengthLabels || [])) allStrengthLabels.push(label);
    for (const label of (p.weaknessLabels || [])) allWeaknessLabels.push(label);
  }
  // Only error on labels that appear 4+ times — occasional overlap is unavoidable
  // in Chinese personality vocabulary, especially across 8 results × 6 labels each.
  // Repetition at 2-3 occurrences is acceptable if the rest of the plan is diverse.
  const countOccurrences = (arr) => {
    const counts = {};
    for (const v of arr) counts[v] = (counts[v] || 0) + 1;
    return counts;
  };
  for (const [label, count] of Object.entries(countOccurrences(allStrengthLabels))) {
    if (count >= 4) errors.push(`strengthLabel "${label}" appears ${count} times — too repetitive`);
  }
  for (const [label, count] of Object.entries(countOccurrences(allWeaknessLabels))) {
    if (count >= 4) errors.push(`weaknessLabel "${label}" appears ${count} times — too repetitive`);
  }

  return errors;
}

function printWarnings(label, warnings) {
  if (warnings.length === 0) {
    console.log(`  ✅  ${label}: all checks passed`);
    return;
  }
  console.warn(`  ⚠   ${label}: ${warnings.length} issue(s):`);
  for (const w of warnings) console.warn(`       • ${w}`);
}

function assertNoCriticalWarnings(label, warnings) {
  if (warnings.length === 0) return;
  throw new Error(`${label} invalid: ${warnings.join("; ")}`);
}

module.exports = {
  validateArchitecture, validateOutlineStructure,
  collectProfileSimilarityIssues, validateFinalQuiz,
  validateQuestions, validateResults, validateDimensionProfiles,
  validateQuestionPlan, validateScoreMap, validateResultsPlan,
  printWarnings, assertNoCriticalWarnings,
  STANDARD_FIELD_KEYS,
};
