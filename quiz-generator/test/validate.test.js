const {
  validateArchitecture,
  validateOutlineStructure,
  validateQuestions,
  validateFinalQuiz,
  collectProfileSimilarityIssues,
} = require("../lib/validate");
const { fixStringifiedArrayFields, extractJSON } = require("../lib/json-repair");

describe("validation", () => {
  it("allows abbreviated dimension names but still reports invalid scores", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { "传统": 2, "表达": 1 } },
            { id: "b", scores: { "未知": 5, "表达": 0 } },
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

  it("skips outline profile similarity for level-band (tiers share monotonic profiles)", () => {
    const outline = {
      title: "测测段位",
      subtitle: "看看你在哪一档",
      eyebrow: "段位",
      dimensions: ["自知", "行动"],
      dimensionAxes: [
        { dimension: "自知", axisLabel: "自知", insight: "更清醒" },
        { dimension: "行动", axisLabel: "行动", insight: "更敢做" },
      ],
      results: [
        { id: "r1", title: "起步", dimension: "自知", dimension_profile: { 自知: 0.2, 行动: 0.2 } },
        { id: "r2", title: "进阶", dimension: "自知", dimension_profile: { 自知: 0.22, 行动: 0.21 } },
      ],
    };
    const arch = { scoringFamily: "level-band", resultType: "tier_level", dimensions: ["自知", "行动"] };
    const errors = validateOutlineStructure(outline, arch);
    expect(errors.some((e) => e.includes("profiles too similar"))).toBe(false);
  });

  it("still enforces outline profile similarity for weighted-dimension", () => {
    const outline = {
      title: "测测类型",
      subtitle: "你更像哪种",
      eyebrow: "类型",
      dimensions: ["自知", "行动"],
      dimensionAxes: [
        { dimension: "自知", axisLabel: "自知", insight: "更清醒" },
        { dimension: "行动", axisLabel: "行动", insight: "更敢做" },
      ],
      results: [
        { id: "r1", title: "甲", dimension: "自知", dimension_profile: { 自知: 0.2, 行动: 0.2 } },
        { id: "r2", title: "乙", dimension: "自知", dimension_profile: { 自知: 0.22, 行动: 0.21 } },
      ],
    };
    const arch = { scoringFamily: "weighted-dimension", resultType: "archetype", dimensions: ["自知", "行动"] };
    const errors = validateOutlineStructure(outline, arch);
    expect(errors.some((e) => e.includes("profiles too similar"))).toBe(true);
  });

  it("requires dimensionSpecs with valid anchor results", () => {
    const errors = validateArchitecture({
      scoringFamily: "weighted-dimension",
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

  it("rejects resultType tier_level when scoringFamily is not level-band", () => {
    const errors = validateArchitecture({
      scoringFamily: "bipolar-dimension",
      resultType: "tier_level",
      dimensionCount: 1,
      dimensions: ["情感基调"],
      resultFields: [
        { key: "portrait", label: "画像", standard: true },
        { key: "extraA", label: "扩展甲", standard: false },
        { key: "extraB", label: "扩展乙", standard: false },
      ],
      dimensionSpecs: [
        {
          dimension: "情感基调",
          highDefinition: "更热烈",
          lowDefinition: "更克制",
          highAnchorResults: ["档甲", "档丙"],
          lowAnchorResults: ["档乙", "档丁"],
          forbiddenInterpretations: ["不是外向内向"],
        },
      ],
      results: [
        { conceptId: "c1", name: "档甲", nameContext: "高之一", profileHints: { 情感基调: "high" } },
        { conceptId: "c2", name: "档乙", nameContext: "低之一", profileHints: { 情感基调: "low" } },
        { conceptId: "c3", name: "档丙", nameContext: "高之二", profileHints: { 情感基调: "high" } },
        { conceptId: "c4", name: "档丁", nameContext: "低之二", profileHints: { 情感基调: "low" } },
      ],
    });
    expect(errors.some((e) => e.includes("tier_level") && e.includes("level-band"))).toBe(true);
  });

  it("allows negative scores for bipolar-dimension", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { "公义优先": 2, "明面直行": -1 } },
            { id: "b", scores: { "公义优先": -3 } },
          ],
        },
      ],
      ["公义优先", "明面直行"],
      { scoringType: "bipolar-dimension" }
    );

    expect(warnings.some(w => w.includes('score -1 out of range'))).toBe(false);
    expect(warnings.some(w => w.includes('score -3 out of range'))).toBe(true);
  });

  it("flags bipolar sign-mixing and missing reverse coverage", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", text: "主动投入", reaction: "冲", scores: { "参与方式": 2, "认知取向": -1 } },
            { id: "b", text: "继续前进", reaction: "上", scores: { "参与方式": 1 } },
          ],
        },
      ],
      ["参与方式", "认知取向"],
      {
        scoringType: "bipolar-dimension",
        dimensionAxes: [
          { dimension: "参与方式", lowPole: "观察", highPole: "参与" },
          { dimension: "认知取向", lowPole: "接受", highPole: "探索" },
        ],
      }
    );

    expect(warnings.some(w => w.includes("mixes positive and negative scores"))).toBe(true);
    expect(warnings.some(w => w.includes("参与方式: bipolar coverage missing one side"))).toBe(true);
  });

  it("flags duplicate option score vectors (weighted-dimension)", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { A: 2, B: 1 } },
            { id: "b", scores: { A: 1, B: 2 } },
            { id: "c", scores: { A: 0, B: 0 } },
            { id: "d", scores: { A: 0, B: 0 } },
          ],
        },
      ],
      ["A", "B"],
      { scoringType: "weighted-dimension" }
    );

    expect(warnings.some((w) => w.includes("duplicate score vectors"))).toBe(true);
  });

  it("flags lockstep same values on both dimensions (weighted-dimension)", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { A: 2, B: 2 } },
            { id: "b", scores: { A: 1, B: 1 } },
            { id: "c", scores: { A: 0, B: 0 } },
            { id: "d", scores: { A: 3, B: 3 } },
          ],
        },
      ],
      ["A", "B"],
      { scoringType: "weighted-dimension" }
    );

    expect(warnings.some((w) => w.includes("do not differentiate dimensions"))).toBe(true);
  });

  it("allows weighted options when one option splits dimensions", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { A: 2, B: 1 } },
            { id: "b", scores: { A: 1, B: 2 } },
            { id: "c", scores: { A: 0, B: 0 } },
            { id: "d", scores: { A: 0, B: 1 } },
          ],
        },
      ],
      ["A", "B"],
      { scoringType: "weighted-dimension" }
    );

    expect(warnings.filter((w) => /duplicate score vectors|do not differentiate dimensions/.test(w))).toHaveLength(0);
  });

  it("skips dimensional-spread rule for bipolar-dimension", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { 参与方式: 2, 认知取向: 2 } },
            { id: "b", scores: { 参与方式: -2, 认知取向: -2 } },
            { id: "c", scores: { 参与方式: 1, 认知取向: 1 } },
            { id: "d", scores: { 参与方式: -1, 认知取向: -1 } },
          ],
        },
      ],
      ["参与方式", "认知取向"],
      { scoringType: "bipolar-dimension" }
    );

    expect(warnings.some((w) => w.includes("do not differentiate dimensions"))).toBe(false);
  });

  it("skips dimensional-spread for level-band but still enforces distinct vectors", () => {
    const ok = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { A: 2 } },
            { id: "b", scores: { A: 1 } },
            { id: "c", scores: { B: 2 } },
            { id: "d", scores: { B: 1 } },
          ],
        },
      ],
      ["A", "B"],
      { scoringType: "level-band" }
    );

    expect(ok.some((w) => w.includes("do not differentiate dimensions"))).toBe(false);
    expect(ok.some((w) => w.includes("duplicate score vectors"))).toBe(false);
  });

  it("level-band still flags duplicate score vectors (e.g. two 0,0 options)", () => {
    const warnings = validateQuestions(
      [
        {
          id: "q1",
          text: "题目",
          options: [
            { id: "a", scores: { A: 2, B: 2 } },
            { id: "b", scores: { A: 1, B: 1 } },
            { id: "c", scores: { A: 0, B: 0 } },
            { id: "d", scores: { A: 0, B: 0 } },
          ],
        },
      ],
      ["A", "B"],
      { scoringType: "level-band" }
    );

    expect(warnings.some((w) => w.includes("duplicate score vectors"))).toBe(true);
    expect(warnings.some((w) => w.includes("do not differentiate dimensions"))).toBe(false);
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

  it("rejects bipolar final output missing highPole", () => {
    const result = validateFinalQuiz({
      scoring: {
        type: "bipolar-dimension",
        dimensions: ["参与方式"],
        dimensionAxes: [
          { dimension: "参与方式", lowPole: "观察", highInsight: "高端", lowInsight: "低端" },
        ],
      },
      questions: [],
      results: [],
    });

    expect(result.errors.some(err => err.includes('missing highPole'))).toBe(true);
  });
});

describe("json-repair: fixStringifiedArrayFields", () => {
  it("unwraps escaped array: \"highAnchorResults\": \"[\\\"a\\\",\\\"b\\\"]\"", () => {
    const input = `{"highAnchorResults": "[\\"言豫津\\", \\"蒙挚\\"]"}`;
    const fixed = fixStringifiedArrayFields(input);
    const parsed = JSON.parse(fixed);
    expect(Array.isArray(parsed.highAnchorResults)).toBe(true);
    expect(parsed.highAnchorResults).toEqual(["言豫津", "蒙挚"]);
  });

  it("unwraps unescaped array via extractJSON pipeline", () => {
    // Simulate model output: "highAnchorResults": "["言豫津", "蒙挚"]"
    const input = `{"highAnchorResults": "["言豫津", "蒙挚"]", "lowAnchorResults": ["靖王"]}`;
    const parsed = extractJSON(input);
    expect(Array.isArray(parsed.highAnchorResults)).toBe(true);
    expect(parsed.highAnchorResults).toEqual(["言豫津", "蒙挚"]);
    expect(parsed.lowAnchorResults).toEqual(["靖王"]);
  });
});
