#!/usr/bin/env node
/**
 * review-quizzes-qwen.js
 *
 * Same rubric as review-quizzes-zhipu.js, via Alibaba DashScope **OpenAI-compatible**
 * Chat Completions (Qwen / 通义千问).
 *
 * API Key（官方说明）:
 *   - **Coding Plan 专属**：格式 `sk-sp-xxxxx`，须在套餐文档中取对应的 **Base URL**（与百炼通用 Key 不同）。
 *   - **百炼通用**：格式 `sk-xxxxx`（Model Studio 通用 API Key）。
 *   Key 与 **地域** 必须一致，否则常见 `401 invalid_api_key`。
 *
 * Base URL（与 Key 所属地域一致）:
 *   - 华北2（北京）: https://dashscope.aliyuncs.com/compatible-mode/v1
 *   - 新加坡:        https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 *   - 美国（弗吉尼亚）: https://dashscope-us.aliyuncs.com/compatible-mode/v1
 *
 * 默认 Base（未设 QWEN_API_BASE / QWEN_REGION 时）为 **华北2（北京）**，与国内百炼 Key 一致。
 * 国际站 Key 请在 .env 写 QWEN_REGION=intl 或设置 QWEN_API_BASE。
 *
 * Env:
 *   DASHSCOPE_API_KEY or QWEN_API_KEY
 *   QWEN_API_BASE     — 完整 compatible-mode/v1 根 URL（优先级高于 --region）
 *   QWEN_REGION       — beijing | singapore | intl | us（仅当未设 QWEN_API_BASE 时参与默认 Base）
 *
 * Usage:
 *   node scripts/review-quizzes-qwen.js --region=beijing --only=bird-personality-test
 *   node scripts/review-quizzes-qwen.js --base-url=https://dashscope.aliyuncs.com/compatible-mode/v1
 *   node scripts/review-quizzes-qwen.js --verbose   # stderr: API_BASE + key length (debug 401)
 *   node scripts/review-quizzes-qwen.js --dry-run
 *
 * 若「单套 --only 正常、全量却 401」：多半是 .env 首行 BOM、或某次用了 shell 里 export 的 Key
 * 而全量只读到错误的 .env。已改进 loadRepoEnv（去 BOM、支持 # 注释、仅按第一个 = 切分）。
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const {
  loadRepoEnv,
  listQuizFiles,
  truncate,
  sleep,
  buildPayload,
  SYSTEM_PROMPT,
  buildReviewUserBlock,
  unwrapQuizJson,
} = require("./lib/quiz-review-shared");

loadRepoEnv();

const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
const HTTP_TIMEOUT_MS = 180000;
const DEFAULT_DIR = path.resolve(__dirname, "22newquizes");
const DEFAULT_OUT = path.resolve(__dirname, "quiz-review-qwen.md");
const DEFAULT_MODEL = process.env.QWEN_REVIEW_MODEL || "qwen3.6-plus";
const DEFAULT_DELAY_MS = 1500;

/** DashScope OpenAI-compatible roots — must match the region where the API Key was issued. */
const REGION_BASE = {
  intl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  singapore: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  beijing: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  cn: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  us: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
};

const ARGS = process.argv.slice(2);

function argVal(prefix, fallback) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  if (!a) return fallback;
  return a.slice(prefix.length).replace(/^=["']?|["']$/g, "") || fallback;
}

function resolveDefaultApiBase() {
  const envBase = (process.env.QWEN_API_BASE || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;
  const rk = (argVal("--region=", "") || process.env.QWEN_REGION || "").toLowerCase();
  if (rk && REGION_BASE[rk]) return REGION_BASE[rk];
  return REGION_BASE.beijing;
}

const DIR = path.resolve(argVal("--dir=", DEFAULT_DIR));
const GLOB = argVal("--glob=", "*.json");
const OUT = path.resolve(argVal("--out=", DEFAULT_OUT));
const MODEL = argVal("--model=", DEFAULT_MODEL);
const API_BASE = argVal("--base-url=", resolveDefaultApiBase()).replace(/\/$/, "");
const DELAY_MS = parseInt(argVal("--delay=", String(DEFAULT_DELAY_MS)), 10) || DEFAULT_DELAY_MS;
const ONLY = argVal("--only=", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FULL = ARGS.includes("--full");
const DRY = ARGS.includes("--dry-run");
const VERBOSE = ARGS.includes("--verbose");
const HELP = ARGS.includes("--help") || ARGS.includes("-h");

if (HELP) {
  console.log(`
review-quizzes-qwen.js — Qwen (DashScope OpenAI-compatible) quiz editorial review

API Key: 百炼通用多为 sk-xxxxx；Coding Plan 专属为 sk-sp-xxxxx（须用套餐文档里的 Base URL）。
Key 与地域必须一致，否则 401。

Env:  DASHSCOPE_API_KEY or QWEN_API_KEY (required unless --dry-run)
      QWEN_REVIEW_MODEL   optional; default model qwen3.6-plus
      QWEN_API_BASE       optional full compatible root URL
      QWEN_REGION         beijing|cn | singapore|intl | us — if unset, default is beijing (国内 Key)

Args:
  --dir=PATH       Folder of quiz JSON (default: scripts/22newquizes)
  --out=FILE       Markdown report (default: scripts/quiz-review-qwen.md)
  --model=NAME     default qwen3.6-plus; also qwen-plus, qwen-max, …
  --region=NAME    Preset base if QWEN_API_BASE unset:
                   beijing / cn → 华北2（北京，脚本默认）
                   singapore / intl → 新加坡（国际站 Key 用）
                   us → 美国（弗吉尼亚）
  --base-url=URL   Overrides everything (must end …/compatible-mode/v1)
  --delay=MS       Pause between calls (default: ${DEFAULT_DELAY_MS})
  --only=id1,id2   Limit to quiz id(s)
  --full           Longer portrait previews in payload
  --dry-run        No API calls
  --verbose        Log API_BASE + key fingerprint (prefix/len) to stderr for debugging 401
  --help           This help
`);
  process.exit(0);
}

function httpPostJson(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 800)}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error("HTTP POST timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function callQwen(userContent) {
  const url = `${API_BASE}/chat/completions`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
  const body = {
    model: MODEL,
    messages,
    max_tokens: 8192,
    temperature: 0.35,
  };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await httpPostJson(url, body, {
        Authorization: `Bearer ${API_KEY}`,
      });
      const msg = res.choices?.[0]?.message?.content;
      if (!msg) {
        throw new Error(`Qwen: empty choices: ${JSON.stringify(res).slice(0, 400)}`);
      }
      return msg;
    } catch (e) {
      lastErr = e;
      const m = e.message || "";
      // 401 = Key/地域错误，重试无意义；仅对限流/网关抖动重试
      const transient = /HTTP 429/.test(m) || /HTTP 502/.test(m) || /HTTP 503/.test(m);
      if (!transient || attempt === 2) throw e;
      console.error(`[qwen] ${m.slice(0, 180)} … retry ${attempt + 1}/2 in 2s`);
      await sleep(2000);
    }
  }
  throw lastErr;
}

async function main() {
  if (!DRY && !API_KEY) {
    console.error(
      "Missing DASHSCOPE_API_KEY (or QWEN_API_KEY). Add to repo-root .env or export in shell."
    );
    process.exit(1);
  }

  if (VERBOSE && !DRY) {
    const k = API_KEY;
    const fp =
      k.length > 16 ? `${k.slice(0, 8)}…${k.slice(-4)} (len=${k.length})` : `len=${k.length}`;
    console.error(`[qwen] verbose API_BASE=${API_BASE}`);
    console.error(`[qwen] verbose key ${fp}`);
  }

  let files = listQuizFiles(DIR, GLOB);
  if (ONLY.length) {
    files = files.filter((fp) => {
      try {
        const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
        const q = unwrapQuizJson(raw) || raw;
        return ONLY.includes(q.id);
      } catch {
        return false;
      }
    });
  }

  if (files.length === 0) {
    console.error("No JSON files matched.");
    process.exit(1);
  }

  console.log(`Review ${files.length} file(s) → ${OUT}`);
  const header =
    `# Qwen（通义千问）审稿报告\n\n` +
    `- 模型: \`${MODEL}\`\n` +
    `- API: \`${API_BASE}\`\n` +
    `- 目录: \`${DIR}\`\n` +
    `- 生成: ${new Date().toISOString()}\n` +
    `- full=${FULL}\n\n---\n\n`;
  fs.writeFileSync(OUT, header, "utf8");

  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch (e) {
      console.error(`Skip (parse error): ${fp}`, e.message);
      continue;
    }
    const quiz = unwrapQuizJson(raw) || raw;
    const payload = buildPayload(raw, { full: FULL });
    const userBlock = buildReviewUserBlock(fp, payload);

    console.log(`[${i + 1}/${files.length}] ${quiz.id || path.basename(fp)} …`);

    let review;
    if (DRY) {
      review = "_(dry-run — no API call)_\n\n" + truncate(userBlock, 800);
    } else {
      try {
        review = await callQwen(userBlock);
      } catch (e) {
        review = `**API 错误**: ${e.message}`;
        console.error(e.message);
      }
      await sleep(DELAY_MS);
    }

    const section = `## ${quiz.title || quiz.id} (\`${quiz.id}\`)\n\n${review}\n\n---\n\n`;
    fs.appendFileSync(OUT, section, "utf8");
  }

  console.log(`Done. Report: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
