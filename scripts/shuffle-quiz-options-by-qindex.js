/**
 * Mix four-option quiz positions: correct answer spread across a/b/c/d irregularly.
 *
 * 1) Normalize each question so the scored option is first (stable order for the other three).
 * 2) Left-rotate by a per-question shift from TARGET_CORRECT_INDEX_BY_Q, then assign ids a–d.
 */
const fs = require("fs");
const path = require("path");

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node shuffle-quiz-options-by-qindex.js <quiz.json> [...]");
  process.exit(1);
}

/** 22 题：正确答案最终落在 screen 位置 0=a,1=b,2=c,3=d — 大致均衡、无 q≡n(mod4) 周期 */
const TARGET_CORRECT_INDEX_BY_Q = [
  2, 0, 3, 1, 1, 3, 0, 2, 3, 1, 2, 0, 0, 2, 1, 3, 2, 3, 0, 1, 1, 0,
];

function shiftForCorrectIndex(pos) {
  return (4 - pos) % 4;
}

function normalizeOptionsFirstScored(options) {
  const scoredIdx = options.findIndex(
    (o) => o.scores && typeof o.scores === "object" && Object.keys(o.scores).length > 0
  );
  if (scoredIdx <= 0) return options.slice();
  const next = [...options];
  const [hit] = next.splice(scoredIdx, 1);
  return [hit, ...next];
}

for (const fp of files) {
  const quiz = JSON.parse(fs.readFileSync(fp, "utf8"));
  const questions = quiz.questions || [];
  const nq = questions.filter((q) => /^q\d+$/i.test(String(q.id || ""))).length;

  for (const q of questions) {
    if (!/^q\d+$/i.test(String(q.id || ""))) continue;
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length !== 4) continue;
    const qi = parseInt(String(q.id).replace(/^q/i, ""), 10) - 1;
    const scoredCount = opts.filter(
      (o) => o.scores && typeof o.scores === "object" && Object.keys(o.scores).length > 0
    ).length;

    let canonical;
    let shift;
    if (scoredCount === 1) {
      canonical = normalizeOptionsFirstScored(opts);
      const targetPos =
        qi < TARGET_CORRECT_INDEX_BY_Q.length
          ? TARGET_CORRECT_INDEX_BY_Q[qi]
          : [2, 0, 3, 1][qi % 4];
      shift = shiftForCorrectIndex(targetPos);
    } else {
      canonical = opts.slice();
      const targetPos =
        qi < TARGET_CORRECT_INDEX_BY_Q.length
          ? TARGET_CORRECT_INDEX_BY_Q[qi]
          : [2, 0, 3, 1][qi % 4];
      shift = shiftForCorrectIndex(targetPos);
    }

    const rot = [...canonical.slice(shift), ...canonical.slice(0, shift)];
    rot.forEach((o, i) => {
      o.id = ["a", "b", "c", "d"][i];
    });
    q.options = rot;
  }

  fs.writeFileSync(fp, JSON.stringify(quiz, null, 2) + "\n");
  console.log("rotated", path.basename(fp), "questions", nq);
}
