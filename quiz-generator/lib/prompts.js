const fs = require('fs');
const path = require('path');
const { callAI } = require('./ai');
const { extractJSON } = require('./json-repair');
const { LITERARY_GUIDE, formatAestheticContext } = require('./style-guide');
const {
  validateArchitecture, validateOutlineStructure,
} = require('./validate');
const { normalizeOutlineToArchitecture, spreadProfiles } = require('./assemble');

function inferHintsFromTopic(topic) {
  const autoHints = [];

  // Pattern 1: parenthetical slash/comma-list → explicit result items
  // Strip nested parens first so "鸟（如鹦鹉）" → "鸟" before splitting
  const listMatch = topic.match(/[（(]([^）)]{4,}[/／、][^）)（(]+(?:[（(][^）)]*[）)][^）)（(]*)*)[）)]/);
  if (listMatch) {
    const inner = listMatch[1].replace(/[（(][^）)]*[）)]/g, ""); // remove nested parens
    const items = inner
      .split(/[/／、，,]/)
      .map(s => s.trim())
      .map(s => s.replace(/^(要包含|包含|包括|涵盖|如|比如|例如)\s*/u, "")) // strip leading verbs
      .map(s => s.replace(/(归为一类|等|类|型|等类别)$/u, "").trim())        // strip trailing suffixes
      .filter(s => s.length > 0 && s.length <= 10);
    if (items.length >= 3) {
      autoHints.push(
        `resultType必须是item，results必须严格使用以下名称，不得自创原型名：${items.join("、")}`
      );
    }
  }

  // Pattern 2: "给出适合程度" → spectrum results
  if (/适合程度|适合度|程度|段位/.test(topic)) {
    autoHints.push(
      `结果必须是「适合程度」的不同段位，从最适合到最不适合排列，名称要体现程度差异，不能是通用人格原型名称`
    );
  }

  // Pattern 3: "哪个国家/城市/地方" → item type
  if (/哪个国家|哪个城市|哪座城市|哪个地方|哪个地区/.test(topic) && !listMatch) {
    autoHints.push(`resultType必须是item，每个结果是真实存在的国家或城市名称`);
  }

  return autoHints;
}

function formatDimensionSpecs(specs) {
  if (!Array.isArray(specs) || specs.length === 0) return "";
  return specs.map((spec) => {
    const highAnchors = Array.isArray(spec.highAnchorResults) ? spec.highAnchorResults.join("、") : "";
    const lowAnchors = Array.isArray(spec.lowAnchorResults) ? spec.lowAnchorResults.join("、") : "";
    const forbidden = Array.isArray(spec.forbiddenInterpretations) ? spec.forbiddenInterpretations.join("、") : "";
    return [
      `- 【${spec.dimension}】`,
      `  高分定义：${spec.highDefinition || ""}`,
      `  低分定义：${spec.lowDefinition || ""}`,
      `  高分锚点：${highAnchors}`,
      `  低分锚点：${lowAnchors}`,
      `  禁止误读：${forbidden}`,
    ].join("\n");
  }).join("\n");
}

const SCORING_FAMILY_GUIDANCE = {
  "weighted-dimension": "适合“你像谁 / 你是哪种类型 / 你更接近哪个角色”的匹配题。核心是把用户映射到多个结果中的一个，结果之间靠维度组合差异区分，不靠总分高低排段位。",
  "bipolar-dimension": "适合每个维度都有清晰正反两极的题，例如“公义优先 vs 自我为本”。同一维度的高低分必须代表真正对立的两端，出题时允许正负分去表达向哪一极偏移。",
  "level-band": "适合“你的程度 / 等级 / 段位 / 适合度”这类连续层级题。结果是从低到高的阶段，不是彼此平行的原型；核心是看总体成熟度或适配度落在哪个区间。",
};

function formatScoringFamilyMenu() {
  return Object.entries(SCORING_FAMILY_GUIDANCE)
    .map(([key, text]) => `- ${key}: ${text}`)
    .join("\n");
}

function formatScoringFamilyGuidance(scoringFamily) {
  if (!scoringFamily) return "";
  return SCORING_FAMILY_GUIDANCE[scoringFamily] || "";
}

const PORTRAIT_TEMPLATE_BY_TYPE = {
  archetype: `  "portrait": "【重要】portrait 必须是一个 JSON 字符串，三段之间用 \\\\n\\\\n 分隔，绝对不能拆成多个 portrait 键。每段严格100-150字，合计300-450字，不得超过。第一段：描述这类人的内在世界和核心特质；第二段：描述他们的行为模式和与他人的关系；第三段：描述核心挑战与成长方向。格式：「第一段\\\\n\\\\n第二段\\\\n\\\\n第三段」"`,
  figure:    `  "portrait": "【重要】portrait 必须是一个 JSON 字符串，三段之间用 \\\\n\\\\n 分隔，绝对不能拆成多个 portrait 键。每段严格100-150字，合计300-450字，不得超过。第一段：描述这位人物的核心精神气质；第二段：将用户与这位人物的相似之处具体化，写出共同的行为模式或内在动因；第三段：这种气质带来的挑战与可能性。格式：「第一段\\\\n\\\\n第二段\\\\n\\\\n第三段」"`,
  item:      `  "portrait": "【重要】portrait 必须是一个 JSON 字符串，三段之间用 \\\\n\\\\n 分隔，绝对不能拆成多个 portrait 键。每段严格100-150字，合计300-450字，不得超过。不要描述事物本身，而要解释为什么测验者的人格与它产生共鸣。第一段：测验者身上哪些具体特质让他们与这个结果产生联结；第二段：这个结果的文化/精神特质如何与测验者的内在世界对应；第三段：这种匹配在现实中的张力与代价。格式：「第一段\\\\n\\\\n第二段\\\\n\\\\n第三段」"`,
};

const STANDARD_FIELD_TEMPLATES = {
  portrait: PORTRAIT_TEMPLATE_BY_TYPE.archetype, // default, overridden in buildResultTemplate
  strengths: `  "strengths": [
    { "label": "3-5字标签", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" }
  ]`,
  weaknesses: `  "weaknesses": [
    { "label": "3-5字标签", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" },
    { "label": "同上", "description": "严格2句，共40-60字" }
  ]`,
  temperament: `  "temperament": "严格2句，共40-60字"`,
  situation:   `  "situation": "严格1句，20-30字"`,
  lifeAdvice:  `  "lifeAdvice": "严格1-2句，30-50字"`,
  destiny:     `  "destiny": "严格1句，20-30字"`,
};

function buildResultTemplate(resultFields, resultType) {
  const lines = [
    '{',
    '  "id": "原id",',
    '  "title": "原title",',
    '  "subtitle": "原subtitle",',
    '  "token": "原token",',
    '  "verse": "原verse",',
    '  "verseSource": "原verseSource",',
    '  "boldQuote": null,',
  ];

  // Use type-specific portrait template
  const templates = {
    ...STANDARD_FIELD_TEMPLATES,
    portrait: PORTRAIT_TEMPLATE_BY_TYPE[resultType] || PORTRAIT_TEMPLATE_BY_TYPE.archetype,
  };
  const standardKeys = new Set(Object.keys(templates));
  const customFields = [];

  for (const f of resultFields) {
    if (standardKeys.has(f.key)) {
      // If Phase 0 provided a custom instruction for a standard field, use it over the default template
      const override = f.instruction
        ? `  "${f.key}": "按如下要求撰写：${f.instruction.replace(/"/g, '\\"')}"`
        : templates[f.key];
      lines.push(override + ",");
    } else {
      customFields.push(f);
    }
  }

  if (customFields.length > 0) {
    const extrasLines = customFields.map(f =>
      `    { "key": "${f.key}", "label": "${f.label}", "content": "${f.instruction || '按字段含义写，80-150字'}" }`
    );
    lines.push(`  "extras": [\n${extrasLines.join(",\n")}\n  ]`);
  }

  // Remove trailing comma from last field line
  const lastIdx = lines.length - 1;
  lines[lastIdx] = lines[lastIdx].replace(/,\s*$/, "");
  lines.push('}');
  return lines.join("\n");
}

/**
 * Post-process repair: clamp dimensionSpecs anchors to the actual results list.
 *
 * Models routinely pick anchor names from domain knowledge (e.g. 夏冬, 蒙挚)
 * even when those characters weren't chosen as results for this run. Rather than
 * retrying the whole architecture, we:
 *   1. Normalise every anchor name via fuzzy match against the real result names.
 *   2. Drop anchors that don't match anything.
 *   3. If a list ends up empty, fill it with the best-matching result that isn't
 *      already in the opposite anchor list.
 *   4. Ensure forbiddenInterpretations is always a non-empty array.
 */
function repairArchitectureAnchors(architecture) {
  const results = Array.isArray(architecture?.results) ? architecture.results : [];
  if (results.length === 0) return;

  const validNames = results.map(r => String(r?.name || "")).filter(Boolean);

  // Levenshtein-free fuzzy: returns the best valid name for a given anchor string,
  // or null if nothing is close enough.
  function bestMatch(anchor) {
    const a = String(anchor || "").trim();
    if (!a) return null;
    // Exact match
    if (validNames.includes(a)) return a;
    // Substring: valid name contains the anchor, or anchor contains the valid name
    const sub = validNames.find(n => n.includes(a) || a.includes(n));
    if (sub) return sub;
    // Character overlap: pick the name that shares the most characters with anchor
    let best = null, bestScore = 0;
    for (const n of validNames) {
      const overlap = [...a].filter(ch => n.includes(ch)).length;
      const score = overlap / Math.max(a.length, n.length);
      if (score > bestScore && score >= 0.5) { bestScore = score; best = n; }
    }
    return best;
  }

  function repairList(anchors) {
    if (!Array.isArray(anchors)) {
      // Model may have output a plain string (e.g. "靖王/萧景琰") — try to split it
      const raw = String(anchors || "");
      anchors = raw ? raw.split(/[,，、\/／\s]+/).map(s => s.trim()).filter(Boolean) : [];
    }
    const mapped = [];
    for (const a of anchors) {
      const m = bestMatch(a);
      if (m && !mapped.includes(m)) mapped.push(m);
    }
    return mapped;
  }

  // Build a lookup: resultName → profileHints object, for semantically-guided filling
  const hintsByName = {};
  for (const r of results) {
    const name = String(r?.name || "");
    if (name) hintsByName[name] = r.profileHints || {};
  }

  const specs = Array.isArray(architecture?.dimensionSpecs) ? architecture.dimensionSpecs : [];
  for (const spec of specs) {
    if (!spec) continue;

    spec.highAnchorResults = repairList(spec.highAnchorResults);
    spec.lowAnchorResults  = repairList(spec.lowAnchorResults);

    const dimName = spec.dimension || "";

    // Fill empty anchor lists using profileHints so we pick semantically correct results,
    // not just whoever hasn't been used yet.
    const hintRank = (name, wantedHint) => {
      const hint = (hintsByName[name] || {})[dimName];
      if (hint === wantedHint) return 0;
      if (hint === "medium")   return 1;
      return 2; // opposite pole — least preferred
    };

    const fillFromHints = (exclude, wantedHint) => {
      return validNames
        .filter(n => !exclude.includes(n))
        .sort((a, b) => hintRank(a, wantedHint) - hintRank(b, wantedHint))
        .slice(0, 2);
    };

    if (spec.highAnchorResults.length === 0) {
      spec.highAnchorResults = fillFromHints(spec.lowAnchorResults, "high");
      if (spec.highAnchorResults.length === 0 && validNames.length > 0) {
        spec.highAnchorResults = [validNames[0]];
      }
      console.log(`     [repair] ${dimName}: highAnchorResults filled with ${spec.highAnchorResults.join("、")} (from profileHints)`);
    }
    if (spec.lowAnchorResults.length === 0) {
      spec.lowAnchorResults = fillFromHints(spec.highAnchorResults, "low");
      if (spec.lowAnchorResults.length === 0 && validNames.length > 1) {
        spec.lowAnchorResults = [validNames[validNames.length - 1]];
      }
      console.log(`     [repair] ${dimName}: lowAnchorResults filled with ${spec.lowAnchorResults.join("、")} (from profileHints)`);
    }

    // Ensure forbiddenInterpretations is a non-empty array
    if (!Array.isArray(spec.forbiddenInterpretations) || spec.forbiddenInterpretations.length === 0) {
      spec.forbiddenInterpretations = [`不能把"${dimName}"偷换成语义相近但不同的概念`];
      console.log(`     [repair] ${dimName}: forbiddenInterpretations was empty, added placeholder`);
    }
  }
}

async function generateArchitecture(topic, hintBlock, callAIImpl = callAI) {
  const system = `你是「${topic}」领域的资深专家。你的任务是为一道微信小程序测验设计结果架构——决定测验应该输出哪些结果、为什么这样划分、每个结果的核心定位是什么。

这个测验不一定是人格测验。结果可能是：具体国家/城市/事物（item 类）、适合程度的不同段位（archetype 类但以程度命名）、真实人物（figure 类）、或有象征意味的人格原型（archetype 类）。你需要先判断这个测验属于哪种类型，再基于该类型设计结果，而不是一律套用「人格原型」框架。

你还需要先判断这个题应该用哪种 scoringFamily。不同 family 的设计目标不同，不能混用：
${formatScoringFamilyMenu()}

这一步只关注概念和结构，不写任何正文内容。输出严格 JSON，不输出其他内容。`;

  const user = `请为以下测验设计原型架构：

主题：${topic}
${hintBlock}
第一步：先判断 scoringFamily
- scoringFamily = "weighted-dimension"：结果是多个并列原型/人物/事物，目标是做“最像谁/最接近哪一类”的匹配
- scoringFamily = "bipolar-dimension"：每个维度都天然有高低两极，用户会落在每条轴的某一侧，再综合匹配结果
- scoringFamily = "level-band"：结果本质是程度/阶段/段位，必须能从低到高排成序列

每种 scoringFamily 的 guidance：
${formatScoringFamilyMenu()}

第二步：判断这个测验适合哪种结果类型
- resultType = "figure"：题目明确涉及某类具体人物（如「民国女性」「宋词词人」「文艺复兴画家」），每个结果对应一个真实存在的代表人物
- resultType = "item"：结果是真实存在的具体事物或地点。包括「你适合什么X」类型，也包括主题说明中明确指定了结果类别的情况（如「包含多个国家」「包含多个城市」「包含以下几种食物」）——只要结果是真实存在的具体事物，就选 item
- resultType = "archetype"：题目是抽象人格映射（如「你是哪种宝石」「你的恋爱风格」），结果是有象征意味的原型名称，侧重人格隐喻而非真实事物特性

【重要】如果主题或约束中明确说明结果应该是某类真实事物（国家、城市、食物、运动等），必须选 item，不能选 archetype。

第三步：基于领域知识设计维度和原型

resultFields 说明：portrait 必选，其余标准字段按需选用，自定义字段 ≤2 个。以下格式仅供参考，实际字段由你在第三步决定。

输出格式：
{
  "domainInsight": "4-6句，说明这个主题最核心的人格分化轴是什么，为什么这样划分比其他方式更准确",
  "scoringFamily": "weighted-dimension、bipolar-dimension 或 level-band 三选一",
  "resultType": "figure、item 或 archetype 三选一",
  "resultFields": [
    { "key": "portrait", "label": "气质画像", "standard": true },
    { "key": "lifeAdvice", "label": "行动建议", "standard": true },
    { "key": "customFieldKey", "label": "自定义标题", "standard": false, "instruction": "说明这个字段写什么、写多少字" }
  ],
  "dimensionCount": 5,
  "questionCount": 20,
  "dimensions": ["维度1", "维度2", "更多维度按需补足，必须与dimensionCount数量一致。每个维度名称必须2-4字，不要用与/和连接两个概念"],
  "dimensionSpecs": [
    {
      "dimension": "维度1",
      "highDefinition": "这个维度高分到底意味着什么。要写成决策标准或行为原则，不要写抽象夸奖",
      "lowDefinition": "这个维度低分到底意味着什么。必须与 highDefinition 构成真正对立",
      "highAnchorResults": ["最能代表这个维度高分的2个结果名称"],
      "lowAnchorResults": ["最能代表这个维度低分的2个结果名称"],
      "forbiddenInterpretations": ["这个维度最容易被误解成什么", "再写1-2条禁止误读"]
    }
  ],
  "results": [
    {
      "conceptId": "c1",
      "primaryDimension": "维度A",
      "name": "resultType=figure 时：真实人物姓名，如「林徽因」。resultType=item 时：具体事物名称，如「柴犬」「攀岩」「成都」。resultType=archetype 时：原型名称，如「翡翠」「猫系恋人」，不能是抽象性格词",
      "nameContext": "resultType=figure 时：人物背景（1句）。resultType=item 时：该事物的核心特性（1句，说明为何能映射这种人格）。resultType=archetype 时：象征描述（1句）",
      "coreIdentity": "这个原型的人格核心，20-30字，说清楚「这类人本质上是什么样的人」",
      "distinctiveFeature": "与其他原型最显著的区别特质，15-20字",
      "profileHints": {
        "维度A": "high/medium/low",
        "维度B": "high/medium/low",
        "维度C": "如果存在更多维度，继续补齐。profileHints 必须覆盖所有维度"
      }
    }
  ]
}

第三步：作为领域专家，自由设计每个结果应包含的内容字段

你是这个领域的专家，请基于「用户最关心什么」来决定结果页的字段构成。

### 标准字段（按需选用，用 standard: true 标记）
这些字段有默认生成格式，全部可选，只选对这个主题有意义的：
- portrait：三段深度画像（必选）
- strengths：6条优势
- weaknesses：6条局限
- temperament：气质描述
- situation：核心张力
- lifeAdvice：给用户的行动建议
- destiny：诗意命运收尾

不要全选。对于标准字段，如果你认为默认格式对这个主题不够精准，可以额外提供 instruction 字段来覆盖默认写法。例如：
{ "key": "portrait", "label": "气质画像", "standard": true, "instruction": "三段，第一段描述测验者与这个国家的气质共鸣，第二段写具体行为联结，第三段写挑战与代价" }

### 自定义字段（可选，用 standard: false 标记，自行设计，≤2 个）
如果这个主题的用户有标准字段以外的核心关注点，可以增加自定义字段。
每个自定义字段需要提供：
- key：英文 camelCase 字段名
- label：显示给用户看的中文标题（4-8字）
- instruction：告诉 AI 这个字段写什么、写多少字（30-60字的说明）

示例（仅供参考，请根据实际主题决定）：
- 宝石测验可能有：{ key: "gemScene", label: "适合场景", instruction: "50字，描述这颗宝石最适合在什么场合佩戴、搭配什么风格" }
- 历史人物可能有：{ key: "keyQuote", label: "代表名言", instruction: "该人物最能代表其人生哲学的一句话，附简短说明" }
- 香水测验可能有：{ key: "scentProfile", label: "香气档案", instruction: "60字，描述这款香水的前中后调和整体香型特征" }

请根据「${topic}」这个主题，从用户视角出发，设计最合适的字段组合。

规则：
-【先选框架】scoringFamily 必须先判断清楚，再决定结果结构。不要一边说是 level-band，一边又设计成 8 个互相平行的人格原型。
- weighted-dimension：结果之间是并列的“谁更像谁”；不同结果必须靠 profileHints 组合拉开，而不是高低顺序。
- bipolar-dimension：dimensionSpecs 的 highDefinition / lowDefinition 必须构成真正对立；禁止把 lowPole 写成“只是更弱一点的 highPole”。
- level-band：results 必须能清楚排成从低到高的阶段序列；相邻结果是程度递进，而不是完全不同的人格阵营。results 数量建议 4-6 个，不宜过多。
-【关键约束】dimensionCount 和 questionCount 必须是纯整数（如 5、20），不能是字符串。dimensionCount 由主题复杂度和结果数量共同决定：通常4-6个，每2-3个结果需要1个独立维度（如8个结果 → 至少4个维度）。figure类型（同一作品人物）因天然共享背景，需取上限。questionCount 建议：简单主题12，中等16-20，复杂22-24，维度越多题目应越多。
- dimensions 数量必须与 dimensionCount 严格一致。weighted-dimension / bipolar-dimension 通常做 6-9 个结果；level-band 通常做 4-6 个结果。多个结果可以共享同一个 primaryDimension，但每个 primaryDimension 必须是 dimensions 数组里的某一项。
- 维度之间必须真正独立、正交，不能是同一特质的不同表述（如「理性」和「逻辑性」高度相关，不应同时作为维度）。
- dimensionSpecs 数量必须与 dimensions 严格一致，且顺序一一对应。每个维度必须写清 6 件事：名称、高分定义、低分定义、高分锚点、低分锚点、禁止误读。
- highDefinition / lowDefinition 必须写成“做决定时优先看什么、遇事时先保什么、为了什么可以付代价”的行为原则，不能只是“更成熟”“更有魅力”这种评价词。
- highAnchorResults / lowAnchorResults 必须从 results 里选，作为语义锚点。后续所有出题、profileHints、结果写作都必须与这些锚点一致。
- forbiddenInterpretations 必须明确写出这个维度不能被偷换成什么。例如：若维度是“公义优先”，则禁止误读成“有野心”“有立场”“行动果断”。
- resultType=figure 时：name 必须是真实人物，领域代表性强，不同人物人格差异显著，应覆盖不同性格倾向和背景（如性别、年代、风格）
- resultType=item 时：name 必须是该类别中真实存在的具体事物，选择依据是该事物的真实特性能映射特定人格
- resultType=archetype 时：name 是有质感的意象或角色名，不能叫「外向型」「理性型」
- profileHints 必须覆盖所有维度，high/medium/low 在不同原型之间要有明显差异，并且必须服从 dimensionSpecs 的高低定义与锚点，不可自行偷换维度含义`;

  const raw = await callAIImpl(system, user, 2500);
  const architecture = extractJSON(raw);
  // Models occasionally return numeric fields as strings — coerce before validation
  if (typeof architecture.dimensionCount === "string") architecture.dimensionCount = parseInt(architecture.dimensionCount, 10);
  if (typeof architecture.questionCount  === "string") architecture.questionCount  = parseInt(architecture.questionCount,  10);
  repairArchitectureAnchors(architecture);
  const errors = validateArchitecture(architecture);
  if (errors.length > 0) throw new Error(`Architecture invalid: ${errors.join("; ")}`);
  return architecture;
}

async function generateOutline(topic, architecture, hintBlock, callAIImpl = callAI) {
  const resultType = architecture && architecture.resultType || "archetype";
  const scoringFamily = architecture && architecture.scoringFamily || "weighted-dimension";
  const scoringFamilyGuide = formatScoringFamilyGuidance(scoringFamily);
  const archContext = architecture ? `
### 领域架构（Phase 0 已确定，必须以此为基础）
领域洞察：${architecture.domainInsight || ""}
评分框架：${scoringFamily}${scoringFamilyGuide ? `\n框架 guidance：${scoringFamilyGuide}` : ""}
结果类型：${{ figure: "代表人物（figure）", item: "具体事物（item）", archetype: "人格原型（archetype）" }[resultType] || resultType}
已确定维度：${(architecture.dimensions || []).join("、")}
维度语义锚点：
${formatDimensionSpecs(architecture.dimensionSpecs || [])}
已确定原型：
${(architecture.results || []).map(r =>
  `- 【${r.name}】（主导维度：${r.primaryDimension}）\n  背景：${r.nameContext || ""}\n  核心身份：${r.coreIdentity}\n  维度倾向：${JSON.stringify(r.profileHints || {})}`
).join("\n")}

你的任务是将上述原型转化为正式测验结构：
- title 以原型名称为核心${ resultType === "figure" ? "（可以是「林徽因式」或直接是人物名）" : resultType === "item" ? "（直接使用事物名称，如「柴犬」「攀岩」）" : "（如「翡翠」「猫系恋人」）" }
- token 是与该原型强关联的意象或象征物
${ resultType === "figure" ? "- verse 优先选该人物自己写的诗词或评价该人物的名句，若无合适则用现代引言" : resultType === "item" ? "- verse 是一句与该事物直接相关的 quote：可以是现代诗、科学家/作家/设计师的名言、电影台词、歌词、甚至一句能精准描绘该事物特质的文学句子——来源不限，但内容必须与该具体事物高度相关，禁止使用泛人生感怀的句子。除非主题明确涉及古典文化，否则禁止使用古诗词" : "- verse 是一句与该原型气质高度契合的 quote：优先选现代名言、电影台词、歌词、现代诗、作家金句，来源不限但必须贴合原型气质。除非主题明确涉及古典文化（如唐诗、宋词、古代人物），否则禁止使用古诗词" }
- dimension_profile 必须基于 profileHints 数值化（high=0.60-0.80，medium=0.30-0.55，low=0.08-0.25）
- 不要改变原型对应的维度划分和核心身份
` : "";

  const system = `你是一位微信小程序测验产品策划专家，同时对「${topic}」这个领域有深入的专业知识。你的任务是为一道新测验设计整体框架，包括维度体系和每个结果的精准权重分布。这个测验的结果可能是人格原型、真实人物、具体事物、国家、或适合程度段位——你必须完全遵循 Phase 0 确定的 resultType 和结果名称，不得擅自改为人格类型。

${LITERARY_GUIDE}

输出严格 JSON，不输出其他内容。`;

  const user = `请为以下测验生成完整框架：

主题：${topic}
${hintBlock}${archContext}
输出格式：
{
  "id": "kebab-case英文id，与主题语义对应",
  "title": "中文标题，20字以内。必须像正式成品标题，不可只是把主题改写成「X角色」「X测试」「X匹配」",
  "subtitle": "副标题，15字以内。必须点出用户为什么会想测，不可只是「找到你的剧中分身」「看看你像谁」这类空泛句",
  "eyebrow": "短标签，3-8字，英文或中文。要有世界观气质，不可只是泛泛的「角色测试」「权谋中的你」",
  "description": "测验介绍，80-120字，说清楚这个测验测什么、为什么有意义",
  "aestheticContext": "2-4句，描述题目应具备的氛围、场景感、意象来源。例如：「题目应发生在宋代文人的生活场景中：书房、酒楼、送别渡口、月夜独处。选项语言可带有词牌意象，但不能脱离真实人格选择。」后续题目和结果生成会直接使用这段描述约束场景风格。",
  "dimensions": ["维度A", "维度B", "维度C", "维度D"],
  "dimensionAxes": [
    {
      "dimension": "维度A",
      "axisLabel": "这个轴的分类名，2-4字，例如「词风」「处世」「情感」",
      "lowPole": "维度A的对立面，2-4字，代表低分端的特质，例如「婉约含蓄」",
      "insight": "描述这个维度高分端特质的一句洞察，30-50字，第二人称，具体描述这种性格倾向的表现和内在动因，语气温暖但不失锐度，禁止空泛夸奖"
    }
  ],
  "results": [
    {
      "id": "r1",
      "dimension": "维度A",
      "title": "结果标题，8字以内",
      "subtitle": "结果副标题，12字以内",
      "token": "象征物或象征词，4字以内",
      "verse": "见上方 verse 规则（优先现代名言/电影台词/歌词/现代诗，非古典主题禁止用古诗词）",
      "verseSource": "出处或作者"
    }
  ]
}

注意：dimension_profile 数值将由独立步骤生成，本步骤不需要输出。

规则：
- dimensions 和 dimensionAxes 数量相等（若 Phase 0 已给出，严格使用 Phase 0 的维度，数量以 Phase 0 为准）
- weighted-dimension / bipolar-dimension 的 results 通常 6-9 个；level-band 的 results 通常 4-6 个
- 如果 scoringFamily = level-band，results 必须按从低到高的阶段顺序排列，不能写成互不相干的平行人格
- 多个结果可以共享同一个 dimension；results越多则dimensions应越多（每2-3个结果需要1个独立维度）
- dimensionAxes 中每个 dimension 必须与 dimensions 数组里的值完全一致
- 每个 result 必须标注一个主导 dimension，id 从 r1 开始；多个 results 可以共享同一个 dimension
- 维度名称简洁，2-4字
- axisLabel 是这条轴的"类别名"，lowPole 是该维度的反面特质
- insight 必须是具体的、有画面感的描述，禁止套话如"你是个…的人"开头，禁止空洞形容词堆砌
- 若 Phase 0 提供了 dimensionSpecs，dimensionAxes 的语义必须与之严格一致，不能把某个维度偷偷改写成别的意思
- 不得违背 Phase 0 的高低定义、锚点人物和 forbiddenInterpretations；若某维度高分锚点是靖王、低分锚点是誉王，就不能在后续结构里把誉王写成该维度高分代表
- quiz 的 title / subtitle / eyebrow 必须认真分工：
  1. title 负责“成品感”和识别度，读起来像一个真正会被点开的测验标题
  2. subtitle 负责“心理钩子”，要点出用户想知道的自我映射，不可只是重复 title
  3. eyebrow 负责“世界观气质”，应来自该题材的核心氛围、关系张力或人物命运感
- 禁止使用过泛包装：
  1. title 禁止仅为「${topic}角色」「${topic}人物匹配」「${topic}测试」「你和${topic}哪个角色最相似」的轻微改写
  2. subtitle 禁止使用「找到你的剧中分身」「看看你像谁」「测出你的角色」等空泛模板
  3. eyebrow 禁止使用「角色测试」「角色原型测试」「权谋中的你」「江湖知己」等可套在任何作品上的词
- 结果要有辨识度，用户看到标题就能感知「这说的是我吗」`;

  const raw = await callAIImpl(system, user, 4500);
  const outline = normalizeOutlineToArchitecture(extractJSON(raw), architecture);
  const errors = validateOutlineStructure(outline, architecture);
  if (errors.length > 0) throw new Error(`Outline invalid: ${errors.join("; ")}`);
  return outline;
}

async function generateOutlineProfiles(outline, architecture, callAIImpl = callAI) {
  const dimensions = outline.dimensions;
  const results = outline.results;
  const archResults = architecture?.results || [];

  const resultLines = results.map((r, i) => {
    const archR = archResults[i] || {};
    const hints = archR.profileHints || {};
    return `- ${r.id}「${r.title}」  主导维度：${r.dimension}  参考倾向：${JSON.stringify(hints)}`;
  }).join("\n");

  const dimList = dimensions.map(d => `「${d}」`).join("、");
  const profileTemplate = results
    .map(r => `    "${r.id}": { ${dimensions.map(d => `"${d}": 0.00`).join(", ")} }`)
    .join(",\n");

  const system = `你是测验数据设计专家，专门为人格测验的结果设计精确的维度权重分布。输出严格 JSON，不输出其他内容。`;

  const user = `为以下测验结果设计 dimension_profile 数值。

维度（共 ${dimensions.length} 个）：${dimList}

各结果：
${resultLines}

输出格式：
{
  "profiles": {
${profileTemplate}
  }
}

设计规则：
1. 以"参考倾向"为起点：high → 0.60-0.80，medium → 0.30-0.55，low → 0.08-0.25。若参考倾向的维度名称与测验维度不完全一致，按主导维度和结果特质判断。
2. 每个结果在其主导维度上的值必须严格大于所有其他结果（唯一最高）——这是保证该结果数学上可达的必要条件。
3. 任意两个结果至少在一个维度上差距 ≥ 0.15。
4. 禁止任何维度值为 1.0 或 0.0。
5. 每个 profile 必须包含全部 ${dimensions.length} 个维度，key 与以下完全一致：${dimList}。
6. 输出前逐一核查：为每个结果找到它在所有结果中独占最高分的维度；若找不到，调整数值直到找到为止。`;

  const raw = await callAIImpl(system, user, 2000);
  const parsed = extractJSON(raw);
  if (!parsed?.profiles) throw new Error("Profile step: missing 'profiles' field");

  const missingIds = results.filter(r => !parsed.profiles[r.id]).map(r => r.id);
  if (missingIds.length > 0) throw new Error(`Profile step: missing profiles for ${missingIds.join(", ")}`);

  for (const result of results) {
    const profile = parsed.profiles[result.id];
    if (!profile) continue;

    // Count how many dimensions have actual numeric values (not fallback)
    const matched = dimensions.filter(d => typeof profile[d] === "number");
    if (matched.length < dimensions.length) {
      // Try case-insensitive / whitespace-stripped key lookup before falling back
      const normalised = {};
      for (const [k, v] of Object.entries(profile)) {
        normalised[k.trim().replace(/\s+/g, "")] = v;
      }
      const recheckMatched = dimensions.filter(d => typeof normalised[d.trim().replace(/\s+/g, "")] === "number");
      if (recheckMatched.length < Math.ceil(dimensions.length * 0.5)) {
        throw new Error(
          `Profile step: model returned wrong dimension keys for ${result.id}. ` +
          `Expected: ${dimensions.join(", ")}. Got: ${Object.keys(profile).join(", ")}`
        );
      }
      result.dimension_profile = {};
      for (const dim of dimensions) {
        const key = dim.trim().replace(/\s+/g, "");
        result.dimension_profile[dim] = typeof normalised[key] === "number" ? normalised[key] : 0.3;
      }
    } else {
      result.dimension_profile = {};
      for (const dim of dimensions) {
        result.dimension_profile[dim] = profile[dim];
      }
    }
  }

  // Sanity-check: if all profiles are identical (max pairwise diff = 0), the model
  // returned useless data — throw so the retry mechanism kicks in
  let maxDiff = 0;
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i].dimension_profile || {};
      const b = results[j].dimension_profile || {};
      for (const d of dimensions) {
        maxDiff = Math.max(maxDiff, Math.abs((a[d] || 0) - (b[d] || 0)));
      }
    }
  }
  if (maxDiff < 0.01) {
    throw new Error("Profile step: all profiles are identical — model likely returned wrong keys or zeroes");
  }
  return outline;
}

async function generateQuestions(outline, startId, endId, batchLabel, total, dataDir, callAIImpl = callAI) {
  const dimensions = outline.dimensions;
  const aestheticContext = formatAestheticContext(outline.aestheticContext);
  const count = endId - startId + 1;
  const dimensionSpecs = Array.isArray(outline.architectureDimensionSpecs) ? outline.architectureDimensionSpecs : [];
  const scoringFamily = outline.architectureScoringFamily || "weighted-dimension";
  const scoringFamilyGuide = formatScoringFamilyGuidance(scoringFamily);
  const dimensionSpecBlock = dimensionSpecs.length > 0
    ? `\n### 维度语义锚点（出题时必须严格服从）\n${formatDimensionSpecs(dimensionSpecs)}\n`
    : "";
  const scoringGuideBlock = `\n### 当前评分框架\n- scoringFamily: ${scoringFamily}\n- guidance: ${scoringFamilyGuide}\n`;
  const optionTemplateA = scoringFamily === "bipolar-dimension"
    ? `        { "id": "a", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2, "另一个维度": -1 } },`
    : `        { "id": "a", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } },`;
  const scoreRule = scoringFamily === "bipolar-dimension"
    ? "每个选项最多2个维度得分；允许负分，单维度范围 -2 到 2。只有在表达“朝 lowDefinition 一侧移动”时才使用负分，不能把负分当作惩罚项乱扣"
    : scoringFamily === "level-band"
      ? "每个选项最多2个维度得分，全部使用非负分。单维度范围 0 到 3；更成熟/更适配当前主题的选项，应拿到更高总分"
      : "每个选项最多2个维度得分，主维度≤2分，副维度≤1分，禁止负分";

  const system = `你是一位中文测验内容专家。你的任务是为微信小程序测验生成题目。

${LITERARY_GUIDE}
${aestheticContext}

### 输出格式
严格输出一个 JSON 对象，只包含 "questions" 字段（${count}道题的数组，id从q${startId}到q${endId}）。不要输出其他内容，直接输出 JSON。`;

  const user = `测验信息：
- 标题：${outline.title}
- 描述：${outline.description}
- 评分维度：${dimensions.join("、")}
${scoringGuideBlock}
${dimensionSpecBlock}

请生成 q${startId} 到 q${endId} 共${count}道题目（共${total}道题的第${batchLabel}批）。

输出格式：
{
  "questions": [
    {
      "id": "q${startId}",
      "text": "具体场景题目，不要宽泛问法",
      "options": [
${optionTemplateA}
        { "id": "b", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } },
        { "id": "c", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } },
        { "id": "d", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } }
      ]
    }
  ]
}

规则：
1. ${count}道全新场景题，场景必须契合测验的历史/文化/美学氛围。例如：唐诗场景下每道题要模拟经典古诗里的场景，诗词意境，人物情绪，背景氛围等
2. id 严格从 q${startId} 到 q${endId}，不能多也不能少
3. ${scoreRule}
4. scores 中的维度 key 必须与以下完全一致，不得缩写、拆分或改写：「${dimensions.join("」「")}」
5. 维度覆盖均衡：本批 ${count} 道题中，每个维度应大致均匀出现，避免某一维度题目过多而另一维度数据稀少。当前维度共 ${dimensions.length} 个，每个维度平均约 ${Math.round(count / dimensions.length * 10) / 10} 道题的信号量
6. 每道题的高分选项必须服从维度语义锚点，不能把某个维度偷换成“相近但不同”的概念。例如某维度若高分代表“公义优先”，则“索要官职谋私利”“只保自己”之类选项绝不能给这个维度高分
7. 如果 scoringFamily = level-band，四个选项的总分梯度必须明显拉开，保证最终能分出“低段位/中段位/高段位”
8. 如果 scoringFamily = bipolar-dimension，负分只能用来表示“朝 lowDefinition 一侧移动”；禁止出现“高低两边都给高分”的自相矛盾写法
9. 遵守 literary guide，列明的禁止句型一律不得出现`;

  const raw = await callAIImpl(system, user, 6000);
  fs.writeFileSync(path.join(dataDir, `${outline.id}.q${batchLabel}.raw.txt`), raw);

  const parsed = extractJSON(raw);
  if (!parsed.questions || parsed.questions.length < count)
    throw new Error(`Expected ${count} questions, got ${parsed.questions?.length ?? 0}`);
  return parsed.questions;
}

async function generateResults(outline, resultSubset, dataDir, callAIImpl = callAI) {
  const aestheticContext = formatAestheticContext(outline.aestheticContext);
  const stub = resultSubset.map(r => ({
    id: r.id, title: r.title, subtitle: r.subtitle,
    token: r.token, verse: r.verse, verseSource: r.verseSource,
  }));

  const resultType = outline.architectureResultType || "archetype";
  const scoringFamily = outline.architectureScoringFamily || "weighted-dimension";

  // resultFields from Phase 0: array of {key, label, standard, instruction?} objects
  // Fallback: defaults based on resultType
  const defaultFieldObjs = {
    item: [
      { key: "portrait",     label: "气质画像",   standard: true },
      { key: "strengths",    label: "核心优势",   standard: true },
      { key: "weaknesses",   label: "内在挑战",   standard: true },
      { key: "temperament",  label: "气质描述",   standard: true },
      { key: "situation",    label: "核心张力",   standard: true },
    ],
    figure: [
      { key: "portrait",     label: "人物画像",   standard: true },
      { key: "strengths",    label: "核心特质",   standard: true },
      { key: "weaknesses",   label: "内在局限",   standard: true },
      { key: "temperament",  label: "气质描述",   standard: true },
      { key: "situation",    label: "核心张力",   standard: true },
      { key: "lifeAdvice",   label: "人物寄语",   standard: true },
      { key: "destiny",      label: "命运收尾",   standard: true },
    ],
    archetype: [
      { key: "portrait",     label: "人格画像",   standard: true },
      { key: "strengths",    label: "核心优势",   standard: true },
      { key: "weaknesses",   label: "内在挑战",   standard: true },
      { key: "temperament",  label: "气质描述",   standard: true },
      { key: "situation",    label: "核心张力",   standard: true },
      { key: "lifeAdvice",   label: "成长建议",   standard: true },
      { key: "destiny",      label: "命运收尾",   standard: true },
    ],
  };

  // Normalize: Phase 0 may return array of objects or legacy array of strings
  const rawFields = outline.architectureResultFields;
  let resultFields;
  if (Array.isArray(rawFields) && rawFields.length > 0 && typeof rawFields[0] === "object") {
    resultFields = rawFields;
  } else {
    resultFields = defaultFieldObjs[resultType] || defaultFieldObjs.archetype;
  }

  const system = `你是一位中文测验内容专家，擅长写有深度、有辨识度的结果描述。结果可能是人格原型、真实人物、具体事物或适合程度段位，写作方式应与结果类型匹配，不要把所有结果都写成人格分析的口吻。

【字数硬约束】严格遵守每个字段的字数要求，不得超过上限。portrait 每段严格100-150字，三段共300-450字；strengths/weaknesses 每条 description 严格2句共40-60字；其他字段按格式说明控制。宁可精炼，不可冗长。

${LITERARY_GUIDE}
${aestheticContext}

### 输出格式
严格输出一个 JSON 对象，只包含 "results" 字段。不要输出其他内容，直接输出 JSON。`;

  const archResults = outline.architectureResults || [];
  const anchorLabel = { figure: "人物真实人格为准", item: "事物真实特性为准", archetype: "原型象征气质为准" }[resultType] || "原型气质为准";
  const figureContext = archResults.length > 0
    ? `\n### 各结果的原型锚点（请以此为核心写内容，${anchorLabel}）\n` +
      archResults.map(r => `- 主导维度「${r.primaryDimension}」→ 【${r.name}】：${r.nameContext || ""} / 核心：${r.coreIdentity || ""}`).join("\n")
    : "";

  // Build a compact summary of all OTHER results so the model can differentiate
  // even though it only writes one result per batch (R_BATCH_SIZE = 1).
  const siblingResults = outline.results.filter(r => !resultSubset.some(s => s.id === r.id));
  const siblingContext = siblingResults.length > 0
    ? `\n### 其他结果概览（本次不写这些，但你的文字必须与它们有显著区分）\n` +
      siblingResults.map(r => {
        const arch = archResults.find(a => a.name === r.title || a.conceptId === r.id);
        const identity = arch?.coreIdentity || r.subtitle || "";
        return `- 【${r.title}】主导维度「${r.dimension}」${identity ? `：${identity}` : ""}`;
      }).join("\n")
    : "";

  const hasField = key => resultFields.some(f => f.key === key);

  const portraitDepthGuide = hasField("portrait") ? `
## portrait 写作原则：让用户感到"被发现了"
portrait 是结果页最核心的内容，必须让用户读完产生"这说的就是我"的共鸣感。

### 每段字数要求
每段严格100-150字，三段合计300-450字。禁止写空洞的概括句，每一句都必须承载具体信息。

### 让用户"被发现"的写法技巧
1. **命名内在体验**：说出用户感受到但从未能表达的内心状态。不写"你很敏感"，写"你常常在人群散去之后才意识到自己其实很疲惫，但你很少在当下说出来"。
2. **具体行为细节**：用可视化的场景描述，不写"你注重细节"，写"你会在别人觉得差不多的时候再检查一遍，哪怕已经没有人要求你这样做"。
3. **说出矛盾与代价**：不只写优点，也要说出这种气质在现实中造成的摩擦和孤独感，让用户感到被理解而非被夸奖。
4. **第二人称，assertive语气**：不是"这种人格的人往往……"，而是直接对用户说"你……"。
5. **禁止套话**：不用"你是一个xxx的人""你拥有xxx的特质"这种句式开头；不写"在人生的旅途中"之类的空泛过渡。` : "";

  const portraitStructure = {
    item: `## 结构：以人格匹配为核心，而非介绍事物本身
- portrait【第一段，100-150字】：描述测验者身上哪些具体特质——不是标签，而是行为场景和内在体验——让他们与这个结果产生联结。写得让用户感到"这说的是我"。
- portrait【第二段，100-150字】：将这个结果（事物/国家/地方）的文化或精神特质与用户的内在世界对应起来——不是介绍它，而是解释为什么它们之间会产生共鸣，这种共鸣是什么质地的。
- portrait【第三段，100-150字】：写出这种匹配在现实中的张力——用户在这里/与这个事物相遇会获得什么，同时又要承担什么代价或面对什么挑战。`,
    figure: `## 结构：先介绍人物，再写人格共鸣
- portrait【第一段，100-150字】：介绍人物的真实生平与历史定位——代表事件、名言警句、所处时代的重量。让读者感受到这个人的存在感和历史厚度。
- portrait【第二段，100-150字】：写这个人物的内在气质与处世哲学——他/她如何面对命运、做出选择、处理关系，以及他们身上哪些东西让后人反复回望。
- portrait【第三段，100-150字】：用"被发现了"的方式写用户与此人的精神共鸣——命名用户继承了此人的哪种内在结构，以及这种结构带来的未竟之事或无法解决的命题。`,
    archetype: `## 结构：先介绍原型，再写人格共鸣
- portrait【第一段，100-150字】：介绍这个原型/角色的来源、形象、在神话/文学/文化中的象征意义。即使用户不熟悉，读完也能感受到它的独特魅力。
- portrait【第二段，100-150字】：从这个原型的象征气质出发，用具体行为场景描述拥有此人格的人——不是说他们"很xxx"，而是说他们在具体情境下会怎么做、怎么感受、怎么被他人误解。
- portrait【第三段，100-150字】：写出这种原型气质的张力与局限，以及它赋予用户的核心命题——他们终其一生在与什么较劲？`,
  };

  const swGuide = (hasField("strengths") || hasField("weaknesses")) ? ({
    item: `- strengths label：必须从该事物的真实物理/文化特质提炼（如「折射万千」「压力成型」「历久弥新」），description 再延伸到人格含义。
- weaknesses label：同样来自事物特质的阴影面（如「易碎于冲击」「光芒招觊觎」），description 写出这在人际或自我认知中的代价。
- 禁止使用通用人格标签（如"共情力强""行动力强""情绪稳定"）作为 label。`,
    figure: `- strengths/weaknesses label：基于该人物历史上真实展现的特质，用该人物的标志性意象提炼，而非抽象人格词汇。`,
    archetype: `- strengths/weaknesses label：带有该原型/角色的独特意象，不使用完全通用的人格词汇。`,
  }[resultType] || "") : "";

  const quoteGuide = resultFields.some(f => f.key === "keyQuote") ? `
- 如果输出 extras 里的 keyQuote，且 label 是「代表名言」，content 必须像真实引言：优先直接引用原话，并带引号、书名号、破折号作者/出处中的至少一种格式特征。
- 如果你拿不准该人物是否有明确可考的名言，不要伪造“名言式总结”；请把 label 改成「精神注脚」或「人物侧写」，content 改写为概括性说明。` : "";

  const contentGuide = [
    portraitDepthGuide,
    hasField("portrait") ? (portraitStructure[resultType] || "") : "",
    swGuide,
    quoteGuide,
  ].filter(Boolean).join("\n\n");

  const user = `测验：${outline.title}（结果类型：${resultType}，评分框架：${scoringFamily}）
维度：${outline.dimensions.join("、")}
${figureContext}${siblingContext}

${contentGuide}

【严格约束】本次只需生成以下 ${stub.length} 个结果，不要生成其他结果：
${JSON.stringify(stub, null, 2)}

每个结果的输出格式（严格遵守，字段名和数据类型不得更改）：
${buildResultTemplate(resultFields, resultType)}

规则：
- 只生成上方 ${stub.length} 个结果，不多不少。
- 只生成格式中出现的字段，不要添加其他字段。
- strengths 和 weaknesses 必须是对象数组，每项必须有 "label"（3-5字）和 "description"（2句话）两个字段，不能是纯字符串数组。
- lifeAdvice 必须是字符串（string），不能是数组。
- portrait 必须是三段结构；如果不是三段，就视为不合格。
- 不同结果的 dimension_profile 虽然由 Phase 1 决定，但你的文字必须强化区分度，不能把两个结果写成只有措辞不同、人格几乎一样。
- 遵守 literary guide，禁止出现被列明的句型。`;

  const raw = await callAIImpl(system, user, 10000);
  const label = stub.map(r => r.id).join("-");
  const rawPath = path.join(dataDir, `${outline.id}.r${label}.raw.txt`);
  fs.writeFileSync(rawPath, raw);
  console.log(`     [dbg] raw response: ${raw.length} chars`);

  let parsed;
  try {
    parsed = extractJSON(raw);
  } catch (e) {
    throw new Error(`JSON parse failed (raw saved to ${path.basename(rawPath)}): ${e.message}`);
  }
  if (!parsed.results) {
    if (parsed.id && (parsed.portrait || parsed.strengths)) {
      console.log(`     [dbg] model returned single object, wrapping in array`);
      parsed = { results: [parsed] };
    } else if (Array.isArray(parsed)) {
      console.log(`     [dbg] model returned bare array, wrapping`);
      parsed = { results: parsed };
    }
  }
  if (!parsed.results || parsed.results.length === 0)
    throw new Error(`No results returned (raw saved to ${path.basename(rawPath)})`);

  console.log(`     [dbg] model returned ${parsed.results.length} result(s), requested ${resultSubset.length} (${stub.map(r => r.id).join(",")})`);

  // Keep only the results that were requested in this batch to prevent duplicates
  const subsetIds = new Set(resultSubset.map(r => r.id));
  const filtered = parsed.results.filter(r => subsetIds.has(r.id));
  if (filtered.length === 0) {
    throw new Error(
      `None of the returned result IDs matched requested [${[...subsetIds].join(",")}]. ` +
      `Got: [${parsed.results.map(r => r.id).join(",")}]. Raw saved to ${path.basename(rawPath)}`
    );
  }
  if (filtered.length !== parsed.results.length) {
    console.log(`     [dbg] filtered ${parsed.results.length} → ${filtered.length} result(s) by subset IDs`);
  }
  return filtered;
}

module.exports = {
  inferHintsFromTopic, buildResultTemplate,
  generateArchitecture, generateOutline, generateOutlineProfiles, generateQuestions, generateResults,
  PORTRAIT_TEMPLATE_BY_TYPE, STANDARD_FIELD_TEMPLATES,
};
