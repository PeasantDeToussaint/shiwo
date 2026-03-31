#!/usr/bin/env node
/**
 * export-quizzes.js
 *
 * Exports all hardcoded quiz data to normalized JSON files ready for cloud upload.
 * Merges catalog metadata (featureId, bgImage, tags, etc.) with full quiz data
 * (questions, results, scoring) into a single consistent document per quiz.
 *
 * All exported documents share the same top-level shape:
 *   id, featureId, title, subtitle, eyebrow, description, themeKey, accent,
 *   bgImage, displayTitleZh, displayTitleEn, tags, estimatedMinutes,
 *   questionCount, isAvailable, questionPage, resultPage,
 *   scoring { type, ...engine-specific },
 *   questions [], results []
 *
 * Usage:
 *   node scripts/export-quizzes.js
 *
 * Then upload:
 *   node scripts/upload-quiz.js scripts/data/red-chambers.json --update
 *   node scripts/upload-quiz.js scripts/data/dialect.json --update
 *   node scripts/upload-quiz.js scripts/data/temple.json --update
 *   node scripts/upload-quiz.js scripts/data/city.json --update
 */

const path = require("path");
const fs   = require("fs");

// Stub wx so scoring modules don't throw if they reference it
global.wx = { cloud: {} };

const MP  = path.resolve(__dirname, "../miniprogram");
const SP  = path.join(MP, "subpackages/quiz");
const OUT = path.join(__dirname, "data");

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

/** Merge catalog stub + full quiz data into one normalized document */
function normalize(stub, fullQuiz, scoringType) {
  const cat = stub.catalog || {};

  // Merge scoring: add type discriminator, keep engine-specific fields
  const scoring = Object.assign({ type: scoringType }, fullQuiz.scoring || {});

  return {
    // ── Identity ──────────────────────────────────────────────
    id:             stub.id,
    featureId:      cat.featureId       || "",
    title:          fullQuiz.title      || cat.title        || "",
    subtitle:       fullQuiz.subtitle   || cat.subtitle     || "",
    eyebrow:        fullQuiz.eyebrow    || cat.displayTitleEn || "",
    description:    fullQuiz.description || cat.description  || "",
    disclaimer:     fullQuiz.disclaimer || "",

    // ── Display / catalog ─────────────────────────────────────
    themeKey:        cat.themeKey       || fullQuiz.themeKey || "default",
    accent:          fullQuiz.accent    || "#c9a96a",
    bgImage:         cat.bgImage        || "",
    displayTitleZh:  cat.displayTitleZh || fullQuiz.title   || "",
    displayTitleEn:  cat.displayTitleEn || fullQuiz.eyebrow || "",
    tags:            cat.tags           || [],
    estimatedMinutes: cat.estimatedMinutes || 5,
    questionCount:   (fullQuiz.questions || []).length || cat.questionCount || 0,
    isAvailable:     cat.isAvailable !== false,

    // ── Routing ───────────────────────────────────────────────
    questionPage:   stub.questionPage || fullQuiz.questionPage || "",
    resultPage:     stub.resultPage   || fullQuiz.resultPage   || "",

    // ── Scoring engine ────────────────────────────────────────
    scoring,

    // ── Content (functions stripped automatically by JSON.stringify) ──
    questions: fullQuiz.questions || [],
    results:   fullQuiz.results   || [],

    // ── Quiz-type-specific extras ─────────────────────────────
    ...(fullQuiz.phases    ? { phases:    fullQuiz.phases    } : {}),
    ...(fullQuiz.provinces ? { provinces: fullQuiz.provinces } : {}),
  };
}

function write(name, obj) {
  const json = JSON.stringify(obj, null, 2);
  const outPath = path.join(OUT, `${name}.json`);
  fs.writeFileSync(outPath, json, "utf-8");
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  const qCount  = (obj.questions || []).length;
  const rCount  = (obj.results   || []).length;
  console.log(`  ✅  ${name}.json  —  ${kb} KB  |  ${qCount} questions  |  ${rCount} results`);
}

// ── Red Chambers ───────────────────────────────────────────────
console.log("\n📦  red-chambers");
try {
  const stub     = require(path.join(MP, "data/quizzes/red-chambers.js"));
  const fullQuiz = require(path.join(SP, "data/red-chambers-quiz.js"));
  write("red-chambers", normalize(stub, fullQuiz, "red-chambers"));
} catch (e) {
  console.error("  ❌  failed:", e.message);
}

// ── Dialect ────────────────────────────────────────────────────
console.log("📦  dialect");
try {
  const stub     = require(path.join(MP, "data/quizzes/dialect.js"));
  const fullQuiz = require(path.join(SP, "data/dialect-quiz.js"));
  write("dialect", normalize(stub, fullQuiz, "dialect"));
} catch (e) {
  console.error("  ❌  failed:", e.message);
}

// ── Temple ─────────────────────────────────────────────────────
console.log("📦  temple");
try {
  const stub     = require(path.join(MP, "data/quizzes/temple.js"));
  const fullQuiz = require(path.join(SP, "data/temple-quiz.js"));
  write("temple", normalize(stub, fullQuiz, "temple"));
} catch (e) {
  console.error("  ❌  failed:", e.message);
}

// ── City ───────────────────────────────────────────────────────
console.log("📦  city");
try {
  const stub     = require(path.join(MP, "data/quizzes/city.js"));
  const cityFull = require(path.join(SP, "data/city-full.js"));

  // city-full.js is the authoritative data source — merge with stub
  const cityFake = {
    title:       stub.catalog.title,
    subtitle:    stub.catalog.subtitle,
    eyebrow:     stub.catalog.displayTitleEn || "City Match",
    description: "",
    disclaimer:  "",
    accent:      "#c9a96a",
    themeKey:    "city",
    questions:   cityFull.questions  || [],
    provinces:   cityFull.provinces  || [],
    results:     cityFull.results    || [],
    scoring:     cityFull.scoring    || {},
  };
  write("city", normalize(stub, cityFake, "city"));
} catch (e) {
  console.error("  ❌  failed:", e.message);
}

console.log("\nDone. Upload with:");
console.log("  node scripts/upload-quiz.js scripts/data/red-chambers.json --update");
console.log("  node scripts/upload-quiz.js scripts/data/dialect.json --update");
console.log("  node scripts/upload-quiz.js scripts/data/temple.json --update");
console.log("  node scripts/upload-quiz.js scripts/data/city.json --update\n");
