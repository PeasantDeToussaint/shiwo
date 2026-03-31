#!/usr/bin/env node
/**
 * generate.js — Quiz generator CLI
 *
 * Usage:
 *   node quiz-generator/generate.js --topic="你是哪种雨"
 *   node quiz-generator/generate.js --topic="你是哪位宋词词人" --dry-run
 */

const fs   = require("fs");
const path = require("path");

const config = require("./lib/config");
const { createClient } = require("./lib/ai");
const { sleep, withRetry } = require("./lib/http");
const { inferHintsFromTopic, generateArchitecture, generateOutline, generateOutlineProfiles, generateQuestions, generateResults } = require("./lib/prompts");
const { simplifyDimensions, normalizeOutlineToArchitecture, assembleQuiz, spreadProfiles, enforceUniquePeaks } = require("./lib/assemble");
const { validateDimensionProfiles, validateFinalQuiz, validateQuestions, validateResults, printWarnings, assertNoCriticalWarnings } = require("./lib/validate");
const { evaluateQuiz, printEvalReport } = require("./lib/eval");
const { uploadQuiz } = require("./lib/wechat");
const { saveCheckpoint, loadCheckpoint, clearCheckpoints } = require("./lib/checkpoint");

// ── Parse CLI args ───────────────────────────────────────────────
const ARGS      = process.argv.slice(2);
const DRY_RUN   = ARGS.includes("--dry-run");
const ESTIMATE  = ARGS.includes("--estimate");
const SKIP_EVAL = ARGS.includes("--skip-eval");
const RESUME    = ARGS.includes("--resume");
const CLEAN     = ARGS.includes("--clean");
const FORCE     = ARGS.includes("--force");
const TOPIC_ARG = (ARGS.find(a => a.startsWith("--topic=")) || "").replace("--topic=", "").replace(/^["']|["']$/g, "");
const HINT_ARGS = ARGS.filter(a => a.startsWith("--hint=")).map(a => a.replace("--hint=", "").replace(/^["']|["']$/g, ""));
const PROVIDER_ARG = (ARGS.find(a => a.startsWith("--provider=")) || "").replace("--provider=", "").replace(/^["']|["']$/g, "").toLowerCase();
const MODEL_ARG = (ARGS.find(a => a.startsWith("--model=")) || "").replace("--model=", "").replace(/^["']|["']$/g, "");
const MIN_SCORE = Number((ARGS.find(a => a.startsWith("--min-score=")) || "").replace("--min-score=", "")) || 7;

if (!TOPIC_ARG) {
  console.error("Usage: node quiz-generator/generate.js --topic=\"topic\" [--provider=zhipu|gemini|deepseek|anthropic] [--model=name] [--hint=\"约束\"] [--dry-run] [--estimate] [--skip-eval] [--resume] [--clean] [--force]");
  process.exit(1);
}

if (PROVIDER_ARG && !config.VALID_PROVIDERS.has(PROVIDER_ARG)) {
  console.error(`❌  Invalid --provider="${PROVIDER_ARG}". Use one of: zhipu, gemini, deepseek, anthropic`);
  process.exit(1);
}

const PROVIDER = config.resolveProvider(PROVIDER_ARG, MODEL_ARG);
const MODEL    = config.resolveModel(PROVIDER, MODEL_ARG);

if (!PROVIDER && !ESTIMATE) { console.error("❌  No AI API key in .env"); process.exit(1); }
if (!ESTIMATE) {
  const keyErr = config.validateProviderKey(PROVIDER);
  if (keyErr) { console.error(`❌  ${keyErr}`); process.exit(1); }
}

const aiClient = PROVIDER && MODEL ? createClient(PROVIDER, MODEL) : null;

// ── Build hint block ─────────────────────────────────────────────
const AUTO_HINTS = inferHintsFromTopic(TOPIC_ARG);
if (AUTO_HINTS.length > 0) {
  console.log(`📌  Auto-detected constraints:`);
  AUTO_HINTS.forEach(h => console.log(`     • ${h}`));
}
const ALL_HINTS  = [...AUTO_HINTS, ...HINT_ARGS];
const HINT_BLOCK = ALL_HINTS.length > 0
  ? `\n### 创作者硬性约束（必须严格遵守，不得偏离）\n${ALL_HINTS.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`
  : "";

const DATA_DIR = config.DATA_DIR;

// ── Phase timer ──────────────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (ESTIMATE) {
    const qBatches = 3, rBatches = 2;
    const evalCalls = SKIP_EVAL ? 0 : 1;
    const totalCalls = 1 + 1 + qBatches + rBatches + evalCalls;
    console.log(`\n📊  Estimate for 「${TOPIC_ARG}」\n`);
    console.log(`    API calls:        ${totalCalls}`);
    console.log(`    Provider:         ${PROVIDER || "(none configured)"}`);
    console.log(`    Est. time:        ~3–6 minutes\n`);
    return;
  }

  if (CLEAN) clearCheckpoints(TOPIC_ARG);

  console.log(`\n🚀  Generating quiz: 「${TOPIC_ARG}」  [provider: ${PROVIDER}, model: ${MODEL}]\n`);
  if (HINT_ARGS.length > 0) {
    console.log(`📌  Hints:`);
    HINT_ARGS.forEach(h => console.log(`     • ${h}`));
    console.log();
  }

  // Phase 0: Domain Architecture
  console.log("🧠  [0/3] Domain architecture...");
  startPhase("0-architecture");
  let architecture = RESUME ? loadCheckpoint(TOPIC_ARG, "phase0-architecture") : null;
  if (architecture) {
    console.log("     (resumed from checkpoint)");
  } else {
    try {
      architecture = await withRetry("architecture", () => generateArchitecture(TOPIC_ARG, HINT_BLOCK, aiClient.callAI), 4, 5000);
      saveCheckpoint(TOPIC_ARG, "phase0-architecture", architecture);
    } catch (err) {
      console.error("❌  Architecture failed:", err.message);
      process.exit(1);
    }
  }
  console.log(`     ✓  dimensions:  ${(architecture.dimensions || []).join(" / ")}`);
  console.log(`     ✓  archetypes:  ${(architecture.results || []).map(r => r.name).join(" / ")}`);
  console.log(`     (${endPhase("0-architecture")}s)`);

  await sleep(3000);

  // Phase 1: Outline
  console.log("\n📋  [1/3] Generating outline...");
  startPhase("1-outline");
  let outline = RESUME ? loadCheckpoint(TOPIC_ARG, "phase1-outline") : null;
  if (outline) {
    console.log("     (resumed from checkpoint)");
  } else {
    try {
      outline = await withRetry("outline", () => generateOutline(TOPIC_ARG, architecture, HINT_BLOCK, aiClient.callAI), 4, 5000);
      // Simplify dimensions before profile generation so profiles use canonical keys
      const origDims = [...outline.dimensions];
      outline.dimensions = simplifyDimensions(outline.dimensions);
      const dimSimplifyMap = {};
      origDims.forEach((d, i) => { dimSimplifyMap[d] = outline.dimensions[i]; });
      for (const r of outline.results) {
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
      // Phase 1b: dedicated profile generation — model sees all results at once
      // and reasons globally about Pareto-safe numeric profiles
      await withRetry("outline-profiles", () => generateOutlineProfiles(outline, architecture, aiClient.callAI), 3, 4000);
      spreadProfiles(outline.results, outline.dimensions);
      enforceUniquePeaks(outline.results, outline.dimensions);
      saveCheckpoint(TOPIC_ARG, "phase1-outline", outline);
    } catch (err) {
      console.error("❌  Outline failed:", err.message); process.exit(1);
    }
  }
  console.log(`     ✓  id:         ${outline.id}`);
  console.log(`        title:      ${outline.title}`);
  console.log(`        dimensions: ${outline.dimensions.join(" / ")}`);
  console.log(`        results:    ${outline.results.map(r => r.title).join(" / ")}`);
  console.log(`     (${endPhase("1-outline")}s)`);

  const outlineProfileWarnings = validateDimensionProfiles(
    outline.results.map(r => ({ id: r.id, dimension_profile: r.dimension_profile })),
    outline.dimensions
  );
  printWarnings("outline profiles", outlineProfileWarnings);
  assertNoCriticalWarnings("outline profiles", outlineProfileWarnings);

  await sleep(3000);

  // Phase 2: Questions
  const Q_TOTAL = (architecture && architecture.questionCount && Number.isInteger(Number(architecture.questionCount)))
    ? Math.max(12, Math.min(36, Number(architecture.questionCount)))
    : 24;
  const Q_BATCH_SIZE = Math.ceil(Q_TOTAL / 3);
  const Q_BATCHES = Array.from({ length: 3 }, (_, i) => {
    const startId = i * Q_BATCH_SIZE + 1;
    const endId   = Math.min((i + 1) * Q_BATCH_SIZE, Q_TOTAL);
    return { startId, endId, label: String(i + 1) };
  }).filter(b => b.startId <= Q_TOTAL);

  startPhase("2-questions");
  let allQuestions = RESUME ? loadCheckpoint(TOPIC_ARG, "phase2-questions") : null;
  if (allQuestions) {
    console.log(`\n📝  Questions: resumed ${allQuestions.length} from checkpoint`);
  } else {
    console.log(`\n📝  Questions: ${Q_TOTAL} total, ${Q_BATCHES.length} batches`);
    allQuestions = await withRetry("questions-phase", async () => {
      const phaseQuestions = [];
      for (const [i, { startId, endId, label }] of Q_BATCHES.entries()) {
        console.log(`\n📝  [2/3] Questions q${startId}-q${endId} (batch ${label}/${Q_BATCHES.length})...`);
        const qs = await withRetry(`questions-${label}`, () => generateQuestions(outline, startId, endId, label, Q_TOTAL, DATA_DIR, aiClient.callAI));
        phaseQuestions.push(...qs);
        console.log(`     ✓  got ${qs.length} questions`);
        if (i < Q_BATCHES.length - 1) await sleep(4000);
      }
      const questionWarnings = validateQuestions(phaseQuestions, outline.dimensions);
      printWarnings("questions", questionWarnings);
      assertNoCriticalWarnings("questions", questionWarnings);
      return phaseQuestions;
    }, 3, 5000);
    saveCheckpoint(TOPIC_ARG, "phase2-questions", allQuestions);
  }
  console.log(`     (${endPhase("2-questions")}s)`);

  await sleep(4000);

  // Phase 3: Results
  const rTotal      = outline.results.length;
  const R_BATCH_SIZE = 1;
  const rBatchCount = Math.ceil(rTotal / R_BATCH_SIZE);
  const R_BATCHES   = Array.from({ length: rBatchCount }, (_, i) =>
    outline.results.slice(i * R_BATCH_SIZE, (i + 1) * R_BATCH_SIZE)
  ).filter(b => b.length > 0);

  startPhase("3-results");
  let dedupedResults = RESUME ? loadCheckpoint(TOPIC_ARG, "phase3-results") : null;
  if (dedupedResults) {
    console.log(`\n✍️   Results: resumed ${dedupedResults.length} from checkpoint`);
  } else {
    dedupedResults = await withRetry("results-phase", async () => {
      const allResults = [];
      for (const [i, subset] of R_BATCHES.entries()) {
        console.log(`\n✍️   [3/3] Results batch ${i + 1}/${R_BATCHES.length} (${subset.length} results)...`);
        const rs = await withRetry(`results-${i + 1}`, () => generateResults(outline, subset, DATA_DIR, aiClient.callAI), 5, 3000);
        allResults.push(...rs);
        console.log(`     ✓  got ${rs.length} results`);
        if (i < R_BATCHES.length - 1) await sleep(4000);
      }
      const seenResultIds = new Map();
      for (const r of allResults) seenResultIds.set(r.id, r);
      const deduped = outline.results.map(r => seenResultIds.get(r.id)).filter(Boolean);
      const resultWarnings = validateResults(deduped, outline.dimensions, outline.architectureResultFields);
      printWarnings("results content", resultWarnings);
      assertNoCriticalWarnings("results content", resultWarnings);
      return deduped;
    }, 2, 5000);
    saveCheckpoint(TOPIC_ARG, "phase3-results", dedupedResults);
  }
  console.log(`     (${endPhase("3-results")}s)`);

  // Assemble + save
  startPhase("4-assemble");
  const quiz = assembleQuiz(outline, allQuestions, dedupedResults);

  const finalProfileWarnings = validateDimensionProfiles(quiz.results, quiz.scoring.dimensions);
  printWarnings("final profiles", finalProfileWarnings);
  assertNoCriticalWarnings("final profiles", finalProfileWarnings);
  const finalQuizValidation = validateFinalQuiz(quiz);
  printWarnings("final content", finalQuizValidation.warnings);
  if (finalQuizValidation.errors.length > 0) {
    console.error(`❌  Final content failed validation:`);
    for (const err of finalQuizValidation.errors) console.error(`     • ${err}`);
    process.exit(1);
  }

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
      const evalResult = await withRetry("eval", () => evaluateQuiz(quiz, aiClient.callAI), 2, 3000);
      printEvalReport(evalResult);
      if (!evalResult.overall.passed && evalResult.overall.score < MIN_SCORE) {
        if (FORCE) {
          console.warn("  ⚠   Quality check FAILED but --force flag set. Uploading.");
        } else {
          console.error(`  ❌  Quality check FAILED (score ${evalResult.overall.score} < ${MIN_SCORE}). Use --force to upload anyway.`);
          console.log(`     File saved locally: ${filePath}`);
          process.exit(2);
        }
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
      clearCheckpoints(TOPIC_ARG);
    } catch (err) {
      console.error("❌  Upload failed:", err.message);
      console.log(`    File saved locally: ${filePath}`);
    }
    endPhase("5-upload");
  } else {
    console.log(`⏭   Dry run — skipped upload`);
  }

  printTimingSummary();
  console.log(`\n✅  Done: 「${quiz.title}」 → ${quiz.id}\n`);
}

main().catch(err => { console.error("❌  Fatal:", err); process.exit(1); });
