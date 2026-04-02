#!/usr/bin/env node
/**
 * upload-quiz.js
 *
 * Uploads a quiz JSON file to WeChat CloudBase via the quizWriter cloud function.
 *
 * Usage:
 *   node scripts/upload-quiz.js path/to/quiz.json [--update]
 *
 * Flags:
 *   --update   Overwrite if quiz with same id already exists
 *
 * Requires a .env file in the project root with:
 *   WX_APPID=wx...
 *   WX_APPSECRET=...
 *   WX_CLOUD_ENV=cloudbase-4gadl6qo4a9aa95d
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// ── Load .env ─────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
    });
}

const APPID     = process.env.WX_APPID;
const APPSECRET = process.env.WX_APPSECRET;
const ENV_ID    = process.env.WX_CLOUD_ENV || "cloudbase-4gadl6qo4a9aa95d";

if (!APPID || !APPSECRET) {
  console.error("❌  Missing WX_APPID or WX_APPSECRET in .env");
  process.exit(1);
}

// ── Parse args ────────────────────────────────────────────────
const args    = process.argv.slice(2);
const quizArg = args.find((a) => !a.startsWith("--"));
const update  = args.includes("--update");

if (!quizArg) {
  console.error("Usage: node scripts/upload-quiz.js path/to/quiz.json [--update]");
  process.exit(1);
}

const quizPath = path.resolve(quizArg);
if (!fs.existsSync(quizPath)) {
  console.error(`❌  File not found: ${quizPath}`);
  process.exit(1);
}

const quiz = JSON.parse(fs.readFileSync(quizPath, "utf-8"));

function inferFeatureId(quiz) {
  if (quiz && typeof quiz.featureId === "string" && quiz.featureId.trim()) return quiz.featureId;
  const text = [
    quiz?.id, quiz?.title, quiz?.subtitle, quiz?.eyebrow, quiz?.description,
  ].filter(Boolean).join(" ").toLowerCase();
  const has = (re) => re.test(text);
  const resultTitles = Array.isArray(quiz?.results) ? quiz.results.map(r => r?.title).filter(Boolean).join(" ") : "";
  const corpus = `${text} ${resultTitles}`.toLowerCase();

  if (/mbti|16人格|十六人格|大五|九型|enneagram|职业倾向|aptitude/.test(corpus)) return "classics";
  if (/career|职场|成长|升职|工作/.test(corpus)) return "career";
  if (/审美|艺术|画家|绘画|电影|戏剧|舞蹈|音乐|诗人|词人|作家|文学|香水|perfume|literary/.test(corpus)) return "aesthetics";
  if (/恋爱|关系|依恋|友谊|情感|爱情/.test(corpus)) return "relationship";
  if (/思维|认知|逻辑|决策|cognition|reasoning/.test(corpus)) return "cognition";
  if (/城市|旅行|宠物|运动|方言|寺庙|厨房|美食|天气|生活方式|sport|pet|city|dialect|temple/.test(corpus)) return "lifestyle";
  if (/动漫|漫画|游戏|ip|宇宙|角色|人物|character/.test(corpus)) return "ip";
  return "history";
}

if (!quiz.featureId) {
  quiz.featureId = inferFeatureId(quiz);
  console.log(`🧭  Inferred featureId: ${quiz.featureId}`);
}
console.log(`📦  Quiz: ${quiz.id} — ${quiz.title}`);

// ── HTTP helpers ──────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  // 1. Get access_token
  console.log("🔑  Fetching access_token...");
  const tokenRes = await get(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (!tokenRes.access_token) {
    console.error("❌  Failed to get access_token:", tokenRes);
    process.exit(1);
  }
  const token = tokenRes.access_token;

  // 2. Call quizWriter cloud function
  const action = update ? "updateQuiz" : "addQuiz";
  console.log(`☁️   Calling quizWriter.${action}...`);

  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=quizWriter`;
  const result = await post(url, { action, data: quiz });

  if (result.errcode && result.errcode !== 0) {
    console.error("❌  WeChat API error:", result);
    process.exit(1);
  }

  // The cloud function response is JSON-encoded in result.resp_data
  const resp = typeof result.resp_data === "string"
    ? JSON.parse(result.resp_data)
    : result.resp_data;

  if (!resp || !resp.success) {
    console.error("❌  quizWriter error:", resp?.error || result);
    process.exit(1);
  }

  console.log(`✅  Uploaded: ${resp.id}`);
}

main().catch((err) => {
  console.error("❌  Unexpected error:", err);
  process.exit(1);
});
