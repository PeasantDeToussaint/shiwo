#!/usr/bin/env node
/**
 * Read-only audit: emit Markdown findings for live snapshot JSON.
 * Does not modify quiz data.
 */
const fs = require("fs");
const path = require("path");
const {
  validateFinalQuiz,
  validateQuestions,
  validateResults,
  validateDimensionProfiles,
  validateScoreMap,
} = require("../quiz-generator/lib/validate");

const LIVE_DIR = path.join(__dirname, "data/live_audit");
const OUT = path.join(__dirname, "../docs/live-quiz-full-audit-findings.md");

const META = new Set([
  "catalog",
  "high-risk-shortlist",
  "weighted-risk-report",
]);

const STANDARD_SCORING = new Set([
  "weighted-dimension",
  "bipolar-dimension",
  "level-band",
]);

function esc(s) {
  return String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .slice(0, 200);
}

function listQuizFiles() {
  return fs
    .readdirSync(LIVE_DIR)
    .filter((f) => f.endsWith(".json") && !META.has(f.replace(/\.json$/, "")))
    .map((f) => path.join(LIVE_DIR, f))
    .sort();
}

function loadCatalogIds() {
  const p = path.join(LIVE_DIR, "catalog.json");
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(raw)) return null;
  return new Set(raw.map((e) => e.id).filter(Boolean));
}

/** Cloud snapshot occasionally wraps payload as { id, quiz }. */
function unwrapQuizPayload(raw) {
  if (
    raw &&
    raw.quiz &&
    typeof raw.quiz === "object" &&
    Array.isArray(raw.quiz.questions)
  ) {
    return raw.quiz;
  }
  return raw;
}

/** Dimension list for weighted/bipolar/level-band (string axis names). */
function stringDimensions(scoring) {
  const d = scoring && scoring.dimensions;
  if (!Array.isArray(d) || d.length === 0) return [];
  if (typeof d[0] === "string") return d.filter(Boolean);
  return [];
}

function run() {
  const catalogIds = loadCatalogIds();
  const files = listQuizFiles();
  const ts = new Date().toISOString();

  const intro = [
    `# 线上题库全量审校 Findings（机器辅助 + 规则校验）`,
    ``,
    `生成时间（UTC）：${ts}`,
    ``,
    `数据来源：\`scripts/data/live_audit/*.json\`（与最近一次从 CloudBase \`quizWriter\` 拉取的快照一致）。`,
    ``,
    `说明：本报告**不是**真人通读后的主观评价。对 **scoring.type 为 \`weighted-dimension\` / \`bipolar-dimension\` / \`level-band\`** 的套题，执行与生成管线一致的校验（\`validateFinalQuiz\`、\`validateQuestions\`、\`validateResults\`、\`validateDimensionProfiles\`、\`validateScoreMap\`）。**city / dialect / big-five 等专用模型**仅跑 \`validateFinalQuiz\`（文案损坏等）并做结构枚举，避免把「量表 value」「方言区代码」误判为维度错误。`,
    ``,
    `已确认从线上删除、本快照中若仍残留 JSON 则为历史文件：\`media-niche-test\`、\`spiritual-homeland\`、\`post-apocalypse-role\`（以当前 catalog 为准）。`,
    ``,
    `本目录共扫描 **${files.length}** 个 JSON 文件（已排除 catalog / 风险清单等元数据）。`,
    ``,
  ];

  const rows = [];
  const body = [];
  let totalErr = 0;
  let totalWarn = 0;

  for (const fp of files) {
    const id = path.basename(fp, ".json");
    const lines = [];
    let quiz;
    try {
      quiz = unwrapQuizPayload(JSON.parse(fs.readFileSync(fp, "utf8")));
    } catch (e) {
      rows.push({ id, err: 1, warn: 0, q: 0, r: 0, note: "JSON parse error" });
      lines.push(`## ${id}`);
      lines.push(`- **致命**：无法解析 JSON — ${e.message}`);
      lines.push(``);
      body.push(...lines);
      continue;
    }

    const quizId = quiz.id || id;
    const inCatalog = catalogIds ? catalogIds.has(quizId) : null;

    lines.push(`## ${quizId}`);
    if (inCatalog === false) {
      lines.push(`- **注意**：此文件 id 不在 \`catalog.json\` 中（可能已下线或 catalog 未同步）。`);
    }

    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      lines.push(`- **结构**：无 \`questions\` 或非数组/为空 — 可能为定制页（如部分 catalog 中 questionCount=0 的条目）或数据异常。`);
      lines.push(`- **抽查字段**：\`results\` ${Array.isArray(quiz.results) ? quiz.results.length : "缺失"}`);
      lines.push(``);
      rows.push({ id: quizId, err: 0, warn: 1, q: 0, r: (quiz.results || []).length, note: "no questions" });
      body.push(...lines);
      continue;
    }

    const scoringType =
      (quiz.scoring && quiz.scoring.type) || "weighted-dimension";
    const dims = stringDimensions(quiz.scoring);
    const dimAxes = (quiz.scoring && quiz.scoring.dimensionAxes) || [];
    const resultFields = quiz.resultFields;
    const useGenericValidators = STANDARD_SCORING.has(scoringType);

    let finalV = validateFinalQuiz(quiz);
    if (!dims.length) {
      const dropProfileNoise = (msg) =>
        /profiles too similar|is unreachable|dominated by/i.test(String(msg));
      finalV = {
        errors: finalV.errors.filter((e) => !dropProfileNoise(e)),
        warnings: finalV.warnings.filter((w) => !dropProfileNoise(w)),
      };
    }
    let qWarn = [];
    let rWarn = [];
    let pWarn = [];
    let mapWarn = [];
    if (useGenericValidators) {
      qWarn = validateQuestions(quiz.questions, dims, {
        scoringType,
        dimensionAxes: dimAxes,
      });
      rWarn = validateResults(quiz.results || [], dims, resultFields);
      pWarn = validateDimensionProfiles(quiz.results || [], dims, {
        scoringType,
      });
      mapWarn = validateScoreMap(quiz.questions, dims);
    }

    const errs = [...finalV.errors];
    const warns = [
      ...finalV.warnings,
      ...qWarn,
      ...rWarn,
      ...pWarn,
      ...mapWarn,
    ];
    if (!useGenericValidators && quiz.questions && quiz.questions.length) {
      warns.push(
        `（说明）scoring.type=\`${scoringType}\` 非三种标准计分族，已跳过 validateQuestions / validateResults(profile) / validateDimensionProfiles / validateScoreMap，以免误报。`
      );
    }

    totalErr += errs.length;
    totalWarn += warns.length;
    rows.push({
      id: quizId,
      err: errs.length,
      warn: warns.length,
      q: quiz.questions.length,
      r: (quiz.results || []).length,
      type: scoringType,
    });

    lines.push(`- **计分**：\`${scoringType}\` · 维度数 ${dims.length} · 题数 ${quiz.questions.length} · 结果数 ${(quiz.results || []).length}`);

    if (errs.length) {
      lines.push(`- **错误（${errs.length}）**`);
      for (const e of errs) lines.push(`  - ${e}`);
    }
    if (warns.length) {
      lines.push(`- **警告（${warns.length}）**`);
      for (const w of warns) lines.push(`  - ${w}`);
    }
    if (!errs.length && !warns.length) {
      lines.push(`- **聚合校验**：无 error / warning。`);
    }

    lines.push(``);
    lines.push(`### 逐题 · 逐选项`);

    const dimSet = new Set(dims);
    for (const q of quiz.questions) {
      const qText = q.text || q.prompt || q.title || "";
      if (Array.isArray(q.provinces) && q.provinces.length && !q.options) {
        lines.push(
          `- **${q.id}** 省级/列表选择：${q.provinces.length} 条；题干：${esc(qText)}`
        );
        continue;
      }
      const opts = q.options || [];
      if (!opts.length) {
        lines.push(`- **${q.id}** 无 \`options\`；题干：${esc(qText)}`);
        continue;
      }
      const optNotes = [];
      for (const o of opts) {
        const scores = o.scores || {};
        const keys = Object.keys(scores);
        const bits = [];
        if (!keys.length) {
          if (typeof o.value === "number")
            bits.push(`量表 value=${o.value}（无 scores）`);
          else if (!useGenericValidators)
            bits.push("无 scores（专用题型或未列分数字段）");
          else bits.push("无 scores");
        }
        if (useGenericValidators && keys.length) {
          for (const [dk, val] of Object.entries(scores)) {
            if (!dimSet.has(dk)) bits.push(`未知维「${dk}」`);
            if (typeof val !== "number") bits.push(`${dk} 非数字`);
            else {
              const minS = scoringType === "bipolar-dimension" ? -2 : 0;
              const maxS = 3;
              if (val < minS || val > maxS)
                bits.push(`${dk}=${val} 越界[${minS},${maxS}]`);
              if (
                scoringType === "bipolar-dimension" &&
                val !== 0 &&
                ![-2, -1, 1, 2].includes(val)
              )
                bits.push(`${dk}=${val} 非±1/±2`);
            }
          }
          if (scoringType === "bipolar-dimension") {
            const nz = Object.values(scores).filter(
              (v) => typeof v === "number" && v !== 0
            );
            const signs = new Set(nz.map((v) => Math.sign(v)));
            if (signs.size > 1) bits.push("双极混号");
            if (keys.length > 2) bits.push(`双极维度键>${2}`);
          }
        } else if (keys.length) {
          bits.push(`scores 键：${keys.join(",")}`);
        }
        const optLabel = o.text || o.label || "";
        const textEmpty = !String(optLabel).trim();
        if (textEmpty) bits.push("选项文案空(text/label)");
        optNotes.push({ oid: o.id, bits });
      }
      lines.push(`- **${q.id}** 题干：${esc(qText)}`);
      for (const { oid, bits } of optNotes) {
        const status = bits.length ? bits.join("；") : "结构检查通过";
        const o = opts.find((x) => x.id === oid) || {};
        lines.push(
          `  - \`${q.id}.${oid}\`：${status} — ${esc(o.text || o.label)}`
        );
      }
    }

    lines.push(``);
    lines.push(`### 逐结果`);

    const results = quiz.results || [];
    if (!results.length) {
      lines.push(`- （无 results）`);
    } else {
      for (const r of results) {
        const prof = r.dimension_profile;
        const prNotes = [];
        if (!prof) prNotes.push("缺 dimension_profile");
        else if (useGenericValidators && dims.length) {
          for (const d of dims) {
            if (!(d in prof)) prNotes.push(`profile 缺「${d}」`);
          }
          for (const [k, v] of Object.entries(prof)) {
            if (!dimSet.has(k)) prNotes.push(`未知维「${k}」`);
            if (typeof v === "number" && (v <= 0 || v >= 1))
              prNotes.push(`${k}=${v} 不在 (0,1)`);
          }
        } else if (prof) {
          prNotes.push(
            `profile 键：${Object.keys(prof).join(", ")}（未做 (0,1) 轴校验）`
          );
        }
        const title = r.title || r.name || r.id;
        if (prNotes.length) {
          lines.push(`- **${r.id}**（${esc(title)}）：${prNotes.join("；")}`);
        } else if (useGenericValidators && prof) {
          lines.push(
            `- **${r.id}**（${esc(title)}）：profile 键与范围检查通过。`
          );
        } else {
          lines.push(
            `- **${r.id}**（${esc(title)}）：无 dimension_profile 或非标准计分下未校验 profile。`
          );
        }
      }
    }

    lines.push(``);
    body.push(...lines);
  }

  const tableLines = [
    `## 总览`,
    ``,
    `| quizId | scoring | 题数 | 结果数 | errors | warnings | 备注 |`,
    `| --- | --- | ---: | ---: | ---: | ---: | --- |`,
  ];
  for (const row of rows) {
    tableLines.push(
      `| ${row.id} | ${row.type || "-"} | ${row.q} | ${row.r} | ${row.err} | ${row.warn} | ${esc(row.note || "")} |`
    );
  }
  tableLines.push(``);
  tableLines.push(`**合计** errors=${totalErr}, warnings=${totalWarn}（跨所有含 questions 的套题；无题目套题未计入合计）。`);
  tableLines.push(``);

  const finalOut = [...intro, ...tableLines, ...body];

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, finalOut.join("\n"), "utf8");
  console.log("Wrote", OUT);
}

run();
