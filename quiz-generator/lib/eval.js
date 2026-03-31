const { callAI } = require('./ai');
const { extractJSON } = require('./json-repair');
const { LITERARY_GUIDE } = require('./style-guide');
const {
  normalizeStrengthsWeaknesses, normalizeResultExtras,
} = require('./assemble');

function summarizeQuizForEvaluation(quiz) {
  const results = (quiz.results || []).map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    token: r.token,
    verse: r.verse,
    verseSource: r.verseSource,
    portrait: r.portrait || null,
    strengths:  normalizeStrengthsWeaknesses(r.strengths,  "strengths",  r.id) || [],
    weaknesses: normalizeStrengthsWeaknesses(r.weaknesses, "weaknesses", r.id) || [],
    temperament: r.temperament || null,
    situation: r.situation || null,
    lifeAdvice: r.lifeAdvice || null,
    destiny: r.destiny || null,
    extras: Array.isArray(r.extras)
      ? normalizeResultExtras(r.extras, r.id).map(e => ({ key: e.key, label: e.label, content: e.content }))
      : [],
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

module.exports = { summarizeQuizForEvaluation, evaluateQuiz, printEvalReport };
