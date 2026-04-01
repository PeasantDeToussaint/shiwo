#!/usr/bin/env node
/**
 * reclassify-feature-ids.js
 *
 * Patches featureId on all cloud quiz_catalog (and quizzes) entries
 * using the new 11-category system, via patchCatalog cloud function action.
 *
 * Requires quizWriter cloud function to be deployed with patchCatalog action.
 *
 * Usage:
 *   node scripts/reclassify-feature-ids.js
 */

const https = require("https");
const path  = require("path");
const fs    = require("fs");

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

const APPID   = process.env.WX_APPID;
const SECRET  = process.env.WX_APPSECRET;
const ENV_ID  = process.env.WX_CLOUD_ENV || "cloudbase-4gadl6qo4a9aa95d";

if (!APPID || !SECRET) {
  console.error("❌  Missing WX_APPID or WX_APPSECRET in .env");
  process.exit(1);
}

// ── New featureId mapping ──────────────────────────────────────
const REMAP = {
  // pipelined materials
  "career-archetype-test":              "career",
  "detective-conan-character-match":    "ip",
  "disney-princess-archetype":          "ip",
  "doraemon-character-match":           "ip",
  "gatsby-character-match":             "aesthetics",
  "gem-personality":                    "archetype",
  "greek-mythology-deity":              "archetype",
  "he-li-hua-ting-character-match":     "ip",
  "jin-female-archetypes":              "ip",
  "langyabang-character-match":         "ip",
  "life-philosophy-archetype":          "archetype",
  "literary-soul-resonance":            "aesthetics",
  "little-prince-character-match":      "ip",
  "love-show-personality":              "relationship",
  "martial-arts-sect":                  "ip",
  "ming-dynasty-persona":               "history",
  "miyazaki-character-archetype":       "ip",
  "qing-nian-xiang-si":                 "ip",
  "republican-women-personality-test":  "history",
  "shanhaijing-shenshou":               "archetype",
  "sherlock-character-match":           "ip",
  "tang-song-masters":                  "history",
  "three-kingdoms-character-similarity":"history",
  "three-kingdoms-strategist-match":    "history",
  "wangjiawei-character":               "aesthetics",
  "zhenhuan-character-match":           "ip",
  "zhifou-character-match":             "ip",
  "zootopia-character-match":           "ip",
  "自媒体人格原型":                       "career",
  // local stubs (re-exported)
  "red-chambers":                       "ip",
  "city":                               "city",
  "dialect":                            "city",
  "temple":                             "lifestyle",
  // other generated quizzes
  "mythical-creature-within":           "archetype",
};

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

async function callCloud(token, action, data) {
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=quizWriter`;
  const result = await post(url, { action, data });
  if (result.errcode && result.errcode !== 0) throw new Error(`WeChat API error: ${JSON.stringify(result)}`);
  const resp = typeof result.resp_data === "string" ? JSON.parse(result.resp_data) : result.resp_data;
  return resp;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log("🔑  Fetching access_token...");
  const tokenRes = await get(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
  );
  if (!tokenRes.access_token) {
    console.error("❌  Failed to get access_token:", tokenRes);
    process.exit(1);
  }
  const token = tokenRes.access_token;
  console.log("✅  Got token\n");

  let ok = 0, fail = 0;
  for (const [id, featureId] of Object.entries(REMAP)) {
    process.stdout.write(`  patching ${id} → ${featureId} ... `);
    try {
      const resp = await callCloud(token, "patchCatalog", { id, fields: { featureId } });
      if (resp && resp.success) {
        console.log("✅");
        ok++;
      } else {
        console.log("⚠️   " + (resp?.error || "unknown error"));
        fail++;
      }
    } catch (e) {
      console.log("❌  " + e.message);
      fail++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. ✅ ${ok} patched, ❌ ${fail} failed.`);
}

main().catch((err) => {
  console.error("❌  Unexpected error:", err);
  process.exit(1);
});
