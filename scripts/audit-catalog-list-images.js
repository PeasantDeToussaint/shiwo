#!/usr/bin/env node
/**
 * Lists quizzes whose listing card shows the plain "text" style (no hero image):
 * same rules as miniprogram resolveCatalogCardHero + mergeCatalogRow.
 *
 * Hero = catalog.bgImage (after local/cloud merge) OR quiz.bgImage OR introPainting
 * OR questions[0].painting from getQuiz.
 *
 * Requires .env: WX_APPID, WX_APPSECRET, WX_CLOUD_ENV (optional).
 *
 * Usage:
 *   node scripts/audit-catalog-list-images.js
 *   node scripts/audit-catalog-list-images.js --json
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const localQuizzes = require("../miniprogram/data/quizzes/index.js");

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

function localRowForId(id) {
  const q = localQuizzes.find((x) => x.id === id);
  return q ? { id: q.id, ...q.catalog } : null;
}

/** Mirrors miniprogram mergeCatalogRow (bgImage: cloud wins only if non-empty). */
function mergeCatalogRow(localRow, cloudRow) {
  return {
    ...(localRow || {}),
    ...(cloudRow || {}),
    title: (cloudRow && cloudRow.title) || (localRow && localRow.title) || "",
    subtitle: (cloudRow && cloudRow.subtitle) || (localRow && localRow.subtitle) || "",
    themeKey: (cloudRow && cloudRow.themeKey) || (localRow && localRow.themeKey) || "default",
    bgImage: (cloudRow && cloudRow.bgImage) || (localRow && localRow.bgImage) || "",
    displayTitleZh: (cloudRow && cloudRow.displayTitleZh) || (localRow && localRow.displayTitleZh) || "",
    tags:
      (cloudRow && cloudRow.tags && cloudRow.tags.length ? cloudRow.tags : localRow && localRow.tags) ||
      [],
    questionPage: (cloudRow && cloudRow.questionPage) || (localRow && localRow.questionPage) || "",
    resultPage: (cloudRow && cloudRow.resultPage) || (localRow && localRow.resultPage) || "",
    questionCount: (cloudRow && cloudRow.questionCount) || (localRow && localRow.questionCount) || 0,
    featureId: (cloudRow && cloudRow.featureId) || (localRow && localRow.featureId) || "",
    isAvailable:
      cloudRow && cloudRow.isAvailable !== undefined ? cloudRow.isAvailable : localRow && localRow.isAvailable,
  };
}

/** Mirrors miniprogram catalogHero.extractHero on full quiz doc. */
function extractHeroFromQuizDoc(quiz) {
  if (!quiz || typeof quiz !== "object") return "";
  const q0 = Array.isArray(quiz.questions) && quiz.questions[0];
  const p = q0 && q0.painting;
  return (
    (typeof quiz.bgImage === "string" && quiz.bgImage.trim()) ||
    (typeof quiz.introPainting === "string" && quiz.introPainting.trim()) ||
    (typeof p === "string" && p.trim()) ||
    ""
  );
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

  const rows = [];
  for (const cloudRow of listResp.catalog) {
    if (!cloudRow || !cloudRow.id || cloudRow.isAvailable === false) continue;

    const merged = mergeCatalogRow(localRowForId(cloudRow.id), cloudRow);
    const catalogHero = typeof merged.bgImage === "string" ? merged.bgImage.trim() : "";

    let fallbackHero = "";
    let error = "";
    if (!catalogHero) {
      try {
        const g = await invokeQuizWriter(token, "getQuiz", { id: merged.id });
        if (!g.success || !g.quiz) {
          error = g.error || "getQuiz failed";
        } else {
          fallbackHero = extractHeroFromQuizDoc(g.quiz);
        }
      } catch (e) {
        error = String(e.message || e);
      }
    }

    const hasHero = !!(catalogHero || fallbackHero);
    rows.push({
      id: merged.id,
      featureId: merged.featureId || cloudRow.featureId || "",
      title: merged.displayTitleZh || merged.title || cloudRow.title || "",
      hasListingHero: hasHero,
      catalogBgImage: !!catalogHero,
      quizBodyHero: !!fallbackHero,
      error: error || undefined,
    });
  }

  const missing = rows.filter((r) => !r.hasListingHero);

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          env: ENV_ID,
          onlineAvailable: rows.length,
          withListingHero: rows.length - missing.length,
          plainTextCard: missing.length,
          missing,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Env: ${ENV_ID}`);
  console.log(`Online + available (catalog): ${rows.length}`);
  console.log(`With listing hero image: ${rows.length - missing.length}`);
  console.log(`Plain text card (no hero): ${missing.length}`);
  console.log("");

  for (const r of missing) {
    const err = r.error ? ` — ERROR: ${r.error}` : "";
    console.log(`  ${r.id}  ${r.title}${err}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
