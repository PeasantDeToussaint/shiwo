#!/usr/bin/env node
/**
 * review-quizzes-zhipu.js
 *
 * Calls Zhipu (智谱) GLM chat API to review quiz JSON files one by one as an editor:
 * suitability (topic match, ethics, clarity) and variety (question overlap, option balance, scoring sanity).
 *
 * Prerequisites:
 *   export ZHIPU_API_KEY=...   (or put in repo-root .env)
 *
 * Usage:
 *   node scripts/review-quizzes-zhipu.js
 *   node scripts/review-quizzes-zhipu.js --dir=scripts/22newquizes --out=scripts/quiz-review-zhipu.md
 *   node scripts/review-quizzes-zhipu.js --only=imperial-examination-simulation,bird-personality-test
 *   node scripts/review-quizzes-zhipu.js --full --delay=2000 --model=glm-4-flash
 *   node scripts/review-quizzes-zhipu.js --dry-run
 *
 * GitHub Actions: 仓库工作流「智谱审稿（测验合集）」会跑本脚本，将全套意见写入
 * scripts/quiz-review-zhipu-report.md 并作为 Artifact「zhipu-quiz-review」上传（需配置 Secrets.ZHIPU_API_KEY）。
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}

const ZHIPU_KEY = process.env.ZHIPU_API_KEY;
const HTTP_TIMEOUT_MS = 180000;
const DEFAULT_DIR = path.resolve(__dirname, "22newquizes");
const DEFAULT_OUT = path.resolve(__dirname, "quiz-review-zhipu.md");
const DEFAULT_MODEL = process.env.ZHIPU_REVIEW_MODEL || "glm-4-flash";
const DEFAULT_DELAY_MS = 1500;

const ARGS = process.argv.slice(2);

function argVal(prefix, fallback) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  if (!a) return fallback;
  return a.slice(prefix.length).replace(/^=["']?|["']$/g, "") || fallback;
}

const DIR = path.resolve(argVal("--dir=", DEFAULT_DIR));
const GLOB = argVal("--glob=", "*.json");
const OUT = path.resolve(argVal("--out=", DEFAULT_OUT));
const MODEL = argVal("--model=", DEFAULT_MODEL);
const DELAY_MS = parseInt(argVal("--delay=", String(DEFAULT_DELAY_MS)), 10) || DEFAULT_DELAY_MS;
const ONLY = argVal("--only=", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FULL = ARGS.includes("--full");
const DRY = ARGS.includes("--dry-run");
const HELP = ARGS.includes("--help") || ARGS.includes("-h");

if (HELP) {
  console.log(`
review-quizzes-zhipu.js — Zhipu API editorial review for quiz JSON files

Env:  ZHIPU_API_KEY (required unless --dry-run)
      ZHIPU_REVIEW_MODEL optional default for --model

Args:
  --dir=PATH       Folder of quiz JSON (default: scripts/22newquizes)
  --glob=PATTERN   Filename glob filter (default: *.json)
  --out=FILE       Markdown report path (default: scripts/quiz-review-zhipu.md)
  --model=NAME     e.g. glm-4-flash, glm-4-plus
  --delay=MS       Pause between API calls (default: ${DEFAULT_DELAY_MS})
  --only=id1,id2   Limit to quiz id(s) matching JSON "id" field
  --full           Include longer result excerpts (portrait preview)
  --dry-run        Print payloads only, no API calls
  --help           This help
`);
  process.exit(0);
}

function httpPost(url, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error("HTTP POST timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s, max) {
  if (s == null) return "";
  const t = String(s);
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

function listQuizFiles(dir, globPat) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const suffix = globPat.replace(/^\*/, "");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix) && f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort();
}

function buildPayload(quiz, { full }) {
  const scoring = quiz.scoring || {};
  const dims = scoring.dimensions || [];
  const axes = (scoring.dimensionAxes || []).map((a) => ({
    dimension: a.dimension,
    axisLabel: a.axisLabel,
    lowPole: a.lowPole,
    highPole: a.highPole,
    insight: truncate(a.insight || a.highInsight || a.lowInsight, full ? 400 : 200),
  }));
  const bands = (scoring.bands || []).map((b) => ({
    resultId: b.resultId,
    rank: b.rank,
    min: b.min,
    max: b.max,
  }));

  const questions = (quiz.questions || []).map((q) => ({
    id: q.id,
    text: q.text,
    options: (q.options || []).map((o) => ({
      id: o.id,
      text: o.text,
      reaction: o.reaction,
      scores: o.scores && typeof o.scores === "object" ? o.scores : undefined,
    })),
  }));

  const resultsSummary = (quiz.results || []).map((r) => {
    const row = {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      levelRank: r.levelRank,
    };
    if (full && r.portrait) {
      row.portraitPreview = truncate(r.portrait, 500);
    }
    return row;
  });

  return {
    id: quiz.id,
    title: quiz.title,
    subtitle: quiz.subtitle,
    eyebrow: quiz.eyebrow,
    description: quiz.description,
    estimatedMinutes: quiz.estimatedMinutes,
    scoring: {
      type: scoring.type,
      levelLabel: scoring.levelLabel,
      dimensions: dims,
      dimensionAxes: axes,
      bands: bands.length ? bands : undefined,
      resultsStubCount: (scoring.results || []).length,
    },
    questionCount: questions.length,
    questions,
    resultsSummary,
  };
}

const SYSTEM_PROMPT = `你是「微信小程序 / H5 互动测验」的资深中文编辑兼关卡策划，审稿对象是趣味自测、文化或 IP 向测验，不是临床心理量表。

## 输入说明
用户会贴一份「测验摘要」JSON，字段含义如下（未出现则忽略相关检查）：
- eyebrow / title / subtitle / description / estimatedMinutes：包装与预期管理。
- scoring.type：计分逻辑类型（如 level-band、weighted-match、cosine 等）；须与导语承诺一致。
- scoring.dimensions：维度 id 列表。
- scoring.dimensionAxes：每个维度一条轴，含 lowPole / highPole（语义两极）；题干与选项应能支撑「沿该轴区分用户」，且加分方向与轴语义不可明显反向。
- scoring.bands：level-band 时常用，含 resultId、rank、min、max；须检查区间是否合理（不重叠或故意重叠是否有说明）、rank 与结果梯度是否一致。
- questions[].id：题目 id，你指出问题时必须优先引用此 id（如 q_imperial_03）。
- questions[].options[].scores：若存在，为各维度或结果 id 的数值权重；用于判断「选项区分度」「是否某选项在多数维度上全面碾压」「同一题各选项分桶是否过近」。
- resultsSummary：结果档位或原型标题；须与导语 tone、敏感话题表述匹配。

## 审稿量表（请逐项在心里过一遍，写入对应小节；无问题写「未发现明显问题」并可略写）

### A. 产品定位与导语一致性
- 用户完成测验后得到的应是导语所承诺的东西（人格原型 / 适合度 / 知识得分 / 趣味标签等）；若 scoring 是「总分分档」而导语写「测出你是哪种人」，指出错位。
- estimatedMinutes 与题量是否大致匹配（偏差过大则标出）。

### B. 合规与伦理（趣味测验红线）
- 避免出现「诊断」「病症」「你患有」「确诊」等医疗表述；应改为「倾向」「趣味结果」「仅供参考」类表述，若导语或结果文案越界请标出位置（引原文短语）。
- 亲密关系、出轨、忠诚度类：避免羞辱某一性别/角色、避免诱导用户监视伴侣；若选项在美化控制欲、跟踪、查手机合理化，须标出题号并建议改写。
- 心理健康类：避免轻率绑定抑郁/焦虑等标签；若结果文案可能加重自我否定，指出并建议软化或加免责。
- 身体、学历、收入、地域歧视或刻板印象：具体引用措辞。

### C. 题目 variety（丰富度与同构）
- 「同构」指：同一抽象问法换场景重复测（例如多道题都在问「你更理性还是感性」）；请尽量标出两组题 id + 一句理由。
- 题干句式是否过度单一（连续「你会…」「如果…」）；是否缺少具体情境支撑主题。
- 知识类题：干扰项是否敷衍（明显荒谬或三个空泛一个具体）；答案是否存在争议或依赖冷门冷知识。

### D. 选项设计质量
- 四选一是否存在「社会赞许性」唯一正解（道德上唯一正确），导致区分度塌缩；请结合 scores 若存在，看是否总是同一选项在多数维度上全面偏高。
- 选项长度、语气是否严重失衡（一长三短常被盲选长的）。
- reaction（若有）：是否与题干语气、世界观一致，是否剧透结果或破坏沉浸。

### E. 计分与结果结构（有 scoring / scores 时必须认真看）
- dimensionAxes：任选一题，用常识判断「选某极」应对应 low 还是 high；若文案像 highPole 行为却给 low 维度加分，记为「方向可疑」并写题号。
- bands：min/max 是否覆盖宣称满分；相邻 band 是否断层或重叠无解释；resultId 数量与 bands 是否对齐。
- resultsSummary：档位名称是否形成清晰梯度；是否存在两档文案几乎重复。
- 若某题各选项 scores 向量几乎相同，指出「区分度不足」。

### F. 题材专项（仅当主题明显命中时写 2～4 点，否则写「不适用」）
- IP / 影视 / 文学 / 游戏：是否对路人门槛过高、是否含重大剧透、设定是否与原作明显冲突。
- 历史 / 科举 / 传统文化：史实、制度表述是否可能硬伤（不确定用「待核实」而非编造）。

## 输出格式（严格遵守）
全文用**中文**。使用以下 Markdown 小节标题（字面无改）：

## 总体适宜性
用 4～8 条短句，覆盖 A+B 量表；有问题的句子里用括号注明依据（题号或「导语」「某结果标题」）。

## 题型与内容丰富度
用 4～8 条短句，覆盖 C+D；必须包含一句「同构风险：高/中/低」并简述理由。

## 计分与结构
覆盖 E；若无 bands/dimensionAxes/scores，说明「摘要中缺少何种字段，无法深度检查」并基于已有信息写能做的部分。

## 题材专项
按 F。

## 优先修改清单
- 恰好 **5 条**，按优先级排序。
- 每条格式固定为：\`P0|\` / \`P1|\` / \`P2|\` 开头，接着写「[题号或区域] 具体问题 → 建议改法（动宾短语）」。
- P0=合规/严重误导/计分方向错误；P1=体验与同构/区分度；P2=润色与锦上添花。

## 一句话结论
单独一行，格式：「结论：上架 | 小修可上架 | 需中大改 | 不建议上架 ——」+ 不超过 25 字的核心理由。

## 禁止
不要复述整段 JSON；不要输出虚构的题号；没有 scores 时不要编造各选项权重。`;

async function callZhipu(userContent) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
  const res = await httpPost(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    {
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.35,
      messages,
      stream: false,
    },
    { Authorization: `Bearer ${ZHIPU_KEY}` }
  );
  if (res.error) {
    throw new Error(`Zhipu: ${JSON.stringify(res.error)}`);
  }
  const msg = res.choices?.[0]?.message?.content;
  if (!msg) throw new Error(`Zhipu: empty choices: ${JSON.stringify(res).slice(0, 300)}`);
  return msg;
}

async function main() {
  if (!DRY && !ZHIPU_KEY) {
    console.error("Missing ZHIPU_API_KEY. Set env or add to .env at repo root.");
    process.exit(1);
  }

  let files = listQuizFiles(DIR, GLOB);
  if (ONLY.length) {
    files = files.filter((fp) => {
      try {
        const q = JSON.parse(fs.readFileSync(fp, "utf8"));
        return ONLY.includes(q.id);
      } catch {
        return false;
      }
    });
  }

  if (files.length === 0) {
    console.error("No JSON files matched.");
    process.exit(1);
  }

  console.log(`Review ${files.length} file(s) → ${OUT}`);
  const header = `# 智谱审稿报告\n\n- 模型: \`${MODEL}\`\n- 目录: \`${DIR}\`\n- 生成: ${new Date().toISOString()}\n- full=${FULL}\n\n---\n\n`;
  fs.writeFileSync(OUT, header, "utf8");

  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    let quiz;
    try {
      quiz = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch (e) {
      console.error(`Skip (parse error): ${fp}`, e.message);
      continue;
    }
    const payload = buildPayload(quiz, { full: FULL });
    const userBlock =
      `## 任务\n` +
      `请根据系统提示中的量表，对下面这份「单套测验摘要」做编辑审稿。\n` +
      `要求：凡指出缺陷，优先标注 \`questions[].id\`；涉及导语或结果时指明字段名。若某类检查因缺少字段无法做，明确写出「因缺少 xxx 字段未检」。\n\n` +
      `## 文件\n\`${path.basename(fp)}\`\n\n` +
      `## 测验摘要（JSON）\n\n` +
      "```json\n" +
      JSON.stringify(payload, null, 2) +
      "\n```\n\n" +
      `请直接输出审稿正文（从第一个 ## 小节标题开始），勿在文首重复 JSON。`;

    console.log(`[${i + 1}/${files.length}] ${quiz.id || path.basename(fp)} …`);

    let review;
    if (DRY) {
      review = "_(dry-run — no API call)_\n\n" + truncate(userBlock, 800);
    } else {
      try {
        review = await callZhipu(userBlock);
      } catch (e) {
        review = `**API 错误**: ${e.message}`;
        console.error(e.message);
      }
      await sleep(DELAY_MS);
    }

    const section = `## ${quiz.title || quiz.id} (\`${quiz.id}\`)\n\n${review}\n\n---\n\n`;
    fs.appendFileSync(OUT, section, "utf8");
  }

  console.log(`Done. Report: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
