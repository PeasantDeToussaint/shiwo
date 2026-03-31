#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const scriptPath = path.resolve(__dirname, "../scripts/upload-quiz.js");
const result = spawnSync(process.execPath, [scriptPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error("❌  Failed to run upload script:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
