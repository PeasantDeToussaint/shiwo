#!/usr/bin/env node
/**
 * rewrite-mbti-full.js
 *
 * Generates comprehensive 16personalities-style content for all 16 MBTI types.
 * Each type gets: portrait, strengths×6, weaknesses×6,
 * romanticRelationships, friendships, parenthood, careerPaths, workplaceHabits.
 *
 * Usage:
 *   node scripts/rewrite-mbti-full.js [--dry-run] [--type INFP] [--upload]
 *
 * Flags:
 *   --dry-run        Print prompt for first type, skip AI calls
 *   --type INFP      Only rewrite a single type (useful for testing)
 *   --upload         Push to cloud after finishing
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// ── Env ────────────────────────────────────────────────────────
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

const PROVIDER = DEEPSEEK_KEY ? "deepseek"
               : ANTHROPIC_KEY ? "anthropic"
               : GEMINI_KEY   ? "gemini"
               : null;

const ARGS      = process.argv.slice(2);
const DRY_RUN   = ARGS.includes("--dry-run");
const UPLOAD    = ARGS.includes("--upload");
const TYPE_ONLY = (ARGS.find(a => a === "--type") ? ARGS[ARGS.indexOf("--type") + 1] : null || "").toUpperCase();

if (!PROVIDER && !DRY_RUN) {
  console.error("❌  No AI key found (DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY)");
  process.exit(1);
}

const QUIZ_PATH = path.resolve(__dirname, "data/mbti-16personalities.json");

// ── 16 Type Definitions ────────────────────────────────────────
const MBTI_TYPES = [
  // Analysts
  {
    code: "INTJ", id: "intj", title: "建筑师", english: "Architect",
    group: "分析家", groupEn: "Analysts",
    profile: { E: 0.1, S: 0.1, T: 0.9, J: 0.9 },
    traits: "战略性思维、独立、意志力极强。对能力的标准高于一切，对无能和低效有真实的不耐烦。内心世界极其复杂，外表却往往冷静克制。既是最理性的规划者，又藏着深不可测的内在愿景。",
    verse: "凡是人力所能完成之事，他日必将完成。", verseSource: "儒勒·凡尔纳《海底两万里》",
  },
  {
    code: "INTP", id: "intp", title: "逻辑学家", english: "Logician",
    group: "分析家", groupEn: "Analysts",
    profile: { E: 0.1, S: 0.1, T: 0.9, J: 0.1 },
    traits: "永久在线的分析引擎，对精确理解有执念。喜欢找系统里的漏洞，对「约定俗成」持天然怀疑。在思想里最自在，在现实执行里最笨拙。",
    verse: "我什么都不知道，除了我不知道这件事本身。", verseSource: "苏格拉底",
  },
  {
    code: "ENTJ", id: "entj", title: "指挥官", english: "Commander",
    group: "分析家", groupEn: "Analysts",
    profile: { E: 0.9, S: 0.1, T: 0.9, J: 0.9 },
    traits: "天然的领导者，以愿景和效率为驱动力。对低效率感到真实的痛苦。能在混乱中看见结构，在犹豫中找到方向。代价是有时忘记别人需要更多时间。",
    verse: "领导力不是一种职位，是一种选择。", verseSource: "斯蒂芬·科维",
  },
  {
    code: "ENTP", id: "entp", title: "辩论家", english: "Debater",
    group: "分析家", groupEn: "Analysts",
    profile: { E: 0.9, S: 0.1, T: 0.9, J: 0.1 },
    traits: "以思想为游乐场，喜欢挑战所有假设，有时连自己的也不放过。话语是工具也是武器。真正的敌人不是对手，而是无聊。",
    verse: "对于问题，如果你不质疑，你就是问题的一部分。", verseSource: "埃尔德里奇·克利弗",
  },
  // Diplomats
  {
    code: "INFJ", id: "infj", title: "提倡者", english: "Advocate",
    group: "外交家", groupEn: "Diplomats",
    profile: { E: 0.1, S: 0.1, T: 0.1, J: 0.9 },
    traits: "人群中最稀少的类型。对人性有深刻而有时令人不适的洞察，有强烈的使命感。极度私人，却又对人类整体怀有深切关怀。那道内心的门很少完全打开。",
    verse: "最深的孤独，不是独处，而是身处人群却无法被理解。", verseSource: "乔治·桑",
  },
  {
    code: "INFP", id: "infp", title: "调停者", english: "Mediator",
    group: "外交家", groupEn: "Diplomats",
    profile: { E: 0.1, S: 0.1, T: 0.1, J: 0.1 },
    traits: "内心有一个巨大的道德宇宙，外表却往往安静克制。理想主义不是幼稚，是一种选择。情感深度极高，但不是每个人都被允许看见。",
    verse: "做你自己，世界会习惯的。", verseSource: "奥斯卡·王尔德",
  },
  {
    code: "ENFJ", id: "enfj", title: "主人公", english: "Protagonist",
    group: "外交家", groupEn: "Diplomats",
    profile: { E: 0.9, S: 0.1, T: 0.1, J: 0.9 },
    traits: "天然的感召者，以看见他人成长为己任。有真实的领导力，但驱动它的不是权力欲，是对人的关怀。代价是有时忘记照顾自己。",
    verse: "你在别人生命里种下的东西，是你离开后仍然生长的部分。", verseSource: "亨利·大卫·梭罗",
  },
  {
    code: "ENFP", id: "enfp", title: "竞选者", english: "Campaigner",
    group: "外交家", groupEn: "Diplomats",
    profile: { E: 0.9, S: 0.1, T: 0.1, J: 0.1 },
    traits: "对可能性上瘾，在观念的世界里最自在。热情是真实的，分散也是真实的。现实细节是他们的弱点，也是他们不太愿意承认的事。",
    verse: "生命太短暂，不能只活一种可能。", verseSource: "弗兰克尔",
  },
  // Sentinels
  {
    code: "ISTJ", id: "istj", title: "物流师", english: "Logistician",
    group: "守护者", groupEn: "Sentinels",
    profile: { E: 0.1, S: 0.9, T: 0.9, J: 0.9 },
    traits: "以事实、责任和可靠性为核心。有超强的执行能力和对承诺的内在尊重。「说到做到」不是口号，是生存方式。",
    verse: "不是因为事情困难，我们才不去尝试；是因为我们不去尝试，事情才变得困难。", verseSource: "塞内卡",
  },
  {
    code: "ISFJ", id: "isfj", title: "守卫者", english: "Defender",
    group: "守护者", groupEn: "Sentinels",
    profile: { E: 0.1, S: 0.9, T: 0.1, J: 0.9 },
    traits: "记得每一个细节，把照顾好所有人当成隐性责任。给予是自然的，要求回报是困难的。外表谦逊，内在却有超强的稳定性。",
    verse: "真正的慷慨是在无人知晓的地方发生的那种。", verseSource: "加缪",
  },
  {
    code: "ESTJ", id: "estj", title: "总经理", english: "Executive",
    group: "守护者", groupEn: "Sentinels",
    profile: { E: 0.9, S: 0.9, T: 0.9, J: 0.9 },
    traits: "对应该怎么做有强烈的想法，并且会付诸行动。社会结构的坚定维护者，规则不是约束，是秩序的基础。",
    verse: "一个没有纪律的自由，比任何独裁都更具破坏力。", verseSource: "埃蒙德·柏克",
  },
  {
    code: "ESFJ", id: "esfj", title: "执政官", english: "Consul",
    group: "守护者", groupEn: "Sentinels",
    profile: { E: 0.9, S: 0.9, T: 0.1, J: 0.9 },
    traits: "群体的连接点和温度的来源。对社交和谐有真实的需求。把别人的需要放在自己前面，有时忘记这本身也需要资源。",
    verse: "我们不是活在世界上，而是活在彼此之间。", verseSource: "马丁·布伯",
  },
  // Explorers
  {
    code: "ISTP", id: "istp", title: "鉴赏家", english: "Virtuoso",
    group: "探索者", groupEn: "Explorers",
    profile: { E: 0.1, S: 0.9, T: 0.9, J: 0.1 },
    traits: "用双手和头脑理解世界的人。内在冷静，观察力极强。对理论不太有耐心，对实际问题却有天然的直觉。情感表达不是强项，行动才是语言。",
    verse: "当你真正理解一件事，你不需要解释它，你只需要展示它。", verseSource: "理查·费曼",
  },
  {
    code: "ISFP", id: "isfp", title: "探险家", english: "Adventurer",
    group: "探索者", groupEn: "Explorers",
    profile: { E: 0.1, S: 0.9, T: 0.1, J: 0.1 },
    traits: "活在感官和当下，有独特的美学眼光。不愿被定义，不愿被约束。情感是真实的，只是不轻易展示。内心的价值观比外表看起来坚定得多。",
    verse: "美是存在的一种方式，不是需要被证明的东西。", verseSource: "里尔克",
  },
  {
    code: "ESTP", id: "estp", title: "企业家", english: "Entrepreneur",
    group: "探索者", groupEn: "Explorers",
    profile: { E: 0.9, S: 0.9, T: 0.9, J: 0.1 },
    traits: "现场感极强，说服力天然存在。最活在当下的类型，现实就是游乐场。行动先于思考是本能，长期后果是需要提醒的事。",
    verse: "机会不会等你做好准备。", verseSource: "纳帕莱昂·博纳巴特",
  },
  {
    code: "ESFP", id: "esfp", title: "表演者", english: "Entertainer",
    group: "探索者", groupEn: "Explorers",
    profile: { E: 0.9, S: 0.9, T: 0.1, J: 0.1 },
    traits: "能量在有人的地方最足。感受力极高，让周围的人觉得被看见和被珍视。当下是家园，未来计划是陌生的语言。",
    verse: "生命最重要的不是你得到了什么，而是你给别人带来了什么感受。", verseSource: "马雅·安杰卢",
  },
];

// ── Writing Guide ──────────────────────────────────────────────
const WRITING_GUIDE = `
## 写作风格指南

**总原则**
- 全程用「你」，不用「他们」
- 写具体情境，不写抽象特质
- 每段80-120字，各段不等长，不能格式化
- 文学性，不是心理学报告
- 让读者感到「被看见」，不是「被分析」

**禁止词**
游刃有余 / 得心应手 / 如鱼得水 / 成就感 / 满足感 / 卓越 / 出众 / 独特 / 优秀 / 你一定能 / 相信你会

**Portrait（简介）4段**
- 第1段：建立这个人格的画像，用一个具体场景打开
- 第2段：内在驱动力是什么，不是行为，是动机
- 第3段：内在矛盾——「你既...又...」，悖论比描述更真实
- 第4段：潜力或代价——活到极致时你是什么样的

**Strengths（强项）6条**
- label：3-6字
- description：60-80字
  - 第1句：具体场景（你会在...时...）
  - 第2句：为什么这是你独特的能力
- 不写行为，写内在能力的来源

**Weaknesses（弱项）6条**
- label：3-6字
- description：60-80字
  - 以「代价」框架，不是道德批判
  - 末句暗示「这是X的必然代价」

**romanticRelationships（恋爱）4段，每段100-120字**
- 第1段：你如何进入亲密关系——什么吸引你，什么让你止步
- 第2段：你在关系中的模式——你给予什么，你需要什么
- 第3段：常见的困难和冲突——真实的，不要美化
- 第4段：什么样的关系真正适合你

**friendships（友谊）3段，每段100-120字**
- 第1段：你如何选择朋友，你的择友标准
- 第2段：你在友谊中的角色和给予
- 第3段：你在友谊中的局限

**parenthood（为人父母）3段，每段100-120字**
- 第1段：你的养育风格和核心价值观
- 第2段：你作为父母给孩子的独特东西
- 第3段：你作为父母的挑战和盲区

**careerPaths（职业方向）3段，每段100-120字**
- 第1段：你最适合的工作环境（列举3-4个具体职业方向）
- 第2段：你在职业上的核心优势
- 第3段：你在职业上常见的困境

**workplaceHabits（职场行为）3段，每段100-120字**
- 第1段：你作为下属时的特点
- 第2段：你作为同事时的特点
- 第3段：你作为管理者时的特点
`;

// ── Prompt Builder ─────────────────────────────────────────────
function buildPrompt(type) {
  return `你是一位精通MBTI人格理论和中文文学写作的内容专家，正在为MYTYPE App创作${type.code}（${type.title}）的完整人格档案。

## 类型信息
- 代号：${type.code}（${type.english}）
- 中文名：${type.title}
- 分组：${type.group}（${type.groupEn}）
- 核心特质：${type.traits}

${WRITING_GUIDE}

## 输出要求

输出完整JSON对象，所有内容用中文，用「你」，严格按以下格式：

\`\`\`json
{
  "id": "${type.id}",
  "typeCode": "${type.code}",
  "title": "${type.title}",
  "englishTitle": "${type.english}",
  "group": "${type.group}",
  "groupEnglish": "${type.groupEn}",
  "subtitle": "（10-20字，概括这个类型的核心气质，不是标语）",
  "token": "（2-4字，身份代币，有尊严的独立称号，不是类型名的缩写）",
  "boldQuote": "（1-2句，关于这类人最尖锐的一个观察，让读者第一眼想发出去）",
  "verse": "${type.verse}",
  "verseSource": "${type.verseSource}",
  "portrait": "第1段内容\\n\\n第2段内容\\n\\n第3段内容\\n\\n第4段内容",
  "strengths": [
    {"label": "强项名", "description": "60-80字描述"},
    {"label": "强项名", "description": "60-80字描述"},
    {"label": "强项名", "description": "60-80字描述"},
    {"label": "强项名", "description": "60-80字描述"},
    {"label": "强项名", "description": "60-80字描述"},
    {"label": "强项名", "description": "60-80字描述"}
  ],
  "weaknesses": [
    {"label": "弱项名", "description": "60-80字描述"},
    {"label": "弱项名", "description": "60-80字描述"},
    {"label": "弱项名", "description": "60-80字描述"},
    {"label": "弱项名", "description": "60-80字描述"},
    {"label": "弱项名", "description": "60-80字描述"},
    {"label": "弱项名", "description": "60-80字描述"}
  ],
  "romanticRelationships": "第1段\\n\\n第2段\\n\\n第3段\\n\\n第4段",
  "friendships": "第1段\\n\\n第2段\\n\\n第3段",
  "parenthood": "第1段\\n\\n第2段\\n\\n第3段",
  "careerPaths": "第1段\\n\\n第2段\\n\\n第3段",
  "workplaceHabits": "第1段\\n\\n第2段\\n\\n第3段",
  "dimension_profile": ${JSON.stringify(type.profile)}
}
\`\`\`

只输出JSON，不要其他文字。`;
}

// ── HTTP helpers ───────────────────────────────────────────────
function httpPost(hostname, p, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path: p, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers }
    }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error(raw.slice(0, 300))); } });
    });
    req.on("error", reject);
    req.write(data); req.end();
  });
}

function httpGet(hostname, p) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path: p }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error(raw.slice(0, 300))); } });
    }).on("error", reject);
  });
}

// ── AI call ───────────────────────────────────────────────────
async function callAI(prompt) {
  if (PROVIDER === "deepseek") {
    const res = await httpPost("api.deepseek.com", "/v1/chat/completions",
      { Authorization: `Bearer ${DEEPSEEK_KEY}` },
      { model: "deepseek-chat", messages: [{ role: "user", content: prompt }],
        temperature: 0.82, max_tokens: 5000 });
    return res.choices?.[0]?.message?.content || "";
  }
  if (PROVIDER === "anthropic") {
    const res = await httpPost("api.anthropic.com", "/v1/messages",
      { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      { model: "claude-opus-4-5", max_tokens: 5000,
        messages: [{ role: "user", content: prompt }] });
    return res.content?.[0]?.text || "";
  }
  if (PROVIDER === "gemini") {
    const res = await httpPost(
      "generativelanguage.googleapis.com",
      `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {},
      { contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.82, maxOutputTokens: 5000 } });
    return res.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  throw new Error("Unknown provider");
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) { try { return JSON.parse(raw[0]); } catch {} }
  return null;
}

function validate(result) {
  const required = ["portrait", "strengths", "weaknesses", "romanticRelationships",
                    "friendships", "parenthood", "careerPaths", "workplaceHabits"];
  for (const f of required) {
    if (!result[f]) return `missing field: ${f}`;
  }
  if ((result.strengths || []).length < 6) return "strengths < 6";
  if ((result.weaknesses || []).length < 6) return "weaknesses < 6";
  return null;
}

// ── Upload helpers ─────────────────────────────────────────────
async function getAccessToken() {
  const res = await httpGet("api.weixin.qq.com",
    `/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`);
  if (!res.access_token) throw new Error(JSON.stringify(res));
  return res.access_token;
}

async function uploadQuiz(quiz) {
  console.log("  🔑  Getting access_token...");
  const token = await getAccessToken();
  const body = JSON.stringify({ action: "updateQuiz", data: quiz });
  const res = await httpPost("api.weixin.qq.com",
    `/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=quizWriter`,
    {}, { action: "updateQuiz", data: quiz });
  if (res.errcode && res.errcode !== 0) throw new Error(JSON.stringify(res));
  const inner = JSON.parse(res.resp_data || "{}");
  if (inner.error) throw new Error(inner.error);
  console.log("  ✅  Uploaded.");
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const quiz = JSON.parse(fs.readFileSync(QUIZ_PATH, "utf-8"));

  // Update resultPage to the new mbti-result page
  quiz.resultPage = "/subpackages/quiz/pages/mbti-result/mbti-result";

  const types = TYPE_ONLY
    ? MBTI_TYPES.filter(t => t.code === TYPE_ONLY)
    : MBTI_TYPES;

  if (TYPE_ONLY && types.length === 0) {
    console.error(`❌  Unknown type: ${TYPE_ONLY}`);
    process.exit(1);
  }

  console.log(`\n🧠  MBTI Full Rewrite — ${types.length} type(s)`);
  if (DRY_RUN) {
    console.log("\n── DRY RUN: prompt for first type ──");
    console.log(buildPrompt(types[0]));
    return;
  }
  console.log(`🤖  Provider: ${PROVIDER}\n`);

  // Load existing results to preserve any we're not rewriting
  const existingById = {};
  for (const r of (quiz.results || [])) {
    existingById[r.id] = r;
  }

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    console.log(`[${i + 1}/${types.length}] ${type.code} ${type.title}`);

    let result = null;
    let attempt = 0;

    while (attempt < 3 && !result) {
      attempt++;
      try {
        const prompt = buildPrompt(type);
        const raw = await callAI(prompt);
        const parsed = extractJson(raw);
        const err = parsed ? validate(parsed) : "JSON parse failed";
        if (err) {
          console.warn(`  ⚠️  Attempt ${attempt}: ${err}`);
        } else {
          parsed.id = type.id;  // ensure lowercase id
          result = parsed;
          console.log(`  ✓  token="${result.token}" subtitle="${(result.subtitle||"").slice(0,20)}..."`);
        }
      } catch (e) {
        console.warn(`  ⚠️  Attempt ${attempt} error: ${e.message.slice(0, 80)}`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (!result) {
      console.error(`  ❌  Failed after 3 attempts — keeping original`);
      result = existingById[type.id] || { id: type.id, title: type.title };
    }

    existingById[type.id] = result;

    // Rate limit
    if (i < types.length - 1) {
      const delay = PROVIDER === "gemini" ? 5000 : 2000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Rebuild results array in MBTI_TYPES order
  quiz.results = MBTI_TYPES.map(t => existingById[t.id]).filter(Boolean);

  fs.writeFileSync(QUIZ_PATH, JSON.stringify(quiz, null, 2), "utf-8");
  console.log(`\n💾  Saved → ${QUIZ_PATH}`);

  if (UPLOAD) {
    if (!APPID || !APPSECRET) {
      console.error("❌  Missing WX_APPID / WX_APPSECRET");
    } else {
      await uploadQuiz(quiz);
    }
  } else {
    console.log("💡  Pass --upload to push to cloud");
  }

  console.log("\n✅  Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
