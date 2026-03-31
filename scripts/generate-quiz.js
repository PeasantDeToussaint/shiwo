#!/usr/bin/env node
/**
 * generate-quiz.js
 *
 * Generates a brand-new quiz JSON from a topic description using AI.
 *
 * Pipeline:
 *   Phase 0 — Domain Architecture: domain expert decides resultType, dimensions, archetypes, questionCount
 *   Phase 1 — Outline: formal structure + dimension_profile + aestheticContext
 *   Phase 2 — Questions: 3 batches, count determined by Phase 0 (default 24)
 *   Phase 3 — Results: 2 batches (≤6 results) or 3 batches (>6 results)
 *   Assembly — pure JS: remap dimensions, build final JSON, upload
 *
 * Usage:
 *   node scripts/generate-quiz.js --topic="你是哪种雨"
 *   node scripts/generate-quiz.js --topic="你是哪位宋词词人" --dry-run
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// ── Load .env ────────────────────────────────────────────────────
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
const ZHIPU_KEY     = process.env.ZHIPU_API_KEY;
const APPID         = process.env.WX_APPID;
const APPSECRET     = process.env.WX_APPSECRET;
const ENV_ID        = process.env.WX_CLOUD_ENV || "cloudbase-4gadl6qo4a9aa95d";

const ARGS      = process.argv.slice(2);
const DRY_RUN   = ARGS.includes("--dry-run");
const ESTIMATE  = ARGS.includes("--estimate");
const SKIP_EVAL = ARGS.includes("--skip-eval");
const TOPIC_ARG = (ARGS.find(a => a.startsWith("--topic=")) || "").replace("--topic=", "").replace(/^["']|["']$/g, "");
const HINT_ARGS = ARGS.filter(a => a.startsWith("--hint=")).map(a => a.replace("--hint=", "").replace(/^["']|["']$/g, ""));
const PROVIDER_ARG = (ARGS.find(a => a.startsWith("--provider=")) || "").replace("--provider=", "").replace(/^["']|["']$/g, "").toLowerCase();
const MODEL_ARG = (ARGS.find(a => a.startsWith("--model=")) || "").replace("--model=", "").replace(/^["']|["']$/g, "");

const VALID_PROVIDERS = new Set(["zhipu", "gemini", "deepseek", "anthropic"]);
if (PROVIDER_ARG && !VALID_PROVIDERS.has(PROVIDER_ARG)) {
  console.error(`❌  Invalid --provider="${PROVIDER_ARG}". Use one of: zhipu, gemini, deepseek, anthropic`);
  process.exit(1);
}

function inferProviderFromModel(model) {
  const m = (model || "").toLowerCase();
  if (!m) return null;
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("glm") || m.startsWith("zhipu")) return "zhipu";
  if (m.startsWith("deepseek")) return "deepseek";
  if (m.startsWith("claude")) return "anthropic";
  return null;
}

const AUTO_PROVIDER = ZHIPU_KEY ? "zhipu" : GEMINI_KEY ? "gemini" : DEEPSEEK_KEY ? "deepseek" : ANTHROPIC_KEY ? "anthropic" : null;
const PROVIDER      = PROVIDER_ARG || inferProviderFromModel(MODEL_ARG) || AUTO_PROVIDER;
const MODEL_DEFAULT = {
  zhipu: "glm-4-plus",
  gemini: "gemini-3-flash-preview",
  deepseek: "deepseek-chat",
  anthropic: "claude-opus-4-5",
};
const MODEL = MODEL_ARG || MODEL_DEFAULT[PROVIDER] || null;

// ── Auto-detect topic constraints and inject hints ────────────────
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

const AUTO_HINTS  = inferHintsFromTopic(TOPIC_ARG);
if (AUTO_HINTS.length > 0) {
  console.log(`📌  Auto-detected constraints:`);
  AUTO_HINTS.forEach(h => console.log(`     • ${h}`));
}
const ALL_HINTS   = [...AUTO_HINTS, ...HINT_ARGS];
const HINT_BLOCK  = ALL_HINTS.length > 0
  ? `\n### 创作者硬性约束（必须严格遵守，不得偏离）\n${ALL_HINTS.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`
  : "";

const DATA_DIR = path.resolve(__dirname, "data");

if (!TOPIC_ARG) {
  console.error("Usage: node scripts/generate-quiz.js --topic=\"topic\" [--provider=gemini|zhipu|deepseek|anthropic] [--model=\"model-name\"] [--hint=\"约束\"] [--dry-run] [--estimate] [--skip-eval]");
  process.exit(1);
}
if (!PROVIDER && !ESTIMATE) { console.error("❌  No AI API key in .env"); process.exit(1); }
if (PROVIDER === "gemini" && !GEMINI_KEY && !ESTIMATE) { console.error("❌  Missing GEMINI_API_KEY for provider=gemini"); process.exit(1); }
if (PROVIDER === "zhipu" && !ZHIPU_KEY && !ESTIMATE) { console.error("❌  Missing ZHIPU_API_KEY for provider=zhipu"); process.exit(1); }
if (PROVIDER === "deepseek" && !DEEPSEEK_KEY && !ESTIMATE) { console.error("❌  Missing DEEPSEEK_API_KEY for provider=deepseek"); process.exit(1); }
if (PROVIDER === "anthropic" && !ANTHROPIC_KEY && !ESTIMATE) { console.error("❌  Missing ANTHROPIC_API_KEY for provider=anthropic"); process.exit(1); }

// ── Literary style guide ─────────────────────────────────────────
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
- 根据语境、文化、背景，有时写出写出具体场景，例如在唐诗背景下，要根据经典唐诗重现诗意场景（只是个例子），避免"你会怎么做？"这种宽泛问法
- 每个选项代表一种真实的思维方式或行为倾向，不是对错之分

`;

// ── HTTP helpers ─────────────────────────────────────────────────
const HTTP_TIMEOUT_MS = 90000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(); reject(new Error("HTTP GET timeout")); });
    req.on("error", reject);
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
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlObj.hostname}`));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(); reject(new Error("HTTP POST timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── AI call ──────────────────────────────────────────────────────
async function callAI(systemPrompt, userPrompt, maxTokens = 8000) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: userPrompt   },
  ];

  if (PROVIDER === "zhipu") {
    const zhipuMax = Math.min(maxTokens, 4096); // glm-4-plus hard cap
    const res = await httpPost(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      { model: MODEL, max_tokens: zhipuMax, temperature: 0.85, messages, stream: false },
      { "Authorization": `Bearer ${ZHIPU_KEY}` }
    );
    if (res.error) throw new Error(`Zhipu: ${JSON.stringify(res.error)}`);
    return res.choices[0].message.content;
  }

  if (PROVIDER === "deepseek") {
    const res = await httpPost(
      "https://api.deepseek.com/chat/completions",
      { model: MODEL, max_tokens: maxTokens, temperature: 0.85, messages, stream: false },
      { "Authorization": `Bearer ${DEEPSEEK_KEY}` }
    );
    if (res.error) throw new Error(`DeepSeek: ${res.error.message}`);
    return res.choices[0].message.content;
  }

  if (PROVIDER === "anthropic") {
    const res = await httpPost(
      "https://api.anthropic.com/v1/messages",
      { model: MODEL, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
      { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }
    );
    if (res.error) throw new Error(`Anthropic: ${res.error.message}`);
    return res.content[0].text;
  }

  if (PROVIDER === "gemini") {
    const geminiModel = encodeURIComponent(MODEL);
    const res = await httpPost(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_KEY}`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85, responseMimeType: "application/json" }
      }
    );
    if (res.error) throw new Error(`Gemini: ${res.error.message}`);
    const candidate = res.candidates?.[0];
    if (!candidate) throw new Error(`Gemini: no candidates in response`);
    if (candidate.finishReason === "SAFETY") throw new Error(`Gemini: response blocked by safety filter`);
    return candidate.content.parts[0].text;
  }
}

// ── JSON repair ───────────────────────────────────────────────────
function fixBracketMismatches(str) {
  const stack = [];
  const out = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped)          { out.push(c); escaped = false; continue; }
    if (c === "\\" && inString) { out.push(c); escaped = true; continue; }
    if (c === '"')        { inString = !inString; out.push(c); continue; }
    if (inString)         { out.push(c); continue; }

    if (c === "{" || c === "[") {
      stack.push(c); out.push(c);
    } else if (c === "}" || c === "]") {
      if (stack.length > 0) {
        out.push(stack[stack.length - 1] === "{" ? "}" : "]");
        stack.pop();
      } else {
        out.push(c);
      }
    } else {
      out.push(c);
    }
  }
  return out.join("");
}

function repairJSON(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] !== '"') { out.push(str[i++]); continue; }
    out.push('"'); i++;
    while (i < str.length) {
      if (str[i] === "\\") {
        out.push(str[i], str[i + 1] || "");
        i += 2; continue;
      }
      if (str[i] === '"') {
        let j = i + 1;
        while (j < str.length && str[j] === " ") j++;
        const next = str[j];
        if (next === ":" || next === "," || next === "}" || next === "]" || next === "\n" || next === "\r") {
          out.push('"'); i++; break;
        }
        out.push('\\"'); i++;
      } else {
        out.push(str[i++]);
      }
    }
  }
  return out.join("");
}

function extractJSON(raw) {
  let match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = match ? match[1].trim() : raw.trim();

  const start = jsonStr.indexOf("{");
  const end   = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  jsonStr = jsonStr.slice(start, end + 1);

  jsonStr = jsonStr
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  const STRING_FIELDS = [
    "reaction","text","label","description","portrait",
    "temperament","situation","lifeAdvice","destiny",
    "token","verse","verseSource","boldQuote","title","subtitle",
    "insight","nameContext","coreIdentity","distinctiveFeature",
    "domainInsight","figureContext","axisLabel","lowPole",
  ];
  for (const f of STRING_FIELDS) {
    const re = new RegExp(`("${f}"\\s*:\\s*)([^"\\s{\\[\\d\\-ntf][^"\\n]*?)(")`, "g");
    jsonStr = jsonStr.replace(re, '$1"$2$3');
  }

  // Merge duplicate "portrait" keys that models sometimes emit (one per paragraph).
  // Loop until stable since there can be 3+ consecutive keys.
  let prev;
  do {
    prev = jsonStr;
    jsonStr = jsonStr.replace(
      /"portrait"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"portrait"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
      '"portrait": "$1\\n\\n$2"'
    );
  } while (jsonStr !== prev);

  // Replace unescaped literal newlines/tabs inside JSON strings with escape sequences
  jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (m) =>
    m.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  );

  try { return JSON.parse(jsonStr); } catch (_) {}
  try { return JSON.parse(fixBracketMismatches(jsonStr)); } catch (_) {}
  try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}
  try { return JSON.parse(repairJSON(fixBracketMismatches(jsonStr))); } catch (e) {
    throw new Error(`JSON parse failed after repair: ${e.message}`);
  }
}

// ── Simplify overly complex dimension names ───────────────────────
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
    if (d.length > 4 && /[主义风格精神气质]$/.test(d)) return d.slice(0, 2);
    if (d.length > 4) return d.slice(0, 4);
    return d;
  });
}

// ── Format aesthetic context from outline ─────────────────────────
function formatAestheticContext(aestheticContext) {
  if (!aestheticContext) return "";
  return `\n### 这道测验的氛围与场景要求\n${aestheticContext}\n题目场景必须契合上述氛围，不能写成通用的现代职场或生活题。`;
}

// ── Phase 0: Domain Architecture ─────────────────────────────────
async function generateArchitecture(topic) {
  const system = `你是「${topic}」领域的资深专家。你的任务是为一道微信小程序测验设计结果架构——决定测验应该输出哪些结果、为什么这样划分、每个结果的核心定位是什么。

这个测验不一定是人格测验。结果可能是：具体国家/城市/事物（item 类）、适合程度的不同段位（archetype 类但以程度命名）、真实人物（figure 类）、或有象征意味的人格原型（archetype 类）。你需要先判断这个测验属于哪种类型，再基于该类型设计结果，而不是一律套用「人格原型」框架。

这一步只关注概念和结构，不写任何正文内容。输出严格 JSON，不输出其他内容。`;

  const user = `请为以下测验设计原型架构：

主题：${topic}
${HINT_BLOCK}
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
  "dimensionCount": "你决定的维度数量，整数，分类应体现专业洞察但面向普通用户可理解",
  "questionCount": "你决定的题目数量，整数，建议范围：简单主题12题，中等主题16-20题，复杂多维主题22-24题",
  "dimensions": ["根据主题实际需要填写，与dimensionCount数量一致"],
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
        "维度B": "high/medium/low"
      }
    }
  ]
}

第三步：作为领域专家，自由设计每个结果应包含的内容字段

你是这个领域的专家，请基于「用户最关心什么」来决定结果页的字段构成。

### 标准字段（按需选用，用 standard: true 标记）
这些字段有固定的生成格式，全部可选，只选对这个主题有意义的：
- portrait：三段人格画像
- strengths：6条优势
- weaknesses：6条局限
- temperament：气质描述
- situation：核心张力
- lifeAdvice：给用户的行动建议
- destiny：诗意命运收尾
不要全选，根据主题和用户需求挑选最合适的组合。

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
-【关键约束】dimensions 和 results 数量必须严格相等，每个 primaryDimension 对应 dimensions 中的一个，不重复。输出前请自检 dimensions.length === results.length
- resultType=figure 时：name 必须是真实人物，领域代表性强，不同人物人格差异显著，应覆盖不同性格倾向和背景（如性别、年代、风格）
- resultType=item 时：name 必须是该类别中真实存在的具体事物，选择依据是该事物的真实特性能映射特定人格
- resultType=archetype 时：name 是有质感的意象或角色名，不能叫「外向型」「理性型」
- profileHints 必须覆盖所有维度，high/medium/low 在不同原型之间要有明显差异`;

  const raw = await callAI(system, user, 2500);
  return extractJSON(raw);
}

// ── Phase 1: Generate outline ─────────────────────────────────────
async function generateOutline(topic, architecture) {
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
${HINT_BLOCK}${archContext}
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
        "维度B": 0.0
      }
    }
  ]
}

规则：
- dimensions 数量 = results 数量 = dimensionAxes 数量，4-6个（若 Phase 0 已给出，严格使用 Phase 0 的维度）
- dimensionAxes 中每个 dimension 必须与 dimensions 数组里的值完全一致
- 每个 result 对应一个 dimension，id 从 r1 开始
- 维度名称简洁，2-4字
- axisLabel 是这条轴的"类别名"，lowPole 是该维度的反面特质
- insight 必须是具体的、有画面感的描述，禁止套话如"你是个…的人"开头，禁止空洞形容词堆砌
- 结果要有辨识度，用户看到标题就能感知「这说的是我吗」

dimension_profile 规则（这是最重要的部分，直接决定结果准确性）：
- 若 Phase 0 提供了 profileHints（high/medium/low），必须以此为基础转换为数值：high=0.60-0.80，medium=0.30-0.55，low=0.08-0.25
- 所有维度都必须出现在每个 profile 中，key 与 dimensions 完全一致
- 禁止任何维度设为 1.0 或 0.0（避免极端化）
- 不同结果的 profile 必须有显著差异，确保每个结果在某几个维度上有独特的高低组合
- profile 设计完成后自我检验：是否有两个结果过于相似？是否会导致大多数用户聚集在同一个结果？`;

  const raw = await callAI(system, user, 4500);
  return extractJSON(raw);
}

// ── Phase 2: Generate questions ───────────────────────────────────
async function generateQuestions(outline, startId, endId, batchLabel, total) {
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
4. 维度必须来自：${dimensions.join("、")}
5. 遵守 literary guide，禁止句型不能出现`;

  const raw = await callAI(system, user, 6000);
  fs.writeFileSync(path.join(DATA_DIR, `${outline.id}.q${batchLabel}.raw.txt`), raw);

  const parsed = extractJSON(raw);
  if (!parsed.questions || parsed.questions.length < count)
    throw new Error(`Expected ${count} questions, got ${parsed.questions?.length ?? 0}`);
  return parsed.questions;
}

// ── Result template builder ───────────────────────────────────────
const PORTRAIT_TEMPLATE_BY_TYPE = {
  archetype: `  "portrait": "【重要】portrait 必须是一个 JSON 字符串，三段之间用 \\\\n\\\\n 分隔，绝对不能拆成多个 portrait 键。每段150-200字，合计不少于450字。第一段：描述这类人的内在世界和核心特质；第二段：描述他们的行为模式和与他人的关系；第三段：描述核心挑战与成长方向。格式：「第一段\\\\n\\\\n第二段\\\\n\\\\n第三段」"`,
  figure:    `  "portrait": "【重要】portrait 必须是一个 JSON 字符串，三段之间用 \\\\n\\\\n 分隔，绝对不能拆成多个 portrait 键。每段150-200字，合计不少于450字。第一段：描述这位人物的核心精神气质；第二段：将用户与这位人物的相似之处具体化，写出共同的行为模式或内在动因；第三段：这种气质带来的挑战与可能性。格式：「第一段\\\\n\\\\n第二段\\\\n\\\\n第三段」"`,
  item:      `  "portrait": "【重要】portrait 必须是一个 JSON 字符串，三段之间用 \\\\n\\\\n 分隔，绝对不能拆成多个 portrait 键。每段150-200字，合计不少于450字。【核心要求】不要描述这个事物/国家/地方本身，而要解释为什么测验者的人格特质与它产生共鸣。第一段：测验者身上哪些具体特质让他们与这个结果产生联结；第二段：这个结果的文化/精神特质如何与测验者的内在世界对应；第三段：这种匹配在现实中意味着什么，测验者会在这里/与这个事物产生什么样的体验。格式：「第一段\\\\n\\\\n第二段\\\\n\\\\n第三段」"`,
};

const STANDARD_FIELD_TEMPLATES = {
  portrait: PORTRAIT_TEMPLATE_BY_TYPE.archetype, // default, overridden in buildResultTemplate
  strengths: `  "strengths": [
    { "label": "3-5字标签，从该事物/人物/原型特质提炼", "description": "2-3句，包含可视化的行为场景" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" }
  ]`,
  weaknesses: `  "weaknesses": [
    { "label": "3-5字标签，来自阴影面", "description": "2-3句，写出具体摩擦和代价" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" },
    { "label": "同上", "description": "2-3句" }
  ]`,
  temperament: `  "temperament": "2-3句感性直观的气质描述"`,
  situation:   `  "situation": "1句，核心张力"`,
  lifeAdvice:  `  "lifeAdvice": "1-2句直接建议"`,
  destiny:     `  "destiny": "1句诗意收尾"`,
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
      lines.push(templates[f.key] + ",");
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

// ── Phase 3: Generate result content ─────────────────────────────
async function generateResults(outline, resultSubset) {
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
每段 150-200 字，三段合计不少于 450 字。禁止写空洞的概括句，每一句都必须承载具体信息。

### 让用户"被发现"的写法技巧
1. **命名内在体验**：说出用户感受到但从未能表达的内心状态。不写"你很敏感"，写"你常常在人群散去之后才意识到自己其实很疲惫，但你很少在当下说出来"。
2. **具体行为细节**：用可视化的场景描述，不写"你注重细节"，写"你会在别人觉得差不多的时候再检查一遍，哪怕已经没有人要求你这样做"。
3. **说出矛盾与代价**：不只写优点，也要说出这种气质在现实中造成的摩擦和孤独感，让用户感到被理解而非被夸奖。
4. **第二人称，assertive语气**：不是"这种人格的人往往……"，而是直接对用户说"你……"。
5. **禁止套话**：不用"你是一个xxx的人""你拥有xxx的特质"这种句式开头；不写"在人生的旅途中"之类的空泛过渡。` : "";

  const portraitStructure = {
    item: `## 结构：先介绍事物，再写人格共鸣
- portrait【第一段，150-200字】：用感官语言介绍事物本身——物理特质（颜色/光泽/硬度/产地/形成机制）、历史渊源、在人类文明中的位置与象征意义。写得让读者先对这个事物产生真实的迷恋与好奇。
- portrait【第二段，150-200字】：描述拥有这种气质的人——不是性格标签，而是具体的行为场景和内在体验。他们在什么时候会被误解？他们私下里怎么处理情绪？他们在关系里的真实状态是什么？
- portrait【第三段，150-200字】：写出这种气质的张力与代价——美丽背后的孤独，稀有性带来的距离感，光芒背后必须承担的重量。要具体，不要泛泛而谈。`,
    figure: `## 结构：先介绍人物，再写人格共鸣
- portrait【第一段，150-200字】：介绍人物的真实生平与历史定位——代表事件、名言警句、所处时代的重量。让读者感受到这个人的存在感和历史厚度。
- portrait【第二段，150-200字】：写这个人物的内在气质与处世哲学——他/她如何面对命运、做出选择、处理关系，以及他们身上哪些东西让后人反复回望。
- portrait【第三段，150-200字】：用"被发现了"的方式写用户与此人的精神共鸣——命名用户继承了此人的哪种内在结构，以及这种结构带来的未竟之事或无法解决的命题。`,
    archetype: `## 结构：先介绍原型，再写人格共鸣
- portrait【第一段，150-200字】：介绍这个原型/角色的来源、形象、在神话/文学/文化中的象征意义。即使用户不熟悉，读完也能感受到它的独特魅力。
- portrait【第二段，150-200字】：从这个原型的象征气质出发，用具体行为场景描述拥有此人格的人——不是说他们"很xxx"，而是说他们在具体情境下会怎么做、怎么感受、怎么被他人误解。
- portrait【第三段，150-200字】：写出这种原型气质的张力与局限，以及它赋予用户的核心命题——他们终其一生在与什么较劲？`,
  };

  const swGuide = (hasField("strengths") || hasField("weaknesses")) ? ({
    item: `- strengths label：必须从该事物的真实物理/文化特质提炼（如「折射万千」「压力成型」「历久弥新」），description 再延伸到人格含义。
- weaknesses label：同样来自事物特质的阴影面（如「易碎于冲击」「光芒招觊觎」），description 写出这在人际或自我认知中的代价。
- 禁止使用通用人格标签（如"共情力强""行动力强""情绪稳定"）作为 label。`,
    figure: `- strengths/weaknesses label：基于该人物历史上真实展现的特质，用该人物的标志性意象提炼，而非抽象人格词汇。`,
    archetype: `- strengths/weaknesses label：带有该原型/角色的独特意象，不使用完全通用的人格词汇。`,
  }[resultType] || "") : "";

  const contentGuide = [
    portraitDepthGuide,
    hasField("portrait") ? (portraitStructure[resultType] || "") : "",
    swGuide,
  ].filter(Boolean).join("\n\n");

  const user = `测验：${outline.title}（结果类型：${resultType}）
维度：${outline.dimensions.join("、")}
${figureContext}

${contentGuide}

结果列表（id/title/subtitle/token/verse/verseSource 必须原样保留）：
${JSON.stringify(stub, null, 2)}

每个结果的输出格式：
${buildResultTemplate(resultFields, resultType)}

只生成上方格式中出现的字段，不要添加其他字段。
规则：遵守 literary guide，禁止出现被列明的句型。`;

  const raw = await callAI(system, user, 10000);
  const label = stub.map(r => r.id).join("-");
  const rawPath = path.join(DATA_DIR, `${outline.id}.r${label}.raw.txt`);
  fs.writeFileSync(rawPath, raw);

  let parsed;
  try {
    parsed = extractJSON(raw);
  } catch (e) {
    throw new Error(`JSON parse failed (raw saved to ${path.basename(rawPath)}): ${e.message}`);
  }
  if (!parsed.results) {
    if (parsed.id && (parsed.portrait || parsed.strengths)) {
      parsed = { results: [parsed] };
    } else if (Array.isArray(parsed)) {
      parsed = { results: parsed };
    }
  }
  if (!parsed.results || parsed.results.length === 0)
    throw new Error(`No results returned (raw saved to ${path.basename(rawPath)})`);
  return parsed.results;
}

// ── Validation ────────────────────────────────────────────────────
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
        if (!dimSet.has(dim)) warnings.push(`${q.id}.${o.id}: unknown dimension "${dim}" (valid: ${dimensions.join(", ")})`);
        if (typeof val !== "number" || val < 0 || val > 3) warnings.push(`${q.id}.${o.id}: score ${val} out of range [0,3] for "${dim}"`);
      }
    }
  }

  return warnings;
}

function validateResults(results, dimensions, resultFields) {
  const warnings = [];
  const standardKeys = new Set(Object.keys(STANDARD_FIELD_TEMPLATES));
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

  // Check for overly similar profiles (cosine distance < threshold)
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i].dimension_profile, b = results[j].dimension_profile;
      if (!a || !b) continue;
      const maxDiff = Math.max(...dimensions.map(d => Math.abs((a[d] || 0) - (b[d] || 0))));
      if (maxDiff < 0.15) {
        warnings.push(`${results[i].id} ↔ ${results[j].id}: profiles too similar (max diff ${maxDiff.toFixed(2)}), users may cluster`);
      }
    }
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

function summarizeQuizForEvaluation(quiz) {
  const results = (quiz.results || []).map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    token: r.token,
    verse: r.verse,
    verseSource: r.verseSource,
    portrait: r.portrait || null,
    strengths: Array.isArray(r.strengths) ? r.strengths.map(s => ({ label: s.label, description: s.description })) : [],
    weaknesses: Array.isArray(r.weaknesses) ? r.weaknesses.map(w => ({ label: w.label, description: w.description })) : [],
    temperament: r.temperament || null,
    situation: r.situation || null,
    lifeAdvice: r.lifeAdvice || null,
    destiny: r.destiny || null,
    extras: Array.isArray(r.extras) ? r.extras.map(e => ({ key: e.key, label: e.label, content: e.content })) : [],
  }));

  const sampleQuestions = (quiz.questions || []).slice(0, 4).map((q) => ({
    id: q.id,
    text: q.text,
    options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
  }));

  return {
    id: quiz.id,
    title: quiz.title,
    subtitle: quiz.subtitle,
    description: quiz.description,
    dimensions: quiz?.scoring?.dimensions || [],
    resultCount: results.length,
    questionCount: (quiz.questions || []).length,
    sampleQuestions,
    results,
  };
}

async function evaluateQuiz(quiz) {
  const payload = summarizeQuizForEvaluation(quiz);

  const system = `你是一位严苛的中文人格测验总编审，负责评估最终成品的内容质量。
请依据下面的风格准则打分，并给出具体证据句。必须客观，不要讨好。

${LITERARY_GUIDE}

评分维度（1-10分，10最好）：
1) aiSlop：是否出现 AI 腔、套话、禁用句型
2) portraitDepth：画像是否具体、有细节、有“被看见”感
3) labelQuality：strengths/weaknesses 的 label 是否具体且有领域感
4) differentiation：不同结果是否有足够区分度
5) topicFidelity：是否贴合主题与领域知识

输出必须是严格 JSON，不要解释。`;

  const user = `请评估以下测验最终成品（已是最终 JSON，不是草稿）：
${JSON.stringify(payload, null, 2)}

输出格式：
{
  "scores": {
    "aiSlop": { "score": 1-10, "reason": "一句话理由" },
    "portraitDepth": { "score": 1-10, "reason": "一句话理由" },
    "labelQuality": { "score": 1-10, "reason": "一句话理由" },
    "differentiation": { "score": 1-10, "reason": "一句话理由" },
    "topicFidelity": { "score": 1-10, "reason": "一句话理由" }
  },
  "overall": {
    "score": 0-10,
    "passed": true,
    "reason": "一句话结论"
  },
  "flags": [
    {
      "location": "例如 r3.portrait.p2 或 r5.weaknesses[2].label",
      "issue": "问题类型",
      "evidence": "原文证据",
      "rule": "违反的规则"
    }
  ],
  "suggestions": ["最多5条，优先可执行修改建议"]
}`;

  const raw = await callAI(system, user, 3500);
  const parsed = extractJSON(raw);

  const metricKeys = ["aiSlop", "portraitDepth", "labelQuality", "differentiation", "topicFidelity"];
  const normalizedScores = {};
  for (const k of metricKeys) {
    const node = parsed?.scores?.[k] || {};
    const scoreRaw = Number(node.score);
    const score = Number.isFinite(scoreRaw) ? Math.max(1, Math.min(10, scoreRaw)) : 5;
    normalizedScores[k] = {
      score,
      reason: node.reason || "No reason provided",
    };
  }

  const avg = metricKeys.reduce((sum, k) => sum + normalizedScores[k].score, 0) / metricKeys.length;
  const overallScoreRaw = Number(parsed?.overall?.score);
  const overallScore = Number.isFinite(overallScoreRaw)
    ? Math.max(0, Math.min(10, overallScoreRaw))
    : Number(avg.toFixed(1));
  const flags = Array.isArray(parsed?.flags) ? parsed.flags : [];
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const passed = typeof parsed?.overall?.passed === "boolean"
    ? parsed.overall.passed
    : (overallScore >= 7 && flags.length <= 4);

  return {
    scores: normalizedScores,
    overall: {
      score: Number(overallScore.toFixed(1)),
      passed,
      reason: parsed?.overall?.reason || "No overall reason provided",
    },
    flags,
    suggestions,
  };
}

function printEvalReport(evalResult) {
  const row = (label, key) => {
    const x = evalResult.scores[key];
    console.log(`     ${label.padEnd(17)} ${String(x.score).padStart(4)}/10  ${x.reason}`);
  };

  console.log("  🔍  Quality evaluation:");
  row("AI-slop:", "aiSlop");
  row("Portrait depth:", "portraitDepth");
  row("Label quality:", "labelQuality");
  row("Differentiation:", "differentiation");
  row("Topic fidelity:", "topicFidelity");
  console.log("     -----------------------------");
  console.log(`     Overall:          ${String(evalResult.overall.score).padStart(4)}/10  ${evalResult.overall.passed ? "PASS" : "FAIL"}  ${evalResult.overall.reason}`);

  if (evalResult.flags.length > 0) {
    console.log("     Flagged:");
    for (const f of evalResult.flags.slice(0, 8)) {
      const loc = f.location || "unknown";
      const issue = f.issue || "issue";
      const evidence = f.evidence || "";
      const rule = f.rule || "";
      console.log(`       • ${loc}: ${issue}${evidence ? ` | "${evidence}"` : ""}${rule ? ` | ${rule}` : ""}`);
    }
  }
  if (evalResult.suggestions.length > 0) {
    console.log("     Suggestions:");
    for (const s of evalResult.suggestions.slice(0, 5)) {
      console.log(`       • ${s}`);
    }
  }
}

// ── Phase timer ───────────────────────────────────────────────────
const PHASE_TIMES = {};
function startPhase(name) { PHASE_TIMES[name] = Date.now(); }
function endPhase(name) {
  const ms = Date.now() - (PHASE_TIMES[name] || Date.now());
  PHASE_TIMES[name] = ms;
  return (ms / 1000).toFixed(1);
}
function printTimingSummary() {
  console.log("\n⏱   Phase timings:");
  for (const [name, ms] of Object.entries(PHASE_TIMES)) {
    console.log(`     ${name.padEnd(20)} ${(ms / 1000).toFixed(1)}s`);
  }
  const total = Object.values(PHASE_TIMES).reduce((a, b) => a + b, 0);
  console.log(`     ${"TOTAL".padEnd(20)} ${(total / 1000).toFixed(1)}s`);
}

// ── Assemble full quiz JSON ───────────────────────────────────────
function assembleQuiz(outline, questions, results) {
  const simplifiedDimensions = simplifyDimensions(outline.dimensions);
  const dimMap = {};
  outline.dimensions.forEach((d, i) => { dimMap[d] = simplifiedDimensions[i]; });

  const remappedQuestions = questions.map(q => ({
    ...q,
    options: (q.options || []).map(o => {
      if (!o.scores) return o;
      const s = {};
      Object.entries(o.scores).forEach(([k, v]) => { s[dimMap[k] || k] = v; });
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
      portrait,
      strengths:         r.strengths,
      weaknesses:        r.weaknesses,
      temperament:       r.temperament,
      situation:         r.situation,
      lifeAdvice:        r.lifeAdvice,
      destiny:           r.destiny,
      dimension_profile: profile,
    };
    // Strip undefined standard fields rather than keeping them as null
    for (const key of ["strengths", "weaknesses", "temperament", "situation", "lifeAdvice", "destiny", "boldQuote"]) {
      if (assembled[key] == null) delete assembled[key];
    }
    // Custom fields go exclusively into extras — any top-level non-standard keys the model
    // emits (e.g. career: null) are intentionally excluded by the whitelist above
    if (Array.isArray(r.extras) && r.extras.length > 0) assembled.extras = r.extras;
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

// ── Upload ────────────────────────────────────────────────────────
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

// ── Retry wrapper ─────────────────────────────────────────────────
async function withRetry(label, fn, maxAttempts = 4, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const is429 = /429/.test(err.message);
      const backoff = is429
        ? delayMs * Math.pow(2, attempt - 1)   // 429: exponential backoff (5s, 10s, 20s, …)
        : delayMs;
      console.warn(`  ⚠   ${label} attempt ${attempt} failed: ${err.message}, retrying in ${(backoff / 1000).toFixed(0)}s...`);
      await sleep(backoff);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  // --estimate: print cost/call estimate and exit
  if (ESTIMATE) {
    const qBatches = 3, rBatches = 2;
    const evalCalls = SKIP_EVAL ? 0 : 1;
    const totalCalls = 1 + 1 + qBatches + rBatches + evalCalls; // arch + outline + questions + results + eval
    const tokensPerCall = { architecture: 1800, outline: 4500, questions: 6000, results: 8000, eval: 3500 };
    const totalOutputTokens = tokensPerCall.architecture + tokensPerCall.outline
      + qBatches * tokensPerCall.questions + rBatches * tokensPerCall.results
      + evalCalls * tokensPerCall.eval;
    console.log(`\n📊  Estimate for 「${TOPIC_ARG}」\n`);
    console.log(`    API calls:        ${totalCalls} (1 arch + 1 outline + ${qBatches} question batches + ${rBatches} result batches${evalCalls ? " + 1 eval" : ""})`);
    console.log(`    Max output tokens: ~${(totalOutputTokens / 1000).toFixed(0)}k`);
    console.log(`    Provider:         ${PROVIDER || "(none configured)"}`);
    if (PROVIDER === "deepseek") console.log(`    Est. cost:        ~¥0.05–0.15 (deepseek-chat)`);
    if (PROVIDER === "anthropic") console.log(`    Est. cost:        ~$1.50–3.00 (claude-opus-4-5)`);
    if (PROVIDER === "gemini") console.log(`    Est. cost:        ~$0.01–0.05 (gemini-1.5-flash)`);
    console.log(`    Est. time:        ~3–6 minutes\n`);
    return;
  }

  console.log(`\n🚀  Generating quiz: 「${TOPIC_ARG}」  [provider: ${PROVIDER}, model: ${MODEL}]\n`);
  if (HINT_ARGS.length > 0) {
    console.log(`📌  Hints:`);
    HINT_ARGS.forEach(h => console.log(`     • ${h}`));
    console.log();
  }

  // Phase 0: Domain Architecture
  console.log("🧠  [0/3] Domain architecture...");
  startPhase("0-architecture");
  let architecture;
  try {
    architecture = await withRetry("architecture", () => generateArchitecture(TOPIC_ARG), 4, 5000);
    console.log(`     ✓  dimensions:  ${(architecture.dimensions || []).join(" / ")}`);
    console.log(`     ✓  archetypes:  ${(architecture.results || []).map(r => r.name).join(" / ")}`);
    if (architecture.domainInsight) console.log(`        insight:     ${architecture.domainInsight.slice(0, 70)}...`);
  } catch (err) {
    console.warn(`  ⚠   Architecture failed: ${err.message}. Proceeding without it.`);
    architecture = null;
  }
  console.log(`     (${endPhase("0-architecture")}s)`);

  await sleep(3000);

  // Phase 1: Outline
  console.log("\n📋  [1/3] Generating outline...");
  startPhase("1-outline");
  let outline;
  try {
    outline = await withRetry("outline", () => generateOutline(TOPIC_ARG, architecture), 4, 5000);
    const origDims = [...outline.dimensions];
    outline.dimensions = simplifyDimensions(outline.dimensions);
    const dimSimplifyMap = {};
    origDims.forEach((d, i) => { dimSimplifyMap[d] = outline.dimensions[i]; });
    for (const r of outline.results) {
      if (r.dimension_profile) {
        const remapped = {};
        for (const [k, v] of Object.entries(r.dimension_profile)) remapped[dimSimplifyMap[k] || k] = v;
        r.dimension_profile = remapped;
      }
      if (r.dimension) r.dimension = dimSimplifyMap[r.dimension] || r.dimension;
    }
    if (outline.dimensionAxes) {
      for (const a of outline.dimensionAxes) {
        if (a.dimension) a.dimension = dimSimplifyMap[a.dimension] || a.dimension;
      }
    }
    if (architecture && architecture.results) {
      outline.architectureResults = architecture.results;
      outline.architectureResultType = architecture.resultType || "archetype";
      outline.architectureResultFields = architecture.resultFields || null;
    }
    console.log(`     ✓  id:         ${outline.id}`);
    console.log(`        title:      ${outline.title}`);
    console.log(`        dimensions: ${outline.dimensions.join(" / ")}`);
    console.log(`        results:    ${outline.results.map(r => r.title).join(" / ")}`);
    if (architecture && architecture.results) {
      console.log(`        resultType: ${architecture.resultType || "archetype"}`);
      console.log(`        archetypes: ${architecture.results.map(r => r.name).join(" / ")}`);
    }
    if (outline.aestheticContext) console.log(`        context:    ${outline.aestheticContext.slice(0, 60)}...`);
  } catch (err) {
    console.error("❌  Outline failed:", err.message); process.exit(1);
  }
  console.log(`     (${endPhase("1-outline")}s)`);

  // Validate outline dimension_profiles early
  printWarnings("outline profiles", validateDimensionProfiles(
    outline.results.map(r => ({ id: r.id, dimension_profile: r.dimension_profile })),
    outline.dimensions
  ));

  await sleep(3000);

  // Phase 2: Questions — split into 3 batches based on architecture's questionCount
  const Q_TOTAL = (architecture && architecture.questionCount && Number.isInteger(Number(architecture.questionCount)))
    ? Math.max(12, Math.min(36, Number(architecture.questionCount)))
    : 24;
  const Q_BATCH_SIZE = Math.ceil(Q_TOTAL / 3);
  const Q_BATCHES = Array.from({ length: 3 }, (_, i) => {
    const startId = i * Q_BATCH_SIZE + 1;
    const endId   = Math.min((i + 1) * Q_BATCH_SIZE, Q_TOTAL);
    return { startId, endId, label: String(i + 1) };
  }).filter(b => b.startId <= Q_TOTAL);
  console.log(`\n📝  Questions: ${Q_TOTAL} total, ${Q_BATCHES.length} batches`);

  startPhase("2-questions");
  const allQuestions = [];
  for (const [i, { startId, endId, label }] of Q_BATCHES.entries()) {
    console.log(`\n📝  [2/3] Questions q${startId}-q${endId} (batch ${label}/${Q_BATCHES.length})...`);
    try {
      const qs = await withRetry(`questions-${label}`, () => generateQuestions(outline, startId, endId, label, Q_TOTAL));
      allQuestions.push(...qs);
      console.log(`     ✓  got ${qs.length} questions`);
    } catch (err) {
      console.error(`❌  Questions batch ${label} failed:`, err.message); process.exit(1);
    }
    if (i < Q_BATCHES.length - 1) await sleep(4000);
  }
  console.log(`     (${endPhase("2-questions")}s)`);

  // Validate questions
  printWarnings("questions", validateQuestions(allQuestions, outline.dimensions));

  await sleep(4000);

  // Phase 3: Results — batch size 1 for item/figure types or large result sets (content is very large)
  const rTotal      = outline.results.length;
  const resultType  = outline.architectureResultType || "archetype";
  const R_BATCH_SIZE = 1;
  const rBatchCount = Math.ceil(rTotal / R_BATCH_SIZE);
  const rSize       = R_BATCH_SIZE;
  const R_BATCHES   = Array.from({ length: rBatchCount }, (_, i) =>
    outline.results.slice(i * rSize, (i + 1) * rSize)
  ).filter(b => b.length > 0);

  startPhase("3-results");
  const allResults = [];
  for (const [i, subset] of R_BATCHES.entries()) {
    console.log(`\n✍️   [3/3] Results batch ${i + 1}/${R_BATCHES.length} (${subset.length} results)...`);
    try {
      const rs = await withRetry(`results-${i + 1}`, () => generateResults(outline, subset), 5, 3000);
      allResults.push(...rs);
      console.log(`     ✓  got ${rs.length} results`);
    } catch (err) {
      console.error(`❌  Results batch ${i + 1} failed:`, err.message); process.exit(1);
    }
    if (i < R_BATCHES.length - 1) await sleep(4000);
  }
  console.log(`     (${endPhase("3-results")}s)`);

  // Validate results content
  printWarnings("results content", validateResults(allResults, outline.dimensions, outline.architectureResultFields));

  // Assemble + save
  startPhase("4-assemble");
  const quiz = assembleQuiz(outline, allQuestions, allResults);

  // Final validation on assembled quiz
  printWarnings("final profiles", validateDimensionProfiles(quiz.results, quiz.scoring.dimensions));

  const filePath = path.join(DATA_DIR, `${quiz.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(quiz, null, 2));
  endPhase("4-assemble");
  console.log(`\n💾  Saved → ${path.basename(filePath)}`);
  console.log(`     questions: ${quiz.questions.length}  results: ${quiz.results.length}`);

  // Phase 4.5: AI quality evaluation
  if (!DRY_RUN && !SKIP_EVAL) {
    console.log("\n🔎  [4.5/5] Quality evaluation...");
    startPhase("4.5-eval");
    try {
      const evalResult = await withRetry("eval", () => evaluateQuiz(quiz), 2, 3000);
      printEvalReport(evalResult);
      if (!evalResult.overall.passed) {
        console.warn("  ⚠   Quality check did not pass. Uploading anyway.");
      }
    } catch (err) {
      console.warn(`  ⚠   Eval failed: ${err.message}. Skipping.`);
    }
    console.log(`     (${endPhase("4.5-eval")}s)`);
  } else if (SKIP_EVAL) {
    console.log("\n⏭   Skipped quality evaluation (--skip-eval)");
  }

  // Upload
  if (!DRY_RUN) {
    startPhase("5-upload");
    try {
      await uploadQuiz(quiz);
      console.log(`☁️   Uploaded: ${quiz.id}`);
    } catch (err) {
      console.error("❌  Upload failed:", err.message);
      console.log(`    File saved locally. Run: node scripts/upload-quiz.js ${filePath} --update`);
    }
    endPhase("5-upload");
  } else {
    console.log(`⏭   Dry run — skipped upload`);
    console.log(`    To upload: node scripts/upload-quiz.js ${filePath} --update`);
  }

  printTimingSummary();
  console.log(`\n✅  Done: 「${quiz.title}」 → ${quiz.id}\n`);
}

main().catch(err => { console.error("❌  Fatal:", err); process.exit(1); });
