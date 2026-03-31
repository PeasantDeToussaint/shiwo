const {
  validateArchitecture,
  validateQuestions,
  validateFinalQuiz,
  collectProfileSimilarityIssues,
} = require("../lib/validate");

describe("validation", () => {
  it("allows abbreviated dimension names but still reports invalid scores", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { "传统": 2 } },
            { id: "b", scores: { "未知": 5 } },
          ],
        },
      ],
      ["传统与现代", "表达"]
    );

    expect(warnings.some(w => w.includes('unknown dimension "传统"'))).toBe(false);
    expect(warnings.some(w => w.includes('unknown dimension "未知"'))).toBe(true);
    expect(warnings.some(w => w.includes("score 5 out of range"))).toBe(true);
  });

  it("flags severe profile similarity", () => {
    const issues = collectProfileSimilarityIssues(
      [
        { id: "r1", dimension_profile: { A: 0.5, B: 0.5 } },
        { id: "r2", dimension_profile: { A: 0.56, B: 0.54 } },
      ],
      ["A", "B"]
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severe).toBe(true);
  });

  it("requires dimensionSpecs with valid anchor results", () => {
    const errors = validateArchitecture({
      dimensionCount: 2,
      dimensions: ["公义优先", "明面直行"],
      dimensionSpecs: [
        {
          dimension: "公义优先",
          highDefinition: "优先考虑公义与群体利益",
          lowDefinition: "优先考虑个人得失与安全",
          highAnchorResults: ["靖王"],
          lowAnchorResults: ["誉王"],
          forbiddenInterpretations: ["不是有野心", "不是行动果断"],
        },
        {
          dimension: "明面直行",
          highDefinition: "倾向公开表态与直接行动",
          lowDefinition: "倾向暗中布局与迂回推进",
          highAnchorResults: ["不存在的人"],
          lowAnchorResults: ["梅长苏"],
          forbiddenInterpretations: ["不是幼稚", "不是没城府"],
        },
      ],
      results: [
        { conceptId: "c1", name: "靖王", primaryDimension: "公义优先", profileHints: { "公义优先": "high", "明面直行": "high" } },
        { conceptId: "c2", name: "誉王", primaryDimension: "公义优先", profileHints: { "公义优先": "low", "明面直行": "low" } },
        { conceptId: "c3", name: "梅长苏", primaryDimension: "明面直行", profileHints: { "公义优先": "medium", "明面直行": "low" } },
      ],
    });

    expect(errors.some(err => err.includes('highAnchorResults contains unknown result "不存在的人"'))).toBe(true);
  });

  it("rejects corrupted final output and fake quotes", () => {
    const longPortrait = "没有分段也没有句号的超长画像".repeat(12);
    const result = validateFinalQuiz({
      scoring: {
        dimensions: ["更多维度按需补足"],
      },
      questions: [
        {
          id: "q1",
          text: "正常题目",
          options: [{ id: "a", text: "好好好", reaction: "更多维度按已确定" }],
        },
      ],
      results: [
        {
          id: "r1",
          title: "正常",
          subtitle: "正常",
          token: "标记",
          verse: "短句",
          verseSource: "来源",
          portrait: longPortrait,
          extras: [{ key: "keyQuote", label: "代表名言", content: "这体现了你的特质" }],
          dimension_profile: { "更多维度按需补足": 0.5 },
        },
      ],
    });

    expect(result.errors.some(err => err.includes('invalid dimension label'))).toBe(true);
    expect(result.errors.some(err => err.includes("corrupted reaction text"))).toBe(true);
    expect(result.errors.some(err => err.includes("does not look like a quote"))).toBe(true);
  });
});
