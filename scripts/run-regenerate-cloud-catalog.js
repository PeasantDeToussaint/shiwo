#!/usr/bin/env node
/**
 * Regenerate quizzes from a cloud catalog export using scripts/generate-quiz_副本.js.
 *
 * Skips: featureId "classics", ids red-chambers, city, temple (per product request).
 *
 * Env:
 *   CATALOG_PATH   Path to catalog JSON (default: scripts/data/live_audit/catalog-from-cloud.json)
 *   TOPIC_MANIFEST Path to regenerate-topics.manifest.json (default scripts/data/regenerate-topics.manifest.json)
 *   DRY_RUN        "false" to upload (default: true)
 *   ESTIMATE       "true" for cost estimate only
 *   SKIP_EVAL      "true" to skip eval phase
 *   PROVIDER       zhipu | qwen | deepseek | gemini | anthropic (default zhipu)
 *   QUIZ_GEN_HTTP_TIMEOUT_MS  单次 HTTP 等待毫秒（传给 generate-quiz_副本.js，默认脚本内 900000）
 *   SHARD          0-based shard index (optional)
 *   SHARD_COUNT    number of shards (optional; both required together)
 *   LIMIT          max quizzes to process in this run (optional)
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CATALOG = path.join(ROOT, "scripts/data/live_audit/catalog-from-cloud.json");
const DEFAULT_MANIFEST = path.join(ROOT, "scripts/data/regenerate-topics.manifest.json");
const GENERATOR = path.join(ROOT, "scripts/generate-quiz_副本.js");

const SKIP_IDS = new Set(["red-chambers", "city", "temple"]);
const SKIP_FEATURE_IDS = new Set(["classics"]);

const catalogPath = process.env.CATALOG_PATH
  ? path.resolve(process.cwd(), process.env.CATALOG_PATH)
  : DEFAULT_CATALOG;
const dryRun = process.env.DRY_RUN !== "false";
const estimate = process.env.ESTIMATE === "true";
const skipEval = process.env.SKIP_EVAL === "true";
const provider = (process.env.PROVIDER || "zhipu").trim().toLowerCase();

const shardRaw = process.env.SHARD;
const shardCountRaw = process.env.SHARD_COUNT;
const hasShard = shardRaw !== undefined && shardRaw !== "" && shardCountRaw !== undefined && shardCountRaw !== "";
const shard = hasShard ? parseInt(shardRaw, 10) : 0;
const shardCount = hasShard ? parseInt(shardCountRaw, 10) : 1;
const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;

if (hasShard && (!Number.isFinite(shard) || !Number.isFinite(shardCount) || shard < 0 || shardCount < 1)) {
  console.error("Invalid SHARD / SHARD_COUNT");
  process.exit(1);
}

if (!fs.existsSync(catalogPath)) {
  console.error("Catalog not found:", catalogPath);
  process.exit(1);
}

const manifestPath = process.env.TOPIC_MANIFEST
  ? path.resolve(process.cwd(), process.env.TOPIC_MANIFEST)
  : DEFAULT_MANIFEST;

const topicById = new Map();
if (fs.existsSync(manifestPath)) {
  const man = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entries = Array.isArray(man.entries) ? man.entries : [];
  for (const e of entries) {
    if (e && typeof e.id === "string" && e.id.trim() && typeof e.topic === "string" && e.topic.trim()) {
      topicById.set(e.id.trim(), { topic: e.topic.trim() });
    }
  }
}

const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const rows = Array.isArray(payload.catalog) ? payload.catalog : payload;

const candidates = rows
  .filter((r) => r && typeof r.id === "string" && r.id.trim())
  .filter((r) => !SKIP_IDS.has(r.id))
  .filter((r) => !SKIP_FEATURE_IDS.has((r.featureId || "").trim()))
  .filter((r) => r.isAvailable !== false)
  .sort((a, b) => a.id.localeCompare(b.id));

let selected = candidates;
if (hasShard) {
  selected = candidates.filter((_, idx) => idx % shardCount === shard);
}
if (limit != null && Number.isFinite(limit) && limit > 0) {
  selected = selected.slice(0, limit);
}

console.log("\nCloud catalog regen");
console.log("    catalog:", catalogPath);
console.log("    topic manifest:", manifestPath, "loaded ids:", topicById.size);
if (!fs.existsSync(manifestPath)) {
  console.warn("    (manifest file missing — will use catalog title+subtitle as --topic)");
}
console.log("    candidates:", candidates.length);
if (hasShard) console.log("    shard:", shard + 1 + "/" + shardCount);
console.log("    this run:", selected.length);
console.log("    provider:", provider);
console.log("    dry-run:", dryRun, "estimate:", estimate, "skip-eval:", skipEval, "\n");

if (selected.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

let passed = 0;
let failed = 0;

for (let i = 0; i < selected.length; i++) {
  const r = selected[i];
  const title = (r.title || "").trim();
  const subtitle = (r.subtitle || "").trim();
  const ov = topicById.get(r.id);
  const topic = ov && ov.topic ? ov.topic : subtitle ? title + "。" + subtitle : title || r.id;

  if (!ov) {
    console.warn("    [warn] no manifest entry for id=" + r.id + ", using catalog title/subtitle as --topic");
  }

  const hints = [
    "测验成品 JSON 顶层字段 id 必须为「" + r.id + "」，与线上一致，不得改写 slug。",
    "不要在提示里强行指定 featureId；成品分区由生成脚本 assemble 阶段根据大纲标题与题材关键词自动推断（inferFeatureId）。",
    "测验主题：" + topic,
  ];

  console.log("\n" + "─".repeat(60));
  console.log("[" + (i + 1) + "/" + selected.length + "] " + r.id);
  console.log("─".repeat(60));

  const args = [GENERATOR, "--topic=" + topic, "--id=" + r.id, "--provider=" + provider];
  for (const h of hints) {
    args.push("--hint=" + h);
  }
  if (dryRun) args.push("--dry-run");
  if (estimate) args.push("--estimate");
  if (skipEval) args.push("--skip-eval");

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env },
  });

  if (result.status === 0) {
    console.log("\nOK [" + (i + 1) + "/" + selected.length + "] " + r.id);
    passed++;
  } else {
    console.error("\nFAIL [" + (i + 1) + "/" + selected.length + "] " + r.id + " (exit " + result.status + ")");
    failed++;
  }
}

console.log("\n" + "═".repeat(60));
console.log("Shard summary: " + passed + " ok, " + failed + " failed");
console.log("═".repeat(60) + "\n");

if (failed > 0) process.exit(1);
