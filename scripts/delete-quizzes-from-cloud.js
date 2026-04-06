#!/usr/bin/env node
/**
 * Deletes quiz documents + quiz_catalog rows via quizWriter.deleteQuiz.
 *
 *   node scripts/delete-quizzes-from-cloud.js
 *
 * Requires root .env: WX_APPID, WX_APPSECRET, WX_CLOUD_ENV (same as upload-quiz.js).
 * Deploy cloudfunctions/quizWriter after adding deleteQuiz handler.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
    });
}

const APPID = process.env.WX_APPID;
const APPSECRET = process.env.WX_APPSECRET;
const ENV_ID = process.env.WX_CLOUD_ENV || "cloudbase-4gadl6qo4a9aa95d";

/**
 * Catalog ids removed from the app (titles per product request).
 * Keep in sync with miniprogram/utils/removedQuizIds.js
 */
const IDS_TO_DELETE = [
  "city-for-your-soul",
  "your-deep-relationship-with-food",
  "your-perfect-walk-route",
  "breakfast-philosophy",
  "hidden-decision-pattern",
  "intimacy-with-loneliness",
  "love-language-type",
  "regret-coping-style",
  "season-of-your-soul",
  "subconscious-fear",
  "true-relationship-with-procrastination",
  "unspoken-needs",
  "unfinished-childhood-dreams",
  "what-your-intuition-excels-at",
  "your-hidden-talent",
  "your-unique-relationship-with-night",
  "what-your-dreams-reveal",
  "what-your-recent-dreams-reveal",
  "invisible-family-contract",
  "tea-persona",
  "your-writing-style",
  "which-movie-resonates-with-your-heart",
  "your-life-bgm",
  "what-your-style-reveals",
  "ancient-scholar-examination-fate",
  "three-kingdoms-character-match",
  "your-natural-element-connection",
  "your-secret-dialogue-with-stars",
  "ancient-greece-decision-making",
  "ancient-rome-decision-making",
  "chunqiu-zhanguo-choices",
  "late-qing-dynasty-time-travel",
  "ming-dynasty-decision-making",
  "qin-han-historical-crossroads",
  "sheng-tang-chuan-yue-jue-ze",
  "song-dynasty-time-travel",
  "three-kingdoms-decision-style",
  // Merged into sibling (see removedQuizIds.js); content-creator-type absorbs we-media duplicates; ancient-poet / lotr-race / warcraft-race / relationship-fidelity / love-rank survive
  "tang-poets",
  "which-tang-poet-lives-in-your-heart",
  "middle-earth-character",
  "wow-survival-philosophy-quiz",
  "anti-affair-resilience-test",
  "love-level-test",
  "自媒体赛道人格测验",
  "自媒体人格原型",
  "ming-dynasty-persona",
];

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
    const req = https.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!APPID || !APPSECRET) {
    console.error("Missing WX_APPID or WX_APPSECRET in .env");
    process.exit(1);
  }

  console.log("Fetching access_token...");
  const tokenRes = await get(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (!tokenRes.access_token) {
    console.error("Failed to get access_token:", tokenRes);
    process.exit(1);
  }
  const token = tokenRes.access_token;
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=quizWriter`;

  for (const id of IDS_TO_DELETE) {
    const result = await post(url, { action: "deleteQuiz", data: { id } });
    if (result.errcode && result.errcode !== 0) {
      console.error(`WeChat API error for ${id}:`, result);
      process.exit(1);
    }
    const resp =
      typeof result.resp_data === "string" ? JSON.parse(result.resp_data) : result.resp_data;
    if (!resp || !resp.success) {
      console.error(`quizWriter.deleteQuiz failed for ${id}:`, resp?.error || result);
      process.exit(1);
    }
    console.log(
      `OK ${id}: removed ${resp.removedQuizDocs} quiz doc(s), ${resp.removedCatalogDocs} catalog row(s)`
    );
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
