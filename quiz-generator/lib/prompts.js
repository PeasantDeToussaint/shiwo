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

async function generateArchitecture(topic, hintBlock) {
  const system = `你是「${topic}」领域的资深专家。你的任务是为一道微信小程序测验设计结果架构——决定测验应该输出哪些结果、为什么这样划分、每个结果的核心定位是什么。

这个测验不一定是人格测验。结果可能是：具体国家/城市/事物（item 类）、适合程度的不同段位（archetype 类但以程度命名）、真实人物（figure 类）、或有象征意味的人格原型（archetype 类）。你需要先判断这个测验属于哪种类型，再基于该类型设计结果，而不是一律套用「人格原型」框架。

这一步只关注概念和结构，不写任何正文内容。输出严格 JSON，不输出其他内容。`;

  const user = `请为以下测验设计原型架构：

主题：${topic}
${hintBlock}
第一步：判断这个测验适合哪种结果类型
- resultType = "figure"：题目明确涉及某类具体人物（如「民国女性」「宋词词人」「文艺复兴画家」），每个结果对应一个真实存在的代表人物
- resultType = "item"：结果是真实存在的具体事物或地点。包括「你适合什么X」类型，也包括主题说明中明确指定了结果类别的情况（如「包含多个国家」「包含多个城市」「包含以下几种食物」）——只要结果是真实存在的具体事物，就选 item
- resultType = "archetype"：题目是抽象人格映射（如「你是哪种宝石」「你的恋爱风格」），结果是有象征意味的原型名称，侧重人格隐喻而非真实事物特性

【重要】如果主题或约束中明确说明结果应该是某类真实事物（国家、城市、食物、运动等），必须选 item，不能选 archetype。

第二步：基于领域知识设计维度和原型

resultFields 说明：portrait 必选，其余标准字段按需选用，自定义字段 ≤2 个。以下格式仅供参考，实际字段由你在第三步决定。

输出格式：
{
  "domainInsight": "4-6句，说明这个主题最核心的人格分化轴是什么，为什么这样划分比其他方式更准确",
  "resultType": "figure、item 或 archetype 三选一",
  "resultFields": [
    { "key": "portrait", "label": "气质画像", "standard": true },
    { "key": "lifeAdvice", "label": "行动建议", "standard": true },
    { "key": "customFieldKey", "label": "自定义标题", "standard": false, "instruction": "说明这个字段写什么、写多少字" }
  ],
  "dimensionCount": "你决定的维度数量，整数。由你根据主题复杂度决定，通常为2-5个",
  "questionCount": "你决定的题目数量，整数，建议范围：简单主题12题，中等主题16-20题，复杂多维主题22-24题",
  "dimensions": ["维度1", "维度2", "更多维度按需补足，必须与dimensionCount数量一致。每个维度名称必须2-4字，不要用与/和连接两个概念"],
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

### 两个或以上自定义字段（用 standard: false 标记，自行设计）
如果这个主题的用户有标准字段以外的核心关注点，可以增加自定义字段。
每个自定义字段需要提供：
- key：英文 camelCase 字段名
- label：显示给用户看的中文标题（4-8字）
- instruction：告诉 AI 这个字段写什么、写多少字30-60字的说明）

示例（仅供参考，请根据实际主题决定）：
- 宝石测验可能有：{ key: "gemScene", label: "适合场景", instruction: "50字，描述这颗宝石最适合在什么场合佩戴、搭配什么风格" }
- 历史人物可能有：{ key: "keyQuote", label: "代表名言", instruction: "该人物最能代表其人生哲学的一句话，附简短说明" }
- 香水测验可能有：{ key: "scentProfile", label: "香气档案", instruction: "60字，描述这款香水的前中后调和整体香型特征" }

请根据「${topic}」这个主题，从用户视角出发，设计最合适的字段组合。

规则：
-【关键约束】dimensionCount 由你根据主题复杂度决定；dimensions 数量必须与 dimensionCount 严格一致。results 是6-9个（视主题而定），与 dimensions 数量无关。多个结果可以共享同一个 primaryDimension。每个 primaryDimension 必须是 dimensions 数组里的某一项。
- 维度数量不要机械固定；重点是维度彼此独立、可解释，并且足以区分这些结果。简单主题可用2个，复杂主题可到5个。
- resultType=figure 时：name 必须是真实人物，领域代表性强，不同人物人格差异显著，应覆盖不同性格倾向和背景（如性别、年代、风格）
- resultType=item 时：name 必须是该类别中真实存在的具体事物，选择依据是该事物的真实特性能映射特定人格
- resultType=archetype 时：name 是有质感的意象或角色名，不能叫「外向型」「理性型」
- profileHints 必须覆盖所有维度，high/medium/low 在不同原型之间要有明显差异`;

  const raw = await callAI(system, user, 2500);
  const architecture = extractJSON(raw);
  const errors = validateArchitecture(architecture);
  if (errors.length > 0) throw new Error(`Architecture invalid: ${errors.join("; ")}`);
  return architecture;
}

async function generateOutline(topic, architecture, hintBlock) {
  const resultType = architecture && architecture.resultType || "archetype";
  const archContext = architecture ? `
### 领域架构（Phase 0 已确定，必须以此为基础）
领域洞察：${architecture.domainInsight || ""}
结果类型：${{ figure: "代表人物（figure）", item: "具体事物（item）", archetype: "人格原型（archetype）" }[resultType] || resultType}
已确定维度：${(architecture.dimensions || []).join("、")}
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
  "title": "中文标题，20字以内",
  "subtitle": "副标题，口语感，15字以内",
  "eyebrow": "短标签，3-8字，英文或中文",
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
      "verseSource": "出处或作者",
      "dimension_profile": {
        "维度A": 0.0,
        "维度B": 0.0,
        "更多维度按已确定 dimensions 继续补齐，必须覆盖所有维度": 0.0
      }
    }
  ]
}

规则：
- dimensions 和 dimensionAxes 数量相等（若 Phase 0 已给出，严格使用 Phase 0 的维度，数量以 Phase 0 为准）
- results 数量 6-9个，与 dimensions 数量无关，多个结果可以共享同一个 dimension
- dimensionAxes 中每个 dimension 必须与 dimensions 数组里的值完全一致
- 每个 result 必须标注一个主导 dimension，id 从 r1 开始；多个 results 可以共享同一个 dimension
- 维度名称简洁，2-4字
- axisLabel 是这条轴的"类别名"，lowPole 是该维度的反面特质
- insight 必须是具体的、有画面感的描述，禁止套话如"你是个…的人"开头，禁止空洞形容词堆砌
- 结果要有辨识度，用户看到标题就能感知「这说的是我吗」

dimension_profile 规则（这是最重要的部分，直接决定结果准确性）：
- 若 Phase 0 提供了 profileHints（high/medium/low），必须以此为基础转换为数值：high=0.60-0.80，medium=0.30-0.55，low=0.08-0.25
- 所有维度都必须出现在每个 profile 中，key 与 dimensions 完全一致
- 禁止任何维度设为 1.0 或 0.0（避免极端化）
- 不同结果的 profile 必须有显著差异，确保每个结果在某几个维度上有独特的高低组合
- 任意两个结果至少要在一个维度上拉开 ≥0.15 的差距；如果两个结果 profile 很像，必须主动重写其中一个
- profile 设计完成后自我检验：是否有两个结果过于相似？是否会导致大多数用户聚集在同一个结果？`;

  const raw = await callAI(system, user, 4500);
  const outline = normalizeOutlineToArchitecture(extractJSON(raw), architecture);
  if (outline.dimensions && outline.results) {
    spreadProfiles(outline.results, outline.dimensions);
  }
  const errors = validateOutlineStructure(outline, architecture);
  if (errors.length > 0) throw new Error(`Outline invalid: ${errors.join("; ")}`);
  return outline;
}

async function generateQuestions(outline, startId, endId, batchLabel, total, dataDir) {
  const dimensions = outline.dimensions;
  const aestheticContext = formatAestheticContext(outline.aestheticContext);
  const count = endId - startId + 1;

  const system = `你是一位中文人格测验内容专家。你的任务是为微信小程序人格测验生成题目。

${LITERARY_GUIDE}
${aestheticContext}

### 输出格式
严格输出一个 JSON 对象，只包含 "questions" 字段（${count}道题的数组，id从q${startId}到q${endId}）。不要输出其他内容，直接输出 JSON。`;

  const user = `测验信息：
- 标题：${outline.title}
- 描述：${outline.description}
- 评分维度：${dimensions.join("、")}

请生成 q${startId} 到 q${endId} 共${count}道题目（共${total}道题的第${batchLabel}批）。

输出格式：
{
  "questions": [
    {
      "id": "q${startId}",
      "text": "具体场景题目，不要宽泛问法",
      "options": [
        { "id": "a", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } },
        { "id": "b", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } },
        { "id": "c", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } },
        { "id": "d", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 2 } }
      ]
    }
  ]
}

规则：
1. ${count}道全新场景题，场景必须契合测验的历史/文化/美学氛围,例如：唐诗场景下每道题要模拟经典古诗里的场景，诗词意境，人物情绪，背景氛围等
2. id 严格从 q${startId} 到 q${endId}，不能多也不能少
3. 每个选项最多2个维度得分，主维度≤2分，副维度≤1分
4. scores 中的维度 key 必须与以下完全一致，不得缩写、拆分或改写：「${dimensions.join("」「")}」
5. 遵守 literary guide，禁止句型不能出现`;

  const raw = await callAI(system, user, 6000);
  fs.writeFileSync(path.join(dataDir, `${outline.id}.q${batchLabel}.raw.txt`), raw);

  const parsed = extractJSON(raw);
  if (!parsed.questions || parsed.questions.length < count)
    throw new Error(`Expected ${count} questions, got ${parsed.questions?.length ?? 0}`);
  return parsed.questions;
}

async function generateResults(outline, resultSubset, dataDir) {
  const aestheticContext = formatAestheticContext(outline.aestheticContext);
  const stub = resultSubset.map(r => ({
    id: r.id, title: r.title, subtitle: r.subtitle,
    token: r.token, verse: r.verse, verseSource: r.verseSource,
  }));

  const resultType = outline.architectureResultType || "archetype";

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

  const user = `测验：${outline.title}（结果类型：${resultType}）
维度：${outline.dimensions.join("、")}
${figureContext}

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

  const raw = await callAI(system, user, 10000);
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
    console.warn(`     [dbg] ⚠ none of the returned IDs matched requested — falling back to first ${resultSubset.length}. Got: ${parsed.results.map(r=>r.id).join(",")}`);
    return parsed.results.slice(0, resultSubset.length);
  }
  if (filtered.length !== parsed.results.length) {
    console.log(`     [dbg] filtered ${parsed.results.length} → ${filtered.length} result(s) by subset IDs`);
  }
  return filtered;
}

module.exports = {
  inferHintsFromTopic, buildResultTemplate,
  generateArchitecture, generateOutline, generateQuestions, generateResults,
  PORTRAIT_TEMPLATE_BY_TYPE, STANDARD_FIELD_TEMPLATES,
};
