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

function validateArchitecture(architecture) {
  const errors = [];
  const dimensionCount = architecture?.dimensionCount;
  const dimensions = Array.isArray(architecture?.dimensions) ? architecture.dimensions : [];
  const results = Array.isArray(architecture?.results) ? architecture.results : [];

  if (!Number.isInteger(dimensionCount)) {
    errors.push(`dimensionCount must be an integer (got ${JSON.stringify(dimensionCount)})`);
  }
  if (dimensions.length === 0) {
    errors.push("dimensions missing or empty");
  }
  if (Number.isInteger(dimensionCount) && dimensions.length !== dimensionCount) {
    errors.push(`dimensions.length (${dimensions.length}) must equal dimensionCount (${dimensionCount})`);
  }
  if (results.length === 0) {
    errors.push("results missing or empty");
  }

  const dimSet = new Set(dimensions);
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

  if (dimensions.length === 0) errors.push("outline.dimensions missing or empty");
  if (axes.length !== dimensions.length) {
    errors.push(`dimensionAxes.length (${axes.length}) must equal dimensions.length (${dimensions.length})`);
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
    if (!r?.dimension_profile) {
      errors.push(`${r?.id || r?.title || "result"}: missing dimension_profile`);
      continue;
    }
    const keys = Object.keys(r.dimension_profile);
    for (const d of dimensions) {
      if (!keys.includes(d)) errors.push(`${r?.id || r?.title || "result"}: dimension_profile missing "${d}"`);
    }
    for (const k of keys) {
      if (!dimSet.has(k)) errors.push(`${r?.id || r?.title || "result"}: dimension_profile has unknown dimension "${k}"`);
    }
  }

  if (architecture?.dimensions?.length) {
    const archDims = architecture.dimensions;
    if (archDims.length !== dimensions.length || archDims.some((d, i) => d !== dimensions[i])) {
      errors.push(`outline dimensions must exactly match Phase 0 dimensions: ${archDims.join(" / ")}`);
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

function validateFinalQuiz(quiz) {
  const errors = [];
  const warnings = [];

  for (const d of (quiz?.scoring?.dimensions || [])) {
    if (!d) errors.push("empty dimension label");
    if (/(更多维度按需补足|更多维度按已确定)/.test(d)) errors.push(`invalid dimension label "${d}"`);
  }

  for (const q of (quiz.questions || [])) {
    if (findObviousTextCorruption(q.text)) errors.push(`${q.id}: corrupted question text`);
    for (const o of (q.options || [])) {
      const textIssue = findObviousTextCorruption(o.text);
      if (textIssue) errors.push(`${q.id}.${o.id}: corrupted option text (${textIssue})`);
      const reactionIssue = findObviousTextCorruption(o.reaction);
      if (reactionIssue) errors.push(`${q.id}.${o.id}: corrupted reaction text (${reactionIssue})`);
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

  const profileIssues = collectProfileSimilarityIssues(quiz.results || [], quiz?.scoring?.dimensions || []);
  for (const issue of profileIssues) {
    const msg = `${issue.pair}: profiles too similar (max diff ${issue.maxDiff.toFixed(2)})`;
    if (issue.severe) errors.push(msg);
    else warnings.push(msg);
  }

  return { errors, warnings };
}

function validateQuestions(questions, dimensions) {
  const warnings = [];
  const dimSet = new Set(dimensions);
  const seenIds = new Set();

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
        if (typeof val !== "number" || val < 0 || val > 3) warnings.push(`${q.id}.${o.id}: score ${val} out of range [0,3] for "${dim}"`);
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
    if (requiredKeys.includes("strengths") && (r.strengths || []).length < 5)
      warnings.push(`${r.id}: only ${r.strengths?.length ?? 0} strengths (want 6)`);
    if (requiredKeys.includes("weaknesses") && (r.weaknesses || []).length < 5)
      warnings.push(`${r.id}: only ${r.weaknesses?.length ?? 0} weaknesses (want 6)`);
  }

  return warnings;
}

function validateDimensionProfiles(results, dimensions) {
  const warnings = [];
  const dimSet = new Set(dimensions);

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

  for (const issue of collectProfileSimilarityIssues(results, dimensions)) {
    warnings.push(`${issue.pair}: profiles too similar (max diff ${issue.maxDiff.toFixed(2)}), users may cluster`);
  }

  return warnings;
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
  printWarnings, assertNoCriticalWarnings,
  STANDARD_FIELD_KEYS,
};
