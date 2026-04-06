#!/usr/bin/env node
/**
 * review-quizzes-openai.js
 *
 * Same editorial rubric as review-quizzes-zhipu.js, but calls OpenAI Chat Completions
 * (default model gpt-5 — override with OPENAI_REVIEW_MODEL or --model=).
 *
 * Prerequisites:
 *   export OPENAI_API_KEY=...   (or repo-root .env)
 *
 * Usage:
 *   node scripts/review-quizzes-openai.js
 *   node scripts/review-quizzes-openai.js --dir=scripts/22newquizes --out=scripts/quiz-review-openai.md
 *   node scripts/review-quizzes-openai.js --only=imperial-examination-simulation
 *   node scripts/review-quizzes-openai.js --model=gpt-5-mini --delay=2000
 *   node scripts/review-quizzes-openai.js --dry-run
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

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const HTTP_TIMEOUT_MS = 180000;
const DEFAULT_DIR = path.resolve(__dirname, "22newquizes");
const DEFAULT_OUT = path.resolve(__dirname, "quiz-review-openai.md");
const DEFAULT_MODEL = process.env.OPENAI_REVIEW_MODEL || "gpt-5";
const DEFAULT_DELAY_MS = 1500;

const ARGS = process.argv.slice(2);

function argVal(prefix, fallback) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  if (!a) return fallback;
  return a.slice(prefix.length).replace(/^=["']?|["']$/g, "") || fallback;
}

const DIR = path.resolve(argVal("--dir=", DEFAULT_DIR));
const GLOB = argVal("--glob=", "*.json");
const OUT = path.resolve(argVal("--out=", DEFAULT_OUT));
const MODEL = argVal("--model=", DEFAULT_MODEL);
const DELAY_MS = parseInt(argVal("--delay=", String(DEFAULT_DELAY_MS)), 10) || DEFAULT_DELAY_MS;
const ONLY = argVal("--only=", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FULL = ARGS.includes("--full");
const DRY = ARGS.includes("--dry-run");
const HELP = ARGS.includes("--help") || ARGS.includes("-h");

if (HELP) {
  console.log(`
review-quizzes-openai.js — OpenAI Chat Completions editorial review for quiz JSON

Env:  OPENAI_API_KEY (required unless --dry-run)
      OPENAI_REVIEW_MODEL optional default for --model

Args:
  --dir=PATH       Folder of quiz JSON (default: scripts/22newquizes)
  --glob=PATTERN   Filename glob filter (default: *.json)
  --out=FILE       Markdown report (default: scripts/quiz-review-openai.md)
  --model=NAME     e.g. gpt-5 (default), gpt-5-mini, gpt-4o, …
  --delay=MS       Pause between API calls (default: ${DEFAULT_DELAY_MS})
  --only=id1,id2   Limit to quiz id(s)
  --full           Longer portrait previews in payload
  --dry-run        No API calls
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

/** Newer OpenAI models often expect max_completion_tokens; older use max_tokens + temperature. */
function chatCompletionBody(model, messages) {
  const m = (model || "").toLowerCase();
  const useCompletionCap = /^(gpt-5|o[134]|o1|o3)/i.test(m) || m.includes("gpt-5");
  if (useCompletionCap) {
    return {
      model,
      messages,
      max_completion_tokens: 8192,
    };
  }
  return {
    model,
    messages,
    max_tokens: 8192,
    temperature: 0.35,
  };
}

async function callOpenAI(userContent) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
  const body = chatCompletionBody(MODEL, messages);
  const res = await httpPostJson("https://api.openai.com/v1/chat/completions", body, {
    Authorization: `Bearer ${OPENAI_KEY}`,
  });
  const msg = res.choices?.[0]?.message?.content;
  if (!msg) {
    throw new Error(`OpenAI: empty choices: ${JSON.stringify(res).slice(0, 400)}`);
  }
  return msg;
}

async function main() {
  if (!DRY && !OPENAI_KEY) {
    console.error("Missing OPENAI_API_KEY. Set env or add OPENAI_API_KEY to repo-root .env");
    process.exit(1);
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
  const header = `# OpenAI 审稿报告\n\n- 模型: \`${MODEL}\`\n- 目录: \`${DIR}\`\n- 生成: ${new Date().toISOString()}\n- full=${FULL}\n\n---\n\n`;
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
        review = await callOpenAI(userBlock);
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
