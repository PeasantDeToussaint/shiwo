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

  // If there are no paragraph breaks, try to split a long portrait into sentence groups.
  if (!normalized.includes("\n\n")) {
    const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/g)?.map(s => s.trim()).filter(Boolean) || [];
    if (sentences.length >= 3) {
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
    // Fallback: character-position split when sentence parsing yields too few segments.
    if (normalized.length > 180) {
      const third = Math.floor(normalized.length / 3);
      const sentenceEnds = /[。！？!?]/g;
      let m;
      const splits = [];
      while ((m = sentenceEnds.exec(normalized)) !== null) {
        splits.push(m.index + 1);
      }
      const cut1 = splits.find(p => p >= third) || third;
      const cut2 = splits.find(p => p >= third * 2 && p > cut1) || third * 2;
      if (cut1 < cut2 && cut2 < normalized.length) {
        return [
          normalized.slice(0, cut1).trim(),
          normalized.slice(cut1, cut2).trim(),
          normalized.slice(cut2).trim(),
        ].filter(Boolean).join("\n\n");
      }
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

// Known generic Buddhist/philosophical koan patterns that cannot be authentically
// attributed to a specific fictional drama character.
const GENERIC_VERSE_PATTERNS = [
  /菩提本无树/, /明镜亦非台/, /本来无一物/, /何处惹尘埃/,
  /色即是空/,   /空即是色/,   /诸行无常/,   /诸法无我/,
  /刻那即永恒/, /万法归一/,   /一念放下/,   /随缘自在/,
  /当下即圆满/, /心若菩提/,   /心无挂碍/,
];

function looksLikeGenericVerse(verse) {
  if (!verse || typeof verse !== "string") return false;
  return GENERIC_VERSE_PATTERNS.some(p => p.test(verse));
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

function inferFeatureId(outline) {
  const resultType = outline?.architectureResultType || "archetype";
  const text = [
    outline?.id, outline?.title, outline?.subtitle, outline?.eyebrow,
    outline?.description, outline?.aestheticContext,
  ].filter(Boolean).join(" ").toLowerCase();

  const has = (re) => re.test(text);

  if (has(/mbti|16人格|十六人格|大五|九型|enneagram|career|职业倾向|aptitude/)) {
    return "classics";
  }
  if (has(/审美|艺术|画家|绘画|电影|戏剧|舞蹈|音乐|诗人|词人|作家|文学|香水|perfume|literary/)) {
    return "aesthetics";
  }
  if (has(/恋爱|关系|依恋|心理|人格|性格|冲突|友谊|人生哲学|价值观|原型|philosophy|psychology/)) {
    return "psychology";
  }
  if (has(/城市|旅行|宠物|运动|方言|寺庙|厨房|美食|天气|生活方式|sport|pet|city|dialect|temple/)) {
    return "lifestyle";
  }
  if (resultType === "figure") return "history";
  if (resultType === "item") return "lifestyle";
  return "psychology";
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

function derivePeakDimension(profile, dimensions, fallback) {
  if (!profile || typeof profile !== "object") return fallback;
  const keys = dimensions.filter(d => Object.prototype.hasOwnProperty.call(profile, d));
  if (keys.length === 0) return fallback;
  return keys.reduce((best, k) => ((profile[k] ?? -Infinity) > (profile[best] ?? -Infinity) ? k : best), keys[0]);
}

function assembleQuiz(outline, questions, results) {
  const scoringType = outline.architectureScoringFamily || "weighted-dimension";
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
    const resultIndex = outline.results.findIndex(item => item.id === r.id);

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

    const verse = orig.verse || r.verse;
    if (verse && looksLikeGenericVerse(verse)) {
      console.warn(`     [dbg] ⚠ ${orig.id || r.id}.verse: "${verse}" matches a generic philosophical/Buddhist pattern — this is unlikely to be a character-specific quote`);
    }

    const assembled = {
      id:                orig.id || r.id,
      title:             orig.title || r.title,
      subtitle:          orig.subtitle || r.subtitle,
      token:             orig.token || r.token,
      verse,
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
    if (scoringType === "level-band" && resultIndex >= 0) {
      assembled.bandIndex = resultIndex;
    }
    // Strip undefined standard fields rather than keeping them as null
    for (const key of ["strengths", "weaknesses", "temperament", "situation", "lifeAdvice", "destiny", "boldQuote"]) {
      if (assembled[key] == null) delete assembled[key];
    }
    // Custom fields go exclusively into extras — any top-level non-standard keys the model
    // emits (e.g. career: null) are intentionally excluded by the whitelist above
    if (Array.isArray(r.extras) && r.extras.length > 0) assembled.extras = normalizeResultExtras(r.extras, r.id);
    return assembled;
  });

  const scoring = {
    type:       scoringType,
    dimensions: simplifiedDimensions,
    dimensionAxes: (outline.dimensionAxes || []).map(a => ({
      dimension: dimMap[a.dimension] || a.dimension,
      axisLabel: a.axisLabel,
      lowPole:   a.lowPole,
      highPole:  a.highPole,
      insight:   a.highInsight || a.insight || "",
      highInsight: a.highInsight || a.insight || "",
      lowInsight:  a.lowInsight || "",
    })),
  };

  if (scoringType === "level-band") {
    const count = Math.max(1, outline.results.length);
    scoring.bands = outline.results.map((r, idx) => {
      const min = parseFloat((idx / count).toFixed(2));
      const max = idx === count - 1 ? 1 : parseFloat((((idx + 1) / count) - 0.01).toFixed(2));
      return {
        resultId: r.id,
        rank: idx,
        min,
        max: idx === count - 1 ? 1 : Math.max(min, max),
      };
    });
  } else {
    scoring.results = outline.results.map(r => ({
      id:        r.id,
      dimension: dimMap[derivePeakDimension(r.dimension_profile, outline.dimensions, r.dimension)] || dimMap[r.dimension] || r.dimension,
    }));
  }

  return {
    id:               outline.id,
    featureId:        inferFeatureId(outline),
    title:            outline.title,
    subtitle:         outline.subtitle,
    eyebrow:          outline.eyebrow,
    description:      outline.description,
    isAvailable:      true,
    estimatedMinutes: Math.max(5, Math.round((questions.length * 0.4))),
    questionPage:     "/subpackages/quiz/pages/generic-question/generic-question",
    resultPage:       "/subpackages/quiz/pages/generic-result/generic-result",
    scoring,
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
  const hintRank = (hint) => ({ high: 2, medium: 1, low: 0 }[hint] ?? 1);
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
  const hintMaps = new Map();
  const signatureById = new Map();
  const findHint = (hints, dim, fallbackDim) => {
    const normalizedDim = normalize(dim);
    let hint = hints[dim];
    if (!hint) {
      const found = Object.entries(hints).find(([k]) => {
        const normalizedKey = normalize(k);
        return normalizedKey === normalizedDim ||
          normalizedKey.startsWith(normalizedDim) ||
          normalizedDim.startsWith(normalizedKey);
      });
      hint = found ? found[1] : (normalizedDim === fallbackDim ? "high" : "medium");
    }
    return ["high", "medium", "low"].includes(hint) ? hint : "medium";
  };

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const archResult = archResults[i] || {};
    const hints = archResult.profileHints || {};
    const primaryDimension = normalize(archResult.primaryDimension || result.dimension);
    const normalizedHintMap = {};

    result.dimension_profile = {};
    for (const dim of dimensions) {
      const hint = findHint(hints, dim, primaryDimension);
      normalizedHintMap[dim] = hint;
      const seed = `${result.id}|${dim}|${hint}|${i}`;
      result.dimension_profile[dim] = pickValue(hint, seed);
    }

    const signatureDim = dimensions.includes(result.dimension)
      ? result.dimension
      : (dimensions.find(dim => normalizedHintMap[dim] === "high") || dimensions[0]);
    result.dimension = signatureDim;
    hintMaps.set(result.id, normalizedHintMap);
    signatureById.set(result.id, signatureDim);
  }

  // Give same-signature results deterministic cross-cuts on secondary dimensions
  // so they do not collapse into the same vector.
  const groups = new Map();
  for (const result of results) {
    const key = signatureById.get(result.id) || (dimensions.includes(result.dimension) ? result.dimension : dimensions[0]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  for (const [signatureDim, group] of groups.entries()) {
    const secondaryDims = dimensions.filter(d => d !== signatureDim);
    for (let idx = 0; idx < group.length; idx++) {
      const result = group[idx];
      const p = result.dimension_profile;
      const hints = hintMaps.get(result.id) || {};
      const orderedSecondary = [...secondaryDims].sort((a, b) =>
        stableUnit(`${result.id}|${a}|secondary`) - stableUnit(`${result.id}|${b}|secondary`)
      );
      const upDim = orderedSecondary.length ? orderedSecondary[idx % orderedSecondary.length] : null;
      const downDim = orderedSecondary.length ? orderedSecondary[(idx + 1) % orderedSecondary.length] : null;

      p[signatureDim] = clamp(Math.max(
        p[signatureDim] || 0,
        0.76 + 0.03 * Math.min(idx, 3) + 0.03 * stableUnit(`${result.id}|${signatureDim}|signature`)
      ));

      for (const dim of secondaryDims) {
        if (dim === upDim) {
          const floor = hints[dim] === "high" ? 0.68 : (hints[dim] === "medium" ? 0.54 : 0.26);
          p[dim] = clamp(Math.max(p[dim] || 0, floor + 0.03 * stableUnit(`${result.id}|${dim}|up`)));
        } else if (dim === downDim) {
          const ceiling = hints[dim] === "high" ? 0.58 : (hints[dim] === "medium" ? 0.24 : 0.12);
          p[dim] = clamp(Math.min(p[dim] || 0, ceiling - 0.02 * stableUnit(`${result.id}|${dim}|down`)));
        } else {
          const ceiling = hints[dim] === "high" ? 0.72 : (hints[dim] === "medium" ? 0.46 : 0.18);
          p[dim] = clamp(Math.min(p[dim] || 0, ceiling));
        }
      }
    }
  }

  // If two results share the exact same hint pattern, give them a stronger,
  // deterministic accent/contrast split so their numeric profiles diverge.
  const patternGroups = new Map();
  for (const result of results) {
    const hints = hintMaps.get(result.id) || {};
    const signatureDim = signatureById.get(result.id) || result.dimension || dimensions[0];
    const key = dimensions.map(dim => hints[dim] || "medium").join("|");
    if (!patternGroups.has(key)) patternGroups.set(key, []);
    patternGroups.get(key).push({ result, signatureDim, hints });
  }
  for (const group of patternGroups.values()) {
    if (group.length <= 1) continue;
    for (let idx = 0; idx < group.length; idx++) {
      const { result, signatureDim, hints } = group[idx];
      const p = result.dimension_profile;
      const dims = dimensions.filter(d => d !== signatureDim);
      if (dims.length === 0) continue;
      const accentDim = dims[idx % dims.length];
      const contrastDim = dims[(idx + 1) % dims.length];
      p[accentDim] = clamp(Math.max(
        p[accentDim] || 0,
        (hints[accentDim] === "low" ? 0.28 : 0.58) + 0.02 * stableUnit(`${result.id}|${accentDim}|accent`)
      ));
      if (contrastDim && contrastDim !== accentDim) {
        const ceiling = hints[contrastDim] === "high" ? 0.60 : (hints[contrastDim] === "medium" ? 0.22 : 0.10);
        p[contrastDim] = clamp(Math.min(p[contrastDim] || 0, ceiling));
      }
    }
  }

  // Safety net: if any result is still Pareto-dominated, rescue it on one
  // dimension it is semantically allowed to own. This should be rare after the
  // constrained construction above, but avoids unreachable outcomes.
  for (let pass = 0; pass < results.length * Math.max(2, dimensions.length); pass++) {
    let changed = false;
    for (let i = 0; i < results.length; i++) {
      for (let j = 0; j < results.length; j++) {
        if (i === j) continue;
        const a = results[i];
        const b = results[j];
        const pa = a.dimension_profile;
        const pb = b.dimension_profile;
        if (!pa || !pb) continue;
        const dominated = dimensions.every(d => (pb[d] || 0) >= (pa[d] || 0)) &&
          dimensions.some(d => (pb[d] || 0) > (pa[d] || 0));
        if (!dominated) continue;

        const hints = hintMaps.get(a.id) || {};
        const signatureDim = signatureById.get(a.id) || a.dimension || dimensions[0];
        const candidates = [...dimensions].sort((x, y) => {
          const sx = (x === signatureDim ? 10 : 0) + hintRank(hints[x]) * 3 - ((pb[x] || 0) - (pa[x] || 0));
          const sy = (y === signatureDim ? 10 : 0) + hintRank(hints[y]) * 3 - ((pb[y] || 0) - (pa[y] || 0));
          return sy - sx;
        });
        const rescueDim = candidates[0] || signatureDim;
        const target = clamp(Math.min(0.95, (pb[rescueDim] || 0) + 0.05 + 0.02 * stableUnit(`${a.id}|${b.id}|${rescueDim}|rescue`)));
        if (target > (pa[rescueDim] || 0)) {
          pa[rescueDim] = target;
          changed = true;
        }

        if ((pa[rescueDim] || 0) <= (pb[rescueDim] || 0)) {
          const altDim = candidates.find(dim => dim !== rescueDim);
          if (altDim) {
            const altTarget = clamp(Math.min(0.95, (pb[altDim] || 0) + 0.05 + 0.02 * stableUnit(`${a.id}|${b.id}|${altDim}|alt-rescue`)));
            if (altTarget > (pa[altDim] || 0)) {
              pa[altDim] = altTarget;
              changed = true;
            }
          }
        }

        if ((pa[rescueDim] || 0) <= (pb[rescueDim] || 0)) {
          const lowered = clamp(Math.max(0.05, (pb[rescueDim] || 0) - 0.04));
          if (lowered < (pb[rescueDim] || 0)) {
            pb[rescueDim] = lowered;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

module.exports = {
  spreadProfiles, enforceUniquePeaks, applyProfilesFromHints,
  DIMENSION_MAP, simplifyDimensions,
  normalizePortraitText, looksLikeQuoteContent, looksLikeGenericVerse,
  normalizeResultExtras, findObviousTextCorruption,
  normalizeStrengthsWeaknesses, normalizeDimensionKey,
  normalizeOutlineToArchitecture, assembleQuiz,
};
