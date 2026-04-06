#!/usr/bin/env node
/**
 * Bulk-upload every quiz JSON under scripts/22newquizes/ to CloudBase via quizWriter (updateQuiz).
 *
 * Requires project root .env:
 *   WX_APPID=...
 *   WX_APPSECRET=...
 *   WX_CLOUD_ENV=...   (optional, default matches upload-quiz.js)
 *
 * Usage:
 *   node scripts/upload-22newquizzes.js
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "22newquizes");
const UPLOAD_QUIZ = path.join(__dirname, "upload-quiz.js");

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error("❌  Missing folder:", DATA_DIR);
    process.exit(1);
  }

  const names = fs.readdirSync(DATA_DIR).filter((n) => n.endsWith(".json"));
  const targets = [];

  for (const name of names) {
    const fp = path.join(DATA_DIR, name);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch (e) {
      console.warn(`⚠️  Skip (invalid JSON): ${name}`);
      continue;
    }
    if (!raw || typeof raw.id !== "string" || !Array.isArray(raw.questions)) {
      console.warn(`⚠️  Skip (not a quiz payload): ${name}`);
      continue;
    }
    targets.push({ fp, id: raw.id });
  }

  targets.sort((a, b) => a.id.localeCompare(b.id));
  console.log(`📤  Uploading ${targets.length} quizzes from 22newquizes with --update...\n`);

  let ok = 0;
  const failed = [];
  for (const { fp, id } of targets) {
    console.log(`\n—— ${id} ——`);
    try {
      execFileSync(process.execPath, [UPLOAD_QUIZ, fp, "--update"], {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
      });
      ok += 1;
    } catch (e) {
      failed.push(id);
      console.error(`❌  Failed: ${id} (continuing…)`);
    }
  }

  if (failed.length) {
    console.error(`\n⚠️  ${failed.length} failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
  console.log(`\n✅  Finished ${ok}/${targets.length} uploads.`);
}

main();
