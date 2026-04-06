/**
 * Shared helpers for quiz editorial review scripts (Zhipu / OpenAI).
 */

const fs = require("fs");
const path = require("path");

function loadRepoEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  let text = fs.readFileSync(envPath, "utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const eq = t.indexOf("=");
    if (eq <= 0) return;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val;
  });
}

function truncate(s, max) {
  if (s == null) return "";
  const t = String(s);
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

/** Support flat quiz JSON or { quiz: {...} } / nested quiz.quiz exports. */
function unwrapQuizJson(j) {
  if (!j || Array.isArray(j)) return null;
  if (j.quiz && j.quiz.quiz && typeof j.quiz.quiz === "object") return j.quiz.quiz;
  if (j.quiz && typeof j.quiz === "object") return j.quiz;
  return j;
}

function buildPayload(raw, { full }) {
  const quiz = unwrapQuizJson(raw) || raw;
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
      bandPoints: typeof o.bandPoints === "number" ? o.bandPoints : undefined,
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

  const hasAnyScores = questions.some((q) =>
    (q.options || []).some((o) => o.scores && Object.keys(o.scores).length > 0)
  );

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
    _metaForModel: {
      hasOptionScores: hasAnyScores,
      hasBands: bands.length > 0,
      hasDimensionAxes: axes.length > 0,
    },
  };
}

const SYSTEM_PROMPT = `你是「微信小程序 / H5 互动测验」的资深中文编辑兼关卡策划，审稿对象是趣味自测、文化或 IP 向测验，不是临床心理量表。

## 输入说明
用户会贴一份「测验摘要」JSON，字段含义如下（未出现则忽略相关检查）：
- 摘要末尾 _metaForModel：hasOptionScores / hasBands / hasDimensionAxes 为布尔值，表示本摘要是否包含可检查的选项分、bands、维度轴。**若 hasOptionScores 为 true，禁止写「因缺少 scores 字段未检」。**
- eyebrow / title / subtitle / description / estimatedMinutes：包装与预期管理。
- scoring.type：计分逻辑类型（如 level-band、weighted-match、cosine 等）；须与导语承诺一致。
- scoring.dimensions：维度 id 列表。
- scoring.dimensionAxes：每个维度一条轴，含 lowPole / highPole（语义两极）；题干与选项应能支撑「沿该轴区分用户」，且加分方向与轴语义不可明显反向。
- scoring.bands：level-band 时常用，含 resultId、rank、min、max；对「归一化可达分 t」的 0～1 分档须与导语一致；卷面原始分档须覆盖宣称满分。禁止导语暗示「科学测评」「临床级」；趣味自测应写清仅供参考。
- options[].bandPoints：level-band 若存在，与 scores 一并检查梯度；bandPoints 优先于多维度分数之和参与分档逻辑。
- questions[].id：题目 id，你指出问题时必须优先引用此 id（如 q_imperial_03）。
- questions[].options[].scores：若存在，为各维度或结果 id 的数值权重；用于判断「选项区分度」「是否某选项在多数维度上全面碾压」「同一题各选项分桶是否过近」。**声称「区分度不足」时须引用至少一题的 scores 原文片段，禁止对 q1～q5 套用相同套话。**
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
全文用**中文**，UTF-8 合法字符，不要损坏标点。使用以下 Markdown 小节标题（字面无改）：

## 总体适宜性
用 4～8 条短句，覆盖 A+B 量表；有问题的句子里用括号注明依据（题号或「导语」「某结果标题」）。

## 题型与内容丰富度
用 4～8 条短句，覆盖 C+D；必须包含一句「同构风险：高/中/低」并简述理由。

## 计分与结构
覆盖 E；若 _metaForModel 标明某类字段缺失，说明「摘要中缺少 xxx，无法深度检查」；**不得与 _metaForModel 矛盾**。

## 题材专项
按 F。

## 优先修改清单
- 恰好 **5 条**，按优先级排序。
- 每条格式固定为：\`P0|\` / \`P1|\` / \`P2|\` 开头，接着写「[题号或区域] 具体问题 → 建议改法（动宾短语）」。
- P0=合规/严重误导/计分方向错误；P1=体验与同构/区分度；P2=润色与锦上添花。
- **禁止** 5 条仅改写同一类空话（如连续五条「调整权重」而无具体题与数据）。

## 一句话结论
单独一行，**仅选其一**：结论：上架 —— … / 结论：小修可上架 —— … / 结论：需中大改 —— … / 结论：不建议上架 —— …（不超过 25 字理由）

## 禁止
不要复述整段 JSON；不要输出虚构的题号；没有 scores 时不要编造各选项权重。`;

function buildReviewUserBlock(fp, payload) {
  return (
    `## 任务\n` +
    `请根据系统提示中的量表，对下面这份「单套测验摘要」做编辑审稿。\n` +
    `要求：凡指出缺陷，优先标注 \`questions[].id\`；涉及导语或结果时指明字段名。若某类检查因缺少字段无法做，明确写出「因缺少 xxx 字段未检」，且须与摘要中的 _metaForModel 一致。\n\n` +
    `## 文件\n\`${path.basename(fp)}\`\n\n` +
    `## 测验摘要（JSON）\n\n` +
    "```json\n" +
    JSON.stringify(payload, null, 2) +
    "\n```\n\n" +
    `请直接输出审稿正文（从第一个 ## 小节标题开始），勿在文首重复 JSON。`
  );
}

module.exports = {
  loadRepoEnv,
  listQuizFiles,
  truncate,
  sleep,
  buildPayload,
  SYSTEM_PROMPT,
  buildReviewUserBlock,
  unwrapQuizJson,
};
