#!/usr/bin/env node
/**
 * rewrite-all-quizzes.js
 *
 * Rewrites questions (22 total) + results for all available generic quizzes
 * using DeepSeek, following the house literary guide.
 *
 * Usage:
 *   node scripts/rewrite-all-quizzes.js             # full run
 *   node scripts/rewrite-all-quizzes.js --dry-run   # rewrite only, skip upload
 *   node scripts/rewrite-all-quizzes.js --id=which-tang-poet-lives-in-your-heart  # single quiz
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// ── Load .env ──────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}

const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const APPID         = process.env.WX_APPID;
const APPSECRET     = process.env.WX_APPSECRET;
const ENV_ID        = process.env.WX_CLOUD_ENV || "cloudbase-4gadl6qo4a9aa95d";
const PROVIDER      = DEEPSEEK_KEY ? "deepseek" : ANTHROPIC_KEY ? "anthropic" : GEMINI_KEY ? "gemini" : null;

const ARGS    = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const ID_ARG  = (ARGS.find(a => a.startsWith("--id="))  || "").replace("--id=",  "");
const IDS_ARG = (ARGS.find(a => a.startsWith("--ids=")) || "").replace("--ids=", "");
const TAG_ARG = (ARGS.find(a => a.startsWith("--tag=")) || "").replace("--tag=", "");

const DATA_DIR      = path.resolve(__dirname, "data");
const PROGRESS_FILE = path.resolve(__dirname, `rewrite-progress${TAG_ARG ? "-" + TAG_ARG : ""}.json`);

if (!PROVIDER) { console.error("❌  No AI API key in .env"); process.exit(1); }

// ── Target quizzes ─────────────────────────────────────────────
const TARGET_IDS = [
  "gaibang-role-play",
  "game-of-thrones-character-analogy",
  "investment-master-style",
  "ming-dynasty-role-play",
  "mythical-creature-within",
  "rebirth-journey-to-the-west-monarch",
  "republican-era-business-mindset",
  "what-pet-fits-you",
  "which-ancient-greek-philosopher-resonates-with-you",
  "which-japanese-sengoku-daimyo-are-you",
  "which-literary-giant-are-you",
  "which-sport-fits-your-release",
  // "which-tang-poet-lives-in-your-heart",  // hand-written, skip
  "your-aesthetic-and-which-painter",
];

// ── Literary guide (injected into every prompt) ────────────────
const LITERARY_GUIDE = `
## 文案风格指南

### 参考标准
对标 16personalities.com 的中文描述风格：直接、具体、不辩解、不堆砌。

示例（好的写法）：
- "你勇于探索现实世界，受旺盛的好奇心驱使，一心探究事物的运作原理。"
- "你独具慧眼，天赋异禀，对复杂系统有着深刻理解。"
- 强项：「压力下冷静——在紧张或危机时刻，你能保持镇定，确保思路清晰和工作高效。」
- 弱项：「不擅长规划——制定计划让你感到受束缚，容易导致任务拖延和进步缓慢。」

### 一、绝对禁止的句型（AI腔）
**否定平行结构**
- "这不仅是X，更是Y" / "不只是X，而是Y"（试图赋予平凡事物深刻意义）
- "这不是...，而是..."（防御性开脱）
- 禁止例：「这不仅是一次测验，更是一次自我发现的旅程。」

**虚假范围**
- "从X到Y"（X和Y牛头不对马嘴，或从具体到抽象的硬凑）
- 禁止例：「从日常选择的工具，到人格深处的艺术表达。」

**说教式免责**
- "值得注意的是..." / "重要的是要记住..." / "需要指出的是..."
- 任何像教科书一样指导读者该怎么想的句式

**模糊归因**
- "一些人认为..." / "观察者指出..." / "批评者认为..."（不指名道姓的假引用）

**三段式排比升华**
- 连续列举三个并列形容词或短语充数
- 禁止例：「它融合了历史的深度、文化的丰富性与现代的活力。」

**僵化结尾**
- "总的来说..." / "综上所述..." / "整体而言..."
- 任何像小作文最后一段的"升华"句

**其他AI腔**
- "你不是...，而是/只是..."
- "你...比大多数人..."（靠比较定义人）
- "这是你...的必然代价"（公式化结尾）
- "这源于你对...的深刻理解"
- "你会在...的瞬间，选择..."（造作假设情境）
- "够了" / "这已经够了"（廉价煽情）
- 连续堆砌四字成语（3个以上叠加）

### 二、格式禁令
- 禁止输出 Markdown 标记（##、**、*、- 列表符号等不得出现在文案正文里）
- 禁止使用 emoji
- 禁止破折号过度插入（一段话里最多一处补述破折号）
- portrait/temperament/situation/lifeAdvice/destiny 全部输出纯文本，不加任何标题或标签

### 三、Portrait 写法（三段，每段100-130字）
1. 第一段：开门见山，直接定性。一两句具体的行为观察切入，不铺垫背景。展开核心特质，写实写活。
2. 第二段：展开一个最有辨识度的维度，写实、写活、写具体。可以写独立性、行事方式或内在驱动力。
3. 第三段：正面写出这个人格的局限与处境——在哪些情境下会卡住、承受什么压力、面对什么矛盾。不给答案，不安慰，但要写得具体，不能只是模糊留白。
禁止用"总的来说"、"综上"、"整体而言"收尾。

### 四、强项/弱项写法
- 数量：强项6个，弱项6个
- 标签（label）：3-5字，用能力或行为描述，不用形容词堆砌
  好：「快速排查问题」「压力下冷静」「实践操作」
  差：「独立自主的天性」「深刻的洞察力」
- 描述（description）：1-2句，直接点出这个特质在现实中的表现和影响，不解释来源，不道歉
  好：「重复或单调的任务容易让你失去兴趣，导致拖延和效率下降。」
  差：「你会在重复的环境中感到窒息，这是你追求新鲜感的必然代价。」

### 五、题目要求
- 场景具体、生活化，避免"你会怎么做？"这种宽泛问法
- 每个选项代表一种真实的思维方式或行为倾向，不是对错之分
- reaction 字段：选完后显示的短句，2-10字，有性格，不说废话
  好：「万一出了问题，我得能接得住。」「沟通是为了推进，不是为了完美。」
`;

// ── HTTP helpers ───────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    }).on("error", reject);
  });
}

function httpPost(url, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...extraHeaders },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── AI call ────────────────────────────────────────────────────
async function callAI(systemPrompt, userPrompt) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: userPrompt   },
  ];

  if (PROVIDER === "deepseek") {
    const res = await httpPost(
      "https://api.deepseek.com/chat/completions",
      { model: "deepseek-chat", max_tokens: 8000, temperature: 0.8, messages, stream: false },
      { "Authorization": `Bearer ${DEEPSEEK_KEY}` }
    );
    if (res.error) throw new Error(`DeepSeek: ${res.error.message}`);
    return res.choices[0].message.content;
  }

  if (PROVIDER === "anthropic") {
    const res = await httpPost(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-opus-4-5", max_tokens: 8000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
      { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }
    );
    if (res.error) throw new Error(`Anthropic: ${res.error.message}`);
    return res.content[0].text;
  }

  if (PROVIDER === "gemini") {
    const res = await httpPost(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }], generationConfig: { maxOutputTokens: 8000, temperature: 0.8 } }
    );
    if (res.error) throw new Error(`Gemini: ${res.error.message}`);
    return res.candidates[0].content.parts[0].text;
  }
}

// ── Fix mismatched brackets ({...] or [...}) ───────────────────
function fixBracketMismatches(str) {
  const stack = [];
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === "\\" && inString) { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) { result += c; continue; }

    if (c === "{" || c === "[") {
      stack.push(c); result += c;
    } else if (c === "}" || c === "]") {
      if (stack.length > 0) {
        const expected = stack[stack.length - 1] === "{" ? "}" : "]";
        result += expected; // use expected closer, not what AI wrote
        stack.pop();
      } else {
        result += c;
      }
    } else {
      result += c;
    }
  }
  return result;
}

// ── JSON extraction + repair ────────────────────────────────────
function repairJSON(str) {
  let result = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] !== '"') { result += str[i++]; continue; }
    result += '"'; i++;
    while (i < str.length) {
      if (str[i] === "\\") {
        result += str[i] + (str[i + 1] || "");
        i += 2; continue;
      }
      if (str[i] === '"') {
        // Peek ahead to decide if this closes the string
        let j = i + 1;
        while (j < str.length && str[j] === " ") j++;
        const next = str[j];
        if (next === ":" || next === "," || next === "}" || next === "]" || next === "\n" || next === "\r") {
          result += '"'; i++; break;
        }
        result += '\\"'; i++;
      } else {
        result += str[i++];
      }
    }
  }
  return result;
}

function extractJSON(raw) {
  let match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = match ? match[1].trim() : raw.trim();

  const start = jsonStr.indexOf("{");
  const end   = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  jsonStr = jsonStr.slice(start, end + 1);

  // Fix curly quotes
  jsonStr = jsonStr
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // Fix missing opening quote on known string fields:
  //   "reaction":text", → "reaction":"text",
  const STRING_FIELDS = [
    "reaction","text","label","description","portrait",
    "temperament","situation","lifeAdvice","destiny",
    "token","verse","verseSource","boldQuote","title","subtitle",
  ];
  for (const f of STRING_FIELDS) {
    // Matches: "field": non-quote-char ... closing-quote
    // Only fires when the value is missing its opening quote
    const re = new RegExp(`("${f}"\\s*:\\s*)([^"\\s{\\[\\d\\-ntf][^"\\n]*?)(")`, "g");
    jsonStr = jsonStr.replace(re, '$1"$2$3');
  }

  // Try direct parse first
  try { return JSON.parse(jsonStr); } catch (_) {}

  // Try bracket-mismatch fix
  try { return JSON.parse(fixBracketMismatches(jsonStr)); } catch (_) {}

  // Try quote repair
  try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

  // Try both fixes combined
  try { return JSON.parse(repairJSON(fixBracketMismatches(jsonStr))); } catch (e) {
    throw new Error(`JSON parse failed after repair: ${e.message}`);
  }
}

// ── Simplify overly complex dimension names ────────────────────
function simplifyDimensions(quiz) {
  // Map of known complex → simple replacements
  const simplifyMap = {
    "豪放不羁": "豪放", "沉郁顿挫": "沉郁", "清丽自然": "清丽",
    "雄奇险怪": "奇崛", "恬淡隐逸": "恬淡", "华美秾丽": "华美",
    "天马行空": "天马", "功利主义": "功利", "理想主义": "理想",
    "现实主义": "现实", "浪漫主义": "浪漫", "集体主义": "集体",
    "个人主义": "个体",
  };

  const changed = {};
  quiz.scoring.dimensions = quiz.scoring.dimensions.map(d => {
    if (simplifyMap[d]) { changed[d] = simplifyMap[d]; return simplifyMap[d]; }
    // Also shorten anything longer than 4 chars that ends in 主义/风格/精神/气质
    if (d.length > 4 && /[主义风格精神气质]$/.test(d)) {
      const short = d.slice(0, 2);
      changed[d] = short;
      return short;
    }
    return d;
  });

  if (Object.keys(changed).length === 0) return quiz; // nothing changed

  // Rename keys in all option scores
  quiz.questions.forEach(q => {
    (q.options || []).forEach(o => {
      if (!o.scores) return;
      const s = {};
      Object.entries(o.scores).forEach(([k, v]) => { s[changed[k] || k] = v; });
      o.scores = s;
    });
    if (q.sliderScores) {
      const s = {};
      Object.entries(q.sliderScores).forEach(([k, v]) => { s[changed[k] || k] = v; });
      q.sliderScores = s;
    }
  });

  // Rename keys in dimension_profiles
  quiz.results.forEach(r => {
    if (!r.dimension_profile) return;
    const p = {};
    Object.entries(r.dimension_profile).forEach(([k, v]) => { p[changed[k] || k] = v; });
    r.dimension_profile = p;
  });

  console.log(`  📐  Simplified dimensions: ${Object.entries(changed).map(([a,b]) => a+"→"+b).join(", ")}`);
  return quiz;
}

// ── Extract quiz aesthetic context from metadata ───────────────
function extractAestheticContext(quiz) {
  const hints = [];

  // From tags
  if (quiz.tags?.length) hints.push(`标签：${quiz.tags.join("、")}`);

  // From eyebrow / featureId
  if (quiz.eyebrow) hints.push(`风格定位：${quiz.eyebrow}`);

  // Infer atmosphere from title and description
  const text = (quiz.title || "") + " " + (quiz.description || "");

  if (/古希腊|哲学|苏格拉底|柏拉图|亚里士多德/.test(text))
    hints.push("场景应带有古希腊哲学氛围：辩论、广场、自然探索、理性与感性的张力");
  if (/战国|诸侯|日本|武将|武士/.test(text))
    hints.push("场景应带有战国时代氛围：战场、谋略、忠义、生死抉择");
  if (/明朝|明代|宫廷/.test(text))
    hints.push("场景应带有明朝历史氛围：朝堂、江湖、锦衣卫、党争、民间");
  if (/红楼|贾府|大观园/.test(text))
    hints.push("场景应带有红楼梦氛围：诗词、情感、家族兴衰、园林");
  if (/丐帮|武侠|江湖/.test(text))
    hints.push("场景应带有武侠江湖氛围：义气、门派、行走天下、是非恩怨");
  if (/西游|妖怪|神话/.test(text))
    hints.push("场景应带有神话奇幻氛围：洞府、法宝、天庭、人间善恶");
  if (/文学|作家|写作|诗/.test(text))
    hints.push("场景应带有文学创作氛围：写作状态、灵感、语言、表达方式");
  if (/画家|审美|艺术|绘画/.test(text))
    hints.push("场景应带有视觉艺术氛围：色彩、构图、美的标准、创作与欣赏");
  if (/投资|股票|金融|商业/.test(text))
    hints.push("场景应带有投资决策氛围：风险、市场、资产、长短期思维");
  if (/运动|锻炼|健身/.test(text))
    hints.push("场景应带有体育运动氛围：训练、竞技、团队、突破极限");
  if (/宠物|动物/.test(text))
    hints.push("场景应带有日常生活氛围：人与动物的相处、性格映射");
  if (/权力的游戏|王座|政治|权谋/.test(text))
    hints.push("场景应带有权力政治氛围：联盟、背叛、王权、生存策略");
  if (/民国|商道|商人/.test(text))
    hints.push("场景应带有民国商业氛围：乱世经营、诚信、算计、人情往来");
  if (/唐诗|诗人|盛唐/.test(text))
    hints.push("场景应带有唐诗古典氛围：月色、送别、山林、饮酒、边塞、意象");

  return hints.length > 0
    ? `\n### 这道测验的氛围与场景要求\n${hints.join("\n")}\n题目场景必须契合上述氛围，不能写成通用的现代职场或生活题。`
    : "";
}

// ── Build prompts (split into two calls) ──────────────────────
// batch: "A" = q1-q11, "B" = q12-q22
function buildQuestionsPrompt(quiz, batch = "A") {
  const dimensions = quiz.scoring.dimensions;
  const aestheticContext = extractAestheticContext(quiz);
  const isA = batch === "A";
  const startId = isA ? 1 : 12;
  const endId   = isA ? 11 : 22;
  const count   = 11;

  const systemPrompt = `你是一位中文人格测验内容专家。你的任务是为微信小程序人格测验生成题目。

${LITERARY_GUIDE}
${aestheticContext}

### 输出格式
严格输出一个 JSON 对象，只包含 "questions" 字段（${count}道题的数组，id从q${startId}到q${endId}）。不要输出其他内容，直接输出 JSON。`;

  const userPrompt = `测验信息：
- 标题：${quiz.title}
- 描述：${quiz.description || ""}
- 评分维度：${dimensions.join("、")}

请生成 q${startId} 到 q${endId} 共${count}道题目（这是22道题中的第${isA ? "前" : "后"}一半）。

输出格式：
{
  "questions": [
    {
      "id": "q${startId}",
      "text": "具体场景题目，不要宽泛问法",
      "options": [
        { "id": "a", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 数值 } },
        { "id": "b", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 数值 } },
        { "id": "c", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 数值 } },
        { "id": "d", "text": "选项文本", "reaction": "2-10字短句", "scores": { "维度": 数值 } }
      ]
    }
  ]
}

规则：
1. ${count}道全新场景题，场景必须契合测验的历史/文化/美学氛围
2. id 从 q${startId} 到 q${endId}，不能用其他编号
3. 每个选项最多2个维度得分，主维度≤2分，副维度≤1分
4. 维度必须来自：${dimensions.join("、")}
5. 遵守 literary guide，禁止句型不能出现`;

  return { systemPrompt, userPrompt };
}

function buildResultsPrompt(quiz, resultSubset) {
  const aestheticContext = extractAestheticContext(quiz);
  const resultsStub = resultSubset.map(r => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    token: r.token,
    verse: r.verse,
    verseSource: r.verseSource,
    dimension_profile: r.dimension_profile,
  }));

  const systemPrompt = `你是一位中文人格测验内容专家。你的任务是为微信小程序人格测验重写结果页文案。

${LITERARY_GUIDE}
${aestheticContext}

### 输出格式
严格输出一个 JSON 对象，只包含 "results" 字段（只包含下方提供的结果，不要添加其他）。不要输出其他内容，直接输出 JSON。`;

  const userPrompt = `测验信息：
- 标题：${quiz.title}
- 维度：${quiz.scoring.dimensions.join("、")}

结果列表（id/title/subtitle/token/verse/verseSource/dimension_profile 必须原样保留）：
${JSON.stringify(resultsStub, null, 2)}

每个结果的输出格式：
{
  "id": "原id",
  "title": "原title",
  "subtitle": "原subtitle",
  "token": "原token",
  "verse": "原verse",
  "verseSource": "原verseSource",
  "boldQuote": null,
  "portrait": "三段，每段100-130字，assertive风格，第三段必须具体写出局限与处境",
  "strengths": [
    { "label": "3-5字能力标签", "description": "1-2句具体描述" },
    { "label": "3-5字能力标签", "description": "1-2句具体描述" },
    { "label": "3-5字能力标签", "description": "1-2句具体描述" },
    { "label": "3-5字能力标签", "description": "1-2句具体描述" },
    { "label": "3-5字能力标签", "description": "1-2句具体描述" },
    { "label": "3-5字能力标签", "description": "1-2句具体描述" }
  ],
  "weaknesses": [
    { "label": "3-5字标签", "description": "1-2句具体描述" },
    { "label": "3-5字标签", "description": "1-2句具体描述" },
    { "label": "3-5字标签", "description": "1-2句具体描述" },
    { "label": "3-5字标签", "description": "1-2句具体描述" },
    { "label": "3-5字标签", "description": "1-2句具体描述" },
    { "label": "3-5字标签", "description": "1-2句具体描述" }
  ],
  "temperament": "2-3句感性直观的气质描述",
  "situation": "1句话，核心张力",
  "career": null,
  "relationships": null,
  "lifeAdvice": "1-2句直接建议",
  "destiny": "1句诗意收尾",
  "dimension_profile": 原值
}

规则：遵守 literary guide，禁止出现被列明的句型。`;

  return { systemPrompt, userPrompt };
}

// ── Merge AI output back into original quiz ───────────────────
function mergeRewrite(original, aiOutput) {
  // Validate question count
  if (!aiOutput.questions || aiOutput.questions.length < 18) {
    throw new Error(`Only got ${aiOutput.questions?.length} questions (need ≥18)`);
  }
  if (!aiOutput.results || aiOutput.results.length === 0) {
    throw new Error("No results in AI output");
  }

  // Merge results: AI text fields + original dimension_profile
  const mergedResults = aiOutput.results.map(aiR => {
    const origR = original.results.find(r => r.id === aiR.id);
    if (!origR) {
      console.warn(`  ⚠  Unknown result id: ${aiR.id}, skipping`);
      return null;
    }
    return {
      ...aiR,
      id:               origR.id,
      title:            origR.title,
      subtitle:         origR.subtitle,
      token:            aiR.token || origR.token,
      verse:            origR.verse,
      verseSource:      origR.verseSource,
      boldQuote:        null,
      career:           null,
      relationships:    null,
      dimension_profile: origR.dimension_profile,
    };
  }).filter(Boolean);

  // Ensure all original results are present (add back any missing ones)
  original.results.forEach(origR => {
    if (!mergedResults.find(r => r.id === origR.id)) {
      console.warn(`  ⚠  Missing result ${origR.id} in AI output, keeping original`);
      mergedResults.push({ ...origR, boldQuote: null });
    }
  });

  return {
    ...original,
    estimatedMinutes: 10,
    questions:        aiOutput.questions,
    results:          mergedResults,
  };
}

// ── Upload ─────────────────────────────────────────────────────
async function uploadQuiz(quiz) {
  const tokenRes = await httpGet(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (!tokenRes.access_token) throw new Error("Failed to get access_token: " + JSON.stringify(tokenRes));

  const url    = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${tokenRes.access_token}&env=${ENV_ID}&name=quizWriter`;
  const result = await httpPost(url, { action: "updateQuiz", data: quiz });

  if (result.errcode && result.errcode !== 0) throw new Error("WeChat API error: " + JSON.stringify(result));
  const resp = typeof result.resp_data === "string" ? JSON.parse(result.resp_data) : result.resp_data;
  if (!resp || !resp.success) throw new Error("quizWriter error: " + JSON.stringify(resp));
  return resp.id;
}

// ── Progress helpers ───────────────────────────────────────────
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch(e) {}
  }
  return { done: [], failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const progress = loadProgress();
  const idList   = IDS_ARG ? IDS_ARG.split(",").map(s => s.trim()) : null;
  const targets  = ID_ARG  ? TARGET_IDS.filter(id => id === ID_ARG)
    : idList     ? idList.filter(id => !progress.done.includes(id))
    : TARGET_IDS.filter(id => !progress.done.includes(id));

  if (targets.length === 0) {
    console.log("✅  All quizzes already processed. Delete rewrite-progress.json to restart.");
    return;
  }

  console.log(`\n🚀  Rewriting ${targets.length} quiz(es)  [provider: ${PROVIDER}]\n`);

  for (let i = 0; i < targets.length; i++) {
    const quizId   = targets[i];
    const filePath = path.join(DATA_DIR, `${quizId}.json`);

    console.log(`[${i+1}/${targets.length}] ${quizId}`);

    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠  File not found, skipping\n`);
      continue;
    }

    const original = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // ── Step 0: Simplify dimension names if needed
    simplifyDimensions(original);

    // ── Step 1a: Call AI for questions in two batches (A: q1-q11, B: q12-q22)
    let questionsData;
    const allQuestions = [];
    let questionsFailed = false;

    for (const batch of ["A", "B"]) {
      let batchData = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`  📝  [${batch === "A" ? "1" : "2"}/3] Questions ${batch === "A" ? "q1-q11" : "q12-q22"}... (attempt ${attempt})`);
          const { systemPrompt, userPrompt } = buildQuestionsPrompt(original, batch);
          const raw = await callAI(systemPrompt, userPrompt);
          fs.writeFileSync(path.join(DATA_DIR, `${quizId}.q${batch}.raw.txt`), raw);
          const parsed = extractJSON(raw);
          if (!parsed.questions || parsed.questions.length < 8) throw new Error(`Only ${parsed.questions?.length} questions in batch ${batch}`);
          batchData = parsed.questions;
          console.log(`       Batch ${batch}: got ${batchData.length} questions ✓`);
          break;
        } catch (err) {
          console.error(`  ⚠   Batch ${batch} attempt ${attempt} failed: ${err.message}`);
          if (attempt === 2) {
            console.error(`  ❌  Questions batch ${batch} failed after 2 attempts\n`);
            progress.failed.push({ id: quizId, error: err.message, step: "questions" });
            saveProgress(progress);
            questionsFailed = true;
          } else {
            await sleep(4000);
          }
        }
      }
      if (questionsFailed) break;
      allQuestions.push(...(batchData || []));
      if (batch === "A") await sleep(2000);
    }

    if (questionsFailed) continue;
    questionsData = allQuestions;

    await sleep(2000);

    // ── Step 1b: Call AI for results in two batches
    const totalResults = original.results.length;
    const midpoint = Math.ceil(totalResults / 2);
    const resultBatches = [
      { label: "A", subset: original.results.slice(0, midpoint) },
      { label: "B", subset: original.results.slice(midpoint) },
    ];
    const allResults = [];
    let resultsFailed = false;
    let rStep = 3;

    for (const { label, subset } of resultBatches) {
      if (subset.length === 0) continue;
      let batchData = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`  📝  [${rStep}/4] Results ${label} (${subset.length} results)... (attempt ${attempt})`);
          const { systemPrompt, userPrompt } = buildResultsPrompt(original, subset);
          const raw = await callAI(systemPrompt, userPrompt);
          fs.writeFileSync(path.join(DATA_DIR, `${quizId}.r${label}.raw.txt`), raw);
          const parsed = extractJSON(raw);
          if (!parsed.results || parsed.results.length === 0) throw new Error("No results in batch " + label);
          batchData = parsed.results;
          console.log(`       Results ${label}: got ${batchData.length} ✓`);
          break;
        } catch (err) {
          console.error(`  ⚠   Results ${label} attempt ${attempt} failed: ${err.message}`);
          if (attempt === 2) {
            console.error(`  ❌  Results batch ${label} failed after 2 attempts\n`);
            progress.failed.push({ id: quizId, error: err.message, step: "results" });
            saveProgress(progress);
            resultsFailed = true;
          } else {
            await sleep(4000);
          }
        }
      }
      if (resultsFailed) break;
      allResults.push(...(batchData || []));
      rStep++;
      if (label === "A") await sleep(2000);
    }

    if (resultsFailed) continue;
    const resultsData = allResults;

    const aiOutput = { questions: questionsData, results: resultsData };

    // ── Step 3: Merge + save
    let merged;
    try {
      merged = mergeRewrite(original, aiOutput);
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
      console.log(`  💾  Saved to ${path.basename(filePath)}`);
    } catch (err) {
      console.error(`  ❌  Merge failed: ${err.message}\n`);
      progress.failed.push({ id: quizId, error: err.message, step: "merge" });
      saveProgress(progress);
      await sleep(2000);
      continue;
    }

    // ── Step 4: Upload
    if (!DRY_RUN) {
      try {
        const uploaded = await uploadQuiz(merged);
        console.log(`  ☁️   Uploaded: ${uploaded}\n`);
      } catch (err) {
        console.error(`  ❌  Upload failed: ${err.message}\n`);
        progress.failed.push({ id: quizId, error: err.message, step: "upload" });
        saveProgress(progress);
        await sleep(2000);
        continue;
      }
    } else {
      console.log(`  ⏭   Dry run, skipped upload\n`);
    }

    progress.done.push(quizId);
    saveProgress(progress);

    // Rate limit pause between quizzes
    if (i < targets.length - 1) await sleep(3000);
  }

  // ── Summary
  console.log("\n── Summary ─────────────────────────────");
  console.log(`✅  Done:   ${progress.done.length}`);
  console.log(`❌  Failed: ${progress.failed.length}`);
  if (progress.failed.length) {
    progress.failed.forEach(f => console.log(`   • ${f.id} [${f.step}] ${f.error}`));
    console.log("\nRe-run the script to retry failed quizzes.");
  }
}

main().catch(err => { console.error("❌  Fatal:", err); process.exit(1); });
