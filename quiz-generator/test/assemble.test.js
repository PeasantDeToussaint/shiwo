const {
  simplifyDimensions,
  normalizeOutlineToArchitecture,
  assembleQuiz,
  applyProfilesFromHints,
} = require("../lib/assemble");
const { validateDimensionProfiles } = require("../lib/validate");

describe("assemble helpers", () => {
  it("simplifies long dimension labels consistently", () => {
    expect(simplifyDimensions(["理想主义", "现实主义", "传统与现代"])).toEqual([
      "理想",
      "现实",
      "传统",
    ]);
  });

  it("normalizes outline dimensions back to architecture dimensions", () => {
    const architecture = {
      dimensions: ["传统与现代", "理想主义"],
      results: [{ primaryDimension: "传统与现代" }, { primaryDimension: "理想主义" }],
    };
    const outline = {
      dimensions: ["传统现代", "理想"],
      dimensionAxes: [
        { dimension: "传统现代", axisLabel: "取向", lowPole: "现代", insight: "..." },
        { dimension: "理想", axisLabel: "驱动", lowPole: "现实", insight: "..." },
      ],
      results: [
        { id: "r1", dimension: "传统现代", dimension_profile: { "传统现代": 0.7, "理想": 0.3 } },
        { id: "r2", dimension: "理想", dimension_profile: { "传统现代": 0.2, "理想": 0.8 } },
      ],
    };

    const normalized = normalizeOutlineToArchitecture(outline, architecture);

    expect(normalized.dimensions).toEqual(["传统与现代", "理想主义"]);
    expect(normalized.dimensionAxes[0].dimension).toBe("传统与现代");
    expect(normalized.results[0].dimension_profile).toEqual({
      "传统与现代": 0.7,
      "理想主义": 0.3,
    });
  });

  it("assembles final quiz with normalized scores and result fields", () => {
    const outline = {
      id: "sample-quiz",
      title: "Sample Quiz",
      subtitle: "Sample Subtitle",
      eyebrow: "Sample",
      description: "Description",
      dimensions: ["理想主义", "现实主义"],
      dimensionAxes: [
        { dimension: "理想主义", axisLabel: "驱动", lowPole: "现实", highPole: "理想", insight: "..." },
        { dimension: "现实主义", axisLabel: "落点", lowPole: "理想", highPole: "现实", insight: "..." },
      ],
      results: [
        {
          id: "r1",
          dimension: "理想主义",
          title: "晨光",
          subtitle: "理想派",
          token: "灯",
          verse: "向光而行",
          verseSource: "匿名",
          dimension_profile: { "理想主义": 0.72, "现实主义": 0.28 },
        },
      ],
    };

    const questions = [
      {
        id: "q1",
        text: "题目",
        options: [
          { id: "a", text: "选项A", reaction: "好", scores: { "理想": 2, "现实主义": 1 } },
        ],
      },
    ];

    const results = [
      {
        id: "r1",
        portrait: "第一段",
        portrait_2: "第二段",
        strengths: ["行动快", "想象强"],
        weaknesses: [{ label: "太急", description: "容易着急。也容易抢跑。" }],
        lifeAdvice: ["先落地", "再放大"],
        extras: [{ key: "keyQuote", label: "代表名言", content: "这体现了你的特质" }],
      },
    ];

    const quiz = assembleQuiz(outline, questions, results);

    expect(quiz.scoring.dimensions).toEqual(["理想", "现实"]);
    expect(quiz.scoring.dimensionAxes[0].highPole).toBe("理想");
    expect(quiz.questions[0].options[0].scores).toEqual({ "理想": 2, "现实": 1 });
    expect(quiz.results[0].portrait).toBe("第一段\n\n第二段");
    expect(quiz.results[0].lifeAdvice).toBe("先落地；再放大");
    expect(quiz.results[0].extras[0].label).toBe("精神注脚");
    expect(quiz.results[0].dimension_profile).toEqual({ "理想": 0.72, "现实": 0.28 });
  });

  it("builds deterministic numeric profiles from profileHints", () => {
    const architecture = {
      dimensions: ["智谋深", "情义重", "行动力"],
      results: [
        {
          primaryDimension: "智谋深",
          profileHints: { "智谋深": "high", "情义重": "low", "行动力": "medium" },
        },
        {
          primaryDimension: "行动力",
          profileHints: { "智谋深": "low", "情义重": "medium", "行动力": "high" },
        },
      ],
    };
    const results = [
      { id: "r1", dimension: "智谋深" },
      { id: "r2", dimension: "行动力" },
    ];

    applyProfilesFromHints(results, architecture.dimensions, architecture);
    const firstPass = JSON.parse(JSON.stringify(results));

    applyProfilesFromHints(results, architecture.dimensions, architecture);
    expect(results).toEqual(firstPass);

    expect(results[0].dimension_profile["智谋深"]).toBeGreaterThan(results[0].dimension_profile["情义重"]);
    expect(results[1].dimension_profile["行动力"]).toBeGreaterThan(results[1].dimension_profile["智谋深"]);
    expect(results[0].dimension_profile).not.toEqual(results[1].dimension_profile);
  });

  it("builds contrastive profiles directly without cleanup passes", () => {
    const dimensions = ["权谋取向", "情感立场", "行事风格", "处世态度", "理想高度"];
    const results = [
      { id: "r1", dimension: "权谋取向" },
      { id: "r2", dimension: "情感立场" },
      { id: "r3", dimension: "行事风格" },
      { id: "r4", dimension: "处世态度" },
      { id: "r5", dimension: "理想高度" },
      { id: "r6", dimension: "行事风格" },
      { id: "r7", dimension: "权谋取向" },
      { id: "r8", dimension: "情感立场" },
    ];
    const architecture = {
      results: results.map((r, i) => ({
        primaryDimension: r.dimension,
        profileHints: Object.fromEntries(
          dimensions.map(d => [d, d === r.dimension ? "high" : (i % 2 === 0 ? "low" : "medium")])
        ),
      })),
    };

    applyProfilesFromHints(results, dimensions, architecture);
    const warnings = validateDimensionProfiles(results, dimensions);
    expect(warnings.some(w => w.includes("max diff 0.00"))).toBe(false);
    expect(warnings.some(w => w.includes("dominated by"))).toBe(false);
  });

  it("keeps eight results across three dimensions from producing dominated profiles", () => {
    const dimensions = ["权力欲望", "情感依恋", "理性计算"];
    const results = [
      { id: "r1", dimension: "情感依恋" },
      { id: "r2", dimension: "权力欲望" },
      { id: "r3", dimension: "权力欲望" },
      { id: "r4", dimension: "情感依恋" },
      { id: "r5", dimension: "情感依恋" },
      { id: "r6", dimension: "理性计算" },
      { id: "r7", dimension: "权力欲望" },
      { id: "r8", dimension: "理性计算" },
    ];
    const patterns = [
      { "权力欲望": "medium", "情感依恋": "high", "理性计算": "medium" },
      { "权力欲望": "high", "情感依恋": "medium", "理性计算": "low" },
      { "权力欲望": "high", "情感依恋": "medium", "理性计算": "low" },
      { "权力欲望": "low", "情感依恋": "high", "理性计算": "medium" },
      { "权力欲望": "medium", "情感依恋": "high", "理性计算": "low" },
      { "权力欲望": "low", "情感依恋": "medium", "理性计算": "high" },
      { "权力欲望": "high", "情感依恋": "low", "理性计算": "medium" },
      { "权力欲望": "medium", "情感依恋": "low", "理性计算": "high" },
    ];
    const architecture = {
      results: results.map((r, i) => ({
        primaryDimension: r.dimension,
        profileHints: patterns[i],
      })),
    };

    applyProfilesFromHints(results, dimensions, architecture);
    const warnings = validateDimensionProfiles(results, dimensions);
    expect(warnings.some(w => w.includes("dominated by"))).toBe(false);
    expect(warnings.filter(w => w.includes("profiles too similar")).length).toBeLessThan(2);
  });
});
