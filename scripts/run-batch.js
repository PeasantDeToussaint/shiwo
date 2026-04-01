#!/usr/bin/env node
/**
 * run-batch.js — 在当前环境顺序生成所有测验（供 GitHub Actions 直接调用）
 *
 * 环境变量：
 *   QUIZZES   逗号分隔序号（如 "1,3,12"）或 "all"，默认 all
 *   DRY_RUN   "true" / "false"，默认 true
 *   ESTIMATE  "true" / "false"，默认 false
 *   SKIP_EVAL "true" / "false"，默认 false
 */

const { spawnSync } = require("child_process");
const path = require("path");
const QUIZZES = require("./quiz-catalog");

const quizzesInput = (process.env.QUIZZES || "all").trim();
const dryRun  = process.env.DRY_RUN  !== "false";
const estimate = process.env.ESTIMATE === "true";
const skipEval = process.env.SKIP_EVAL === "true";

// Select quizzes
let selected;
if (quizzesInput === "all") {
  selected = QUIZZES.map((q, i) => ({ ...q, _idx: i + 1 }));
} else {
  selected = quizzesInput.split(",").map(t => {
    const n = parseInt(t.trim(), 10);
    const q = QUIZZES[n - 1];
    if (!q) { console.error(`❌  序号 ${n} 不存在`); process.exit(1); }
    return { ...q, _idx: n };
  });
}

const scriptPath = path.join(__dirname, "generate-quiz_副本.js");

console.log(`\n🚀  批量生成 ${selected.length} 个测验（顺序执行）`);
console.log(`    dry-run=${dryRun}  estimate=${estimate}  skip-eval=${skipEval}\n`);

let passed = 0, failed = 0;

for (let i = 0; i < selected.length; i++) {
  const q = selected[i];
  const badge = q.scoring === "bipolar-dimension" ? " ★" : q.scoring === "level-band" ? " ▲" : "";

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${i + 1}/${selected.length}] #${q._idx} ${q.title}${badge}`);
  console.log(`    scoring=${q.scoring}  r=${q.results}  d=${q.dimensions}  q=${q.questions}`);
  console.log(`${"─".repeat(60)}`);

  const args = [
    scriptPath,
    `--topic=${q.title}`,
    `--title=${q.title}`,
    `--id=${q.id}`,
    `--scoring=${q.scoring}`,
    `--results=${q.results}`,
    `--dimensions=${q.dimensions}`,
    `--questions=${q.questions}`,
    `--provider=zhipu`,
  ];

  for (const hint of (q.hints || [])) {
    args.push(`--hint=${hint}`);
  }

  if (dryRun)   args.push("--dry-run");
  if (estimate) args.push("--estimate");
  if (skipEval) args.push("--skip-eval");

  const result = spawnSync("node", args, { stdio: "inherit", encoding: "utf8" });

  if (result.status === 0) {
    console.log(`\n✅  [${i + 1}/${selected.length}] 完成`);
    passed++;
  } else {
    console.error(`\n❌  [${i + 1}/${selected.length}] 失败（exit ${result.status}）——继续下一个`);
    failed++;
  }
}

console.log(`\n${"═".repeat(60)}`);
console.log(`全部完成：${passed} 成功，${failed} 失败`);
console.log(`${"═".repeat(60)}\n`);

if (failed > 0) process.exit(1);
