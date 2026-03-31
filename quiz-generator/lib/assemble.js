// Normalize and assembly helpers extracted from generate-quiz.js

const DIMENSION_MAP = {
  "豪放不羁": "豪放", "沉郁顿挫": "沉郁", "清丽自然": "清丽",
  "雄奇险怪": "奇崛", "恬淡隐逸": "恬淡", "华美秾丽": "华美",
  "天马行空": "天马", "功利主义": "功利", "理想主义": "理想",
  "现实主义": "现实", "浪漫主义": "浪漫", "集体主义": "集体",
  "个人主义": "个体",
};

function simplifyDimensions(dimensions) {
  return dimensions.map(d => {
    if (DIMENSION_MAP[d]) return DIMENSION_MAP[d];
    // Auto-shorten "X与Y" or "X和Y" → take the first half
    if (d.length > 4) {
      const splitMatch = d.match(/^(.{2,4})[与和及]/);
      if (splitMatch) return splitMatch[1];
    }
    // Strip common suffixes
    if (d.length > 4 && /[主义风格精神气质取向表达态度修养变革自主]$/.test(d)) {
      return d.slice(0, 2);
    }
    // Truncate anything still over 4 chars
    if (d.length > 4) return d.slice(0, 4);
    return d;
  });
}

function normalizePortraitText(text) {
  if (!text || typeof text !== "string") return text;
  let normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return normalized;

  // If the model already emitted one-paragraph-per-line, upgrade to double-newline paragraphs.
  if (normalized.includes("\n") && !normalized.includes("\n\n")) {
    const parts = normalized.split("\n").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.join("\n\n");
  }

  // If there are no paragraph breaks, try to split a long portrait into 3 sentence groups.
  if (!normalized.includes("\n\n")) {
    const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/g)?.map(s => s.trim()).filter(Boolean) || [];
    if (sentences.length >= 6) {
      const groups = [[], [], []];
      const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
      const target = Math.ceil(totalChars / 3);
      let idx = 0;
      let currentChars = 0;
      for (const s of sentences) {
        if (idx < 2 && currentChars >= target) {
          idx++;
          currentChars = 0;
        }
        groups[idx].push(s);
        currentChars += s.length;
      }
      const paragraphs = groups.map(g => g.join("")).filter(Boolean);
      if (paragraphs.length >= 2) return paragraphs.join("\n\n");
    }
  }

  return normalized;
}

function looksLikeQuoteContent(text) {
  if (!text || typeof text !== "string") return false;
  const s = text.trim();
  if (!s) return false;
  if (/[“”"'「」]/.test(s)) return true;
  if (/(——|—|-{2,}|出自|语录|曾说|说过|写道|《.+》)/.test(s)) return true;
  // Very short aphorism-like lines can be accepted even without quote marks.
  if (s.length >= 6 && s.length <= 30 && /[，。！？!?]/.test(s) && !/^(体现|表达|展现|映射|说明|揭示|象征|代表|意味着)/.test(s)) return true;
  return false;
}

function normalizeResultExtras(extras, resultId) {
  if (!Array.isArray(extras)) return extras;
  return extras.map((e) => {
    if (!e || typeof e !== "object") return e;
    const normalized = { key: e.key, label: e.label, content: e.content };
    if (normalized.key === "keyQuote" && /代表名言/.test(normalized.label || "") && !looksLikeQuoteContent(normalized.content)) {
      console.warn(`     [dbg] ⚠ ${resultId}.extras[keyQuote]: content does not look like a real quote, relabeling to 精神注脚`);
      normalized.label = "精神注脚";
    }
    return normalized;
  });
}

function findObviousTextCorruption(text) {
  if (!text || typeof text !== "string") return null;
  if (/(更多维度按需补足|更多维度按已确定)/.test(text)) return "placeholder text leaked into final output";
  if (/([\u4e00-\u9fff])\1{2,}/.test(text)) return "same Chinese character repeated 3+ times";
  return null;
}

function normalizeStrengthsWeaknesses(raw, fieldName, resultId) {
  if (!raw) return raw;
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === 'string') {
      console.warn(`     [dbg] ⚠ ${resultId}.${fieldName}: model returned flat string array, converting to {label, description}`);
      return raw.map(s => ({ label: s, description: null }));
    }
    return raw.map(s => ({ label: s.label, description: s.description }));
  }
  if (typeof raw === 'string') {
    console.warn(`     [dbg] ⚠ ${resultId}.${fieldName}: model returned plain string "${raw.slice(0,40)}...", splitting`);
    const items = raw.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);
    return items.map(s => ({ label: s, description: null }));
  }
  return raw;
}

function normalizeDimensionKey(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[：:·•]/g, "")
    .replace(/[与和及、\/／\-]/g, "")
    .replace(/(主义|风格|精神|气质|取向|表达|态度|修养|变革|自主)$/g, "")
    .trim();
}

function normalizeOutlineToArchitecture(outline, architecture) {
  if (!architecture?.dimensions?.length || !Array.isArray(outline?.dimensions)) return outline;

  const archDims = architecture.dimensions;
  const outlineDims = outline.dimensions;
  if (outlineDims.length !== archDims.length) return outline;

  const dimMap = {};
  for (let i = 0; i < outlineDims.length; i++) {
    const from = outlineDims[i];
    const to = archDims[i];
    dimMap[from] = to;
  }

  for (const from of outlineDims) {
    const normalizedFrom = normalizeDimensionKey(from);
    const matched = archDims.find(d => normalizeDimensionKey(d) === normalizedFrom);
    if (matched) dimMap[from] = matched;
  }

  outline.dimensions = [...archDims];

  if (Array.isArray(outline.dimensionAxes)) {
    outline.dimensionAxes = outline.dimensionAxes.map((axis, i) => ({
      ...axis,
      dimension: dimMap[axis.dimension] || archDims[i] || axis.dimension,
    }));
  }

  if (Array.isArray(outline.results)) {
    outline.results = outline.results.map((r, i) => {
      const fallbackDim = architecture?.results?.[i]?.primaryDimension;
      const next = { ...r };
      if (next.dimension) next.dimension = dimMap[next.dimension] || fallbackDim || next.dimension;
      if (next.dimension_profile && typeof next.dimension_profile === "object") {
        const remapped = {};
        for (const [k, v] of Object.entries(next.dimension_profile)) {
          remapped[dimMap[k] || k] = v;
        }
        next.dimension_profile = remapped;
      }
      return next;
    });
  }

  return outline;
}

function assembleQuiz(outline, questions, results) {
  const simplifiedDimensions = simplifyDimensions(outline.dimensions);
  const dimMap = {};
  outline.dimensions.forEach((d, i) => { dimMap[d] = simplifiedDimensions[i]; });

  const remappedQuestions = questions.map(q => ({
    ...q,
    options: (q.options || []).map(o => {
      if (!o.scores) return o;
      const s = {};
      Object.entries(o.scores).forEach(([k, v]) => {
        // Exact match first; then fuzzy match for abbreviated dimension names
        const mapped = dimMap[k]
          || (() => { const full = outline.dimensions.find(d => d.startsWith(k) || k.startsWith(d.slice(0,2))); return full ? dimMap[full] : null; })()
          || k;
        s[mapped] = v;
      });
      return { ...o, scores: s };
    }),
  }));

  // Index results by id for O(1) lookup
  const origById = Object.fromEntries(outline.results.map(r => [r.id, r]));

  const fullResults = results.map(r => {
    const orig = origById[r.id] || {};

    // dimension_profile comes from Phase 1 outline (domain-expert generated, cross-calibrated).
    // Phase 3 results no longer carry it. Fallback: dominant=0.65, others=0.12.
    const aiProfile = orig.dimension_profile || null;
    const profile = {};
    simplifiedDimensions.forEach((d, i) => {
      const origDim = outline.dimensions[i];
      if (aiProfile) {
        const val = aiProfile[d] !== undefined ? aiProfile[d] : (aiProfile[origDim] !== undefined ? aiProfile[origDim] : 0.12);
        profile[d] = parseFloat(Math.max(0, Math.min(1, val)).toFixed(2));
      } else {
        profile[d] = (origDim === orig.dimension) ? 0.65 : 0.12;
      }
    });

    // If AI mistakenly emitted multiple portrait keys, JSON parsing keeps only the last one.
    // To guard against this, we stitch any portrait fragments stored in non-standard keys.
    // (The raw extraction already handles this partially, but as a safety net we also
    // look for portrait_2 / portrait_3 keys that some models emit and append them.)
    const portraitFragments = [r.portrait, r.portrait_2, r.portrait_3].filter(Boolean);
    const portrait = portraitFragments.length > 1
      ? portraitFragments.join("\n\n")
      : (r.portrait || "");

    const assembled = {
      id:                orig.id || r.id,
      title:             orig.title || r.title,
      subtitle:          orig.subtitle || r.subtitle,
      token:             orig.token || r.token,
      verse:             orig.verse || r.verse,
      verseSource:       orig.verseSource || r.verseSource,
      boldQuote:         r.boldQuote || null,
      portrait: normalizePortraitText(portrait),
      strengths:   normalizeStrengthsWeaknesses(r.strengths,  "strengths",  r.id),
      weaknesses:  normalizeStrengthsWeaknesses(r.weaknesses, "weaknesses", r.id),
      temperament: r.temperament,
      situation:   r.situation,
      lifeAdvice:  Array.isArray(r.lifeAdvice) ? r.lifeAdvice.join("；") : r.lifeAdvice,
      destiny:     r.destiny,
      dimension_profile: profile,
    };
    // Strip undefined standard fields rather than keeping them as null
    for (const key of ["strengths", "weaknesses", "temperament", "situation", "lifeAdvice", "destiny", "boldQuote"]) {
      if (assembled[key] == null) delete assembled[key];
    }
    // Custom fields go exclusively into extras — any top-level non-standard keys the model
    // emits (e.g. career: null) are intentionally excluded by the whitelist above
    if (Array.isArray(r.extras) && r.extras.length > 0) assembled.extras = normalizeResultExtras(r.extras, r.id);
    return assembled;
  });

  return {
    id:               outline.id,
    featureId:        null,
    title:            outline.title,
    subtitle:         outline.subtitle,
    eyebrow:          outline.eyebrow,
    description:      outline.description,
    isAvailable:      true,
    estimatedMinutes: Math.max(5, Math.round((questions.length * 0.4))),
    questionPage:     "/subpackages/quiz/pages/generic-question/generic-question",
    resultPage:       "/subpackages/quiz/pages/generic-result/generic-result",
    scoring: {
      type:       "weighted-dimension",
      dimensions: simplifiedDimensions,
      dimensionAxes: (outline.dimensionAxes || []).map(a => ({
        dimension: dimMap[a.dimension] || a.dimension,
        axisLabel: a.axisLabel,
        lowPole:   a.lowPole,
        insight:   a.insight || "",
      })),
      results:    outline.results.map(r => ({
        id:        r.id,
        dimension: dimMap[r.dimension] || r.dimension,
      })),
    },
    questions: remappedQuestions,
    results:   fullResults,
  };
}


/**
 * Ensure every result leads on at least one dimension — i.e. there exists some
 * user score profile that would uniquely match it. Without this, a result can be
 * "shadowed" by another even when not fully Pareto-dominated: whenever it would
 * theoretically win on its best dimension, a different result with a higher value
 * on that same dimension always beats it first.
 *
 * Strategy: if a result is not the sole leader on any dimension, boost its
 * highest-valued dimension by a small increment until it becomes the leader.
 */
function enforceUniquePeaks(results, dimensions, boost = 0.04) {
  const clamp = (v) => parseFloat(Math.min(0.95, Math.max(0.05, v)).toFixed(2));

  const hasStrictPeak = (result) => {
    const p = result.dimension_profile;
    if (!p) return false;
    return dimensions.some(d =>
      results.every(other => other === result || (other.dimension_profile?.[d] || 0) < (p[d] || 0))
    );
  };

  for (let pass = 0; pass < results.length * 2; pass++) {
    let changed = false;
    for (const result of results) {
      const p = result.dimension_profile;
      if (!p || hasStrictPeak(result)) continue;

      const targetDim = dimensions.includes(result.dimension) ? result.dimension : dimensions[0];
      const maxOther = Math.max(
        ...results
          .filter(other => other !== result)
          .map(other => other.dimension_profile?.[targetDim] || 0)
      );

      if ((p[targetDim] || 0) <= maxOther) {
        const desired = clamp(Math.min(0.95, maxOther + boost));
        if (desired > (p[targetDim] || 0)) {
          p[targetDim] = desired;
          changed = true;
        }
      }

      // If the target dimension is already at ceiling and still tied, nudge tied
      // competitors down slightly instead of inflating unrelated dimensions.
      const tied = results.filter(other =>
        other !== result && (other.dimension_profile?.[targetDim] || 0) >= (p[targetDim] || 0)
      );
      if (tied.length > 0) {
        for (const other of tied) {
          const prev = other.dimension_profile[targetDim] || 0;
          other.dimension_profile[targetDim] = clamp(prev - 0.03);
          if (other.dimension_profile[targetDim] !== prev) changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return results;
}

function spreadProfiles(results, dimensions, minDiff = 0.16) {
  const clamp = (v) => parseFloat(Math.max(0.05, Math.min(0.95, v)).toFixed(2));

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const a = results[i].dimension_profile;
        const b = results[j].dimension_profile;
        if (!a || !b) continue;

        const maxDiff = Math.max(...dimensions.map(d => Math.abs((a[d] || 0) - (b[d] || 0))));
        if (maxDiff >= minDiff) continue;

        const aDim = dimensions.includes(results[i].dimension) ? results[i].dimension : dimensions[0];
        const bDim = dimensions.includes(results[j].dimension) ? results[j].dimension : dimensions[0];
        const needed = parseFloat(((minDiff - maxDiff) / 2 + 0.01).toFixed(2));

        const aPrevHigh = a[aDim] || 0;
        const bPrevHigh = b[bDim] || 0;
        a[aDim] = clamp(aPrevHigh + needed);
        b[bDim] = clamp(bPrevHigh + needed);
        if (a[aDim] !== aPrevHigh || b[bDim] !== bPrevHigh) changed = true;

        if (aDim !== bDim) {
          const aPrevLow = a[bDim] || 0;
          const bPrevLow = b[aDim] || 0;
          a[bDim] = clamp(aPrevLow - needed);
          b[aDim] = clamp(bPrevLow - needed);
          if (a[bDim] !== aPrevLow || b[bDim] !== bPrevHigh || b[aDim] !== bPrevLow) changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return results;
}

// Deterministically convert architecture profileHints (high/medium/low) into
// numeric dimension_profiles. This keeps AI responsible for semantic choices
// (which dimensions are high/medium/low), while code owns the exact numbers.
function applyProfilesFromHints(results, dimensions, architecture) {
  const RANGES = { high: [0.66, 0.80], medium: [0.34, 0.50], low: [0.10, 0.22] };
  const archResults = (architecture && architecture.results) || [];
  const normalize = (s) => String(s || "").replace(/\s+/g, "").replace(/[轴重度力感性]$/g, "");
  const clamp = (v) => parseFloat(Math.min(0.95, Math.max(0.05, v)).toFixed(2));
  const stableUnit = (seed) => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  };
  const pickValue = (hint, seed) => {
    const [min, max] = RANGES[hint] || RANGES.medium;
    return parseFloat((min + stableUnit(seed) * (max - min)).toFixed(2));
  };

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const archResult = archResults[i] || {};
    const hints = archResult.profileHints || {};
    const primaryDimension = normalize(archResult.primaryDimension || result.dimension);

    result.dimension_profile = {};
    for (const dim of dimensions) {
      const normalizedDim = normalize(dim);
      let hint = hints[dim];
      if (!hint) {
        const found = Object.entries(hints).find(([k]) => {
          const normalizedKey = normalize(k);
          return normalizedKey === normalizedDim ||
            normalizedKey.startsWith(normalizedDim) ||
            normalizedDim.startsWith(normalizedKey);
        });
        hint = found ? found[1] : (normalizedDim === primaryDimension ? "high" : "medium");
      }

      const seed = `${result.id}|${dim}|${hint}|${i}`;
      result.dimension_profile[dim] = pickValue(hint, seed);
    }
  }

  // If multiple results share the same primary dimension, give each one a stable
  // secondary signature so they do not collapse into near-duplicates or dominate
  // one another on all remaining dimensions.
  const groups = new Map();
  for (const result of results) {
    const key = dimensions.includes(result.dimension) ? result.dimension : dimensions[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  for (const [primaryDim, group] of groups.entries()) {
    if (group.length <= 1) continue;
    const secondaryDims = dimensions.filter(d => d !== primaryDim);
    for (let idx = 0; idx < group.length; idx++) {
      const result = group[idx];
      const p = result.dimension_profile;
      const upDim = secondaryDims[idx % secondaryDims.length];
      const downDim = secondaryDims[(idx + 1) % secondaryDims.length];
      for (const dim of secondaryDims) {
        if (dim === upDim) {
          p[dim] = clamp(Math.max(p[dim] || 0, 0.55));
        } else if (dim === downDim) {
          p[dim] = clamp(Math.min(p[dim] || 0, 0.12));
        } else {
          p[dim] = clamp(Math.min(p[dim] || 0, 0.42));
        }
      }
    }
  }
}

module.exports = {
  spreadProfiles, enforceUniquePeaks, applyProfilesFromHints,
  DIMENSION_MAP, simplifyDimensions,
  normalizePortraitText, looksLikeQuoteContent,
  normalizeResultExtras, findObviousTextCorruption,
  normalizeStrengthsWeaknesses, normalizeDimensionKey,
  normalizeOutlineToArchitecture, assembleQuiz,
};
