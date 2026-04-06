#!/usr/bin/env node
/**
 * Lists online quizzes that use generic-result and reports which results lack cardImage
 * (cloud:// …), by calling quizWriter listCatalog + getQuiz.
 *
 * Requires .env: WX_APPID, WX_APPSECRET, WX_CLOUD_ENV (optional).
 *
 * Usage:
 *   node scripts/audit-result-card-images.js
 *   node scripts/audit-result-card-images.js --json
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
const JSON_OUT = process.argv.includes("--json");

function unwrapCloudQuiz(doc) {
  if (!doc || typeof doc !== "object") return null;
  const quiz = doc.quiz && typeof doc.quiz === "object" ? doc.quiz : doc;
  return {
    ...quiz,
    id: quiz.id || doc.id,
    title: quiz.title || doc.title || "",
    resultPage: quiz.resultPage || doc.resultPage || "",
    isAvailable: quiz.isAvailable !== false && doc.isAvailable !== false,
    results: quiz.results || [],
  };
}

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseInvokeBody(result) {
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`WeChat API errcode ${result.errcode}: ${JSON.stringify(result)}`);
  }
  const raw = result.resp_data;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function invokeQuizWriter(token, action, data) {
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=quizWriter`;
  const result = await post(url, { action, data: data || {} });
  return parseInvokeBody(result);
}

function hasCardImage(result) {
  const v = result && result.cardImage;
  return typeof v === "string" && v.trim().length > 0;
}

async function main() {
  if (!APPID || !APPSECRET) {
    console.error("Missing WX_APPID or WX_APPSECRET in .env");
    process.exit(1);
  }

  const tokenRes = await get(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (!tokenRes.access_token) {
    console.error("Failed to get access_token:", tokenRes);
    process.exit(1);
  }
  const token = tokenRes.access_token;

  const listResp = await invokeQuizWriter(token, "listCatalog", {});
  if (!listResp.success || !Array.isArray(listResp.catalog)) {
    console.error("listCatalog failed:", listResp);
    process.exit(1);
  }

  const targets = listResp.catalog.filter(
    (c) =>
      c &&
      c.id &&
      c.isAvailable !== false &&
      typeof c.resultPage === "string" &&
      c.resultPage.includes("generic-result")
  );

  const rows = [];
  let fetchErrors = 0;

  for (const entry of targets) {
    const id = entry.id;
    let quiz;
    try {
      const g = await invokeQuizWriter(token, "getQuiz", { id });
      if (!g.success || !g.quiz) {
        rows.push({
          id,
          title: entry.title || "",
          error: g.error || "getQuiz failed",
        });
        fetchErrors++;
        continue;
      }
      quiz = unwrapCloudQuiz(g.quiz);
    } catch (e) {
      rows.push({ id, title: entry.title || "", error: String(e.message || e) });
      fetchErrors++;
      continue;
    }

    const results = Array.isArray(quiz.results) ? quiz.results : [];
    const missing = results.filter((r) => !hasCardImage(r)).map((r) => r.id);
    rows.push({
      id,
      title: quiz.title || entry.title || "",
      resultCount: results.length,
      missingCardCount: missing.length,
      missingResultIds: missing,
    });
  }

  const problems = rows.filter(
    (r) => r.error || (r.missingCardCount > 0 && !r.error)
  );
  const okFull = rows.filter(
    (r) => !r.error && r.missingCardCount === 0 && r.resultCount > 0
  );

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          env: ENV_ID,
          genericResultOnline: targets.length,
          okAllResultsHaveCard: okFull.length,
          needAttention: problems.length,
          rows,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Env: ${ENV_ID}`);
  console.log(`Online + generic-result: ${targets.length}`);
  console.log(`All results have cardImage: ${okFull.length}`);
  console.log(`Need attention (error or missing card): ${problems.length}`);
  if (fetchErrors) console.log(`Fetch errors: ${fetchErrors}`);
  console.log("");

  for (const r of problems) {
    if (r.error) {
      console.log(`  ${r.id} — ERROR: ${r.error}`);
      continue;
    }
    console.log(
      `  ${r.id} — ${r.missingCardCount}/${r.resultCount} results without cardImage`
    );
    if (r.missingResultIds.length <= 8) {
      console.log(`      missing: ${r.missingResultIds.join(", ")}`);
    } else {
      console.log(
        `      missing (first 8): ${r.missingResultIds.slice(0, 8).join(", ")} …`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
