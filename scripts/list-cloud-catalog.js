#!/usr/bin/env node
/**
 * Fetch live quiz_catalog from CloudBase via quizWriter listCatalog.
 *
 * Requires project root .env: WX_APPID, WX_APPSECRET, WX_CLOUD_ENV (optional).
 *
 * Usage:
 *   node scripts/list-cloud-catalog.js
 *   node scripts/list-cloud-catalog.js --json
 *   node scripts/list-cloud-catalog.js --out scripts/data/live_audit/catalog-from-cloud.json
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

const args = process.argv.slice(2);
const JSON_ONLY = args.includes("--json");
const outIdx = args.indexOf("--out");
const OUT_PATH = outIdx >= 0 && args[outIdx + 1] ? path.resolve(process.cwd(), args[outIdx + 1]) : null;

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

function escCell(s) {
  return String(s ?? "").replace(/\|/g, "／").replace(/\r?\n/g, " ");
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

  const listResp = await invokeQuizWriter(tokenRes.access_token, "listCatalog", {});
  if (!listResp.success || !Array.isArray(listResp.catalog)) {
    console.error("listCatalog failed:", listResp);
    process.exit(1);
  }

  const catalog = listResp.catalog
    .filter((row) => row && row.id)
    .map((row) => ({
      id: row.id,
      featureId: row.featureId || "",
      title: row.title || row.displayTitleZh || "",
      subtitle: row.subtitle || "",
      isAvailable: row.isAvailable !== false,
      questionPage: row.questionPage || "",
      resultPage: row.resultPage || "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const payload = {
    exportedAt: new Date().toISOString(),
    env: ENV_ID,
    count: catalog.length,
    catalog,
  };

  if (OUT_PATH) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
    console.error(`Wrote ${catalog.length} rows → ${OUT_PATH}`);
  }

  if (JSON_ONLY) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# Cloud quiz_catalog (${ENV_ID})`);
  console.log(`Exported: ${payload.exportedAt}`);
  console.log(`Count: ${catalog.length}\n`);
  console.log("| id | featureId | isAvailable | title | subtitle |");
  console.log("|---|---|---:|---|---|");
  for (const r of catalog) {
    console.log(
      `| ${escCell(r.id)} | ${escCell(r.featureId)} | ${r.isAvailable} | ${escCell(r.title)} | ${escCell(r.subtitle).slice(0, 60)} |`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
