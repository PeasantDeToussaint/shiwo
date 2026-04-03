#!/usr/bin/env node
/**
 * Run validateQuestions (incl. score-vector / dimensional-spread rules) on one quiz JSON.
 *
 * Usage:
 *   node scripts/validate-quiz-json.js path/to/quiz.json
 *   node scripts/validate-quiz-json.js ~/Downloads/anti-affair-resilience-test.json
 *
 * Exit 0 if no question warnings; 1 if there are warnings; 2 on usage/parse errors.
 */
const fs = require("fs");
const path = require("path");
const { validateQuestions } = require("../quiz-generator/lib/validate");

function unwrapQuizPayload(raw) {
  if (
    raw &&
    raw.quiz &&
    typeof raw.quiz === "object" &&
    Array.isArray(raw.quiz.questions)
  ) {
    return raw.quiz;
  }
  return raw;
}

function stringDimensions(scoring) {
  const d = scoring && scoring.dimensions;
  if (!Array.isArray(d) || d.length === 0) return [];
  if (typeof d[0] === "string") return d.filter(Boolean);
  return [];
}

function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: node scripts/validate-quiz-json.js <quiz.json>");
    process.exit(2);
  }

  const abs = path.resolve(fileArg);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    console.error(`Failed to read/parse JSON: ${abs}\n${e.message}`);
    process.exit(2);
  }

  const quiz = unwrapQuizPayload(raw);
  const scoring = quiz.scoring || {};
  const dimensions = stringDimensions(scoring);
  const scoringType = scoring.type || "weighted-dimension";
  const dimensionAxes = Array.isArray(scoring.dimensionAxes) ? scoring.dimensionAxes : [];

  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    console.error("No questions[] found in quiz JSON.");
    process.exit(2);
  }

  if (dimensions.length === 0) {
    console.error("No scoring.dimensions (string[]) found; cannot validate questions.");
    process.exit(2);
  }

  const warnings = validateQuestions(quiz.questions, dimensions, {
    scoringType,
    dimensionAxes,
  });

  console.log(`File: ${abs}`);
  console.log(`Quiz id: ${quiz.id || "(missing)"}`);
  console.log(`scoring.type: ${scoringType}`);
  console.log(`dimensions: ${dimensions.join(" / ")}`);
  console.log(`questions: ${quiz.questions.length}`);
  console.log("");

  if (warnings.length === 0) {
    console.log("validateQuestions: OK (0 issues)");
    process.exit(0);
  }

  console.log(`validateQuestions: ${warnings.length} issue(s)`);
  for (const w of warnings) console.log(`  • ${w}`);
  process.exit(1);
}

main();
