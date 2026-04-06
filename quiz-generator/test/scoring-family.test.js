const { scoreGeneric } = require("../../miniprogram/subpackages/quiz/utils/scoreGeneric");

describe("scoring families", () => {
  it("matches bipolar results with centered normalization", () => {
    const quiz = {
      scoring: {
        type: "bipolar-dimension",
        dimensions: ["公义", "直行"],
      },
      questions: [
        {
          id: "q1",
          options: [
            { id: "a", scores: { "公义": 2 } },
            { id: "b", scores: { "公义": -2 } },
          ],
        },
        {
          id: "q2",
          options: [
            { id: "a", scores: { "直行": 2 } },
            { id: "b", scores: { "直行": -2 } },
          ],
        },
      ],
      results: [
        { id: "r1", title: "高公义高直行", dimension_profile: { "公义": 0.9, "直行": 0.9 } },
        { id: "r2", title: "低公义低直行", dimension_profile: { "公义": 0.1, "直行": 0.1 } },
      ],
    };

    const result = scoreGeneric(quiz, [
      { questionId: "q1", optionId: "a" },
      { questionId: "q2", optionId: "a" },
    ]);

    expect(result.resultId).toBe("r1");
    expect(result.normalized["公义"]).toBeGreaterThan(0.5);
    expect(result.normalized["直行"]).toBeGreaterThan(0.5);
  });

  it("maps level-band results by overall score bands", () => {
    const quiz = {
      scoring: {
        type: "level-band",
        dimensions: ["自知", "行动"],
        bands: [
          { resultId: "r1", rank: 0, min: 0, max: 0.24 },
          { resultId: "r2", rank: 1, min: 0.25, max: 0.49 },
          { resultId: "r3", rank: 2, min: 0.5, max: 0.74 },
          { resultId: "r4", rank: 3, min: 0.75, max: 1 },
        ],
      },
      questions: [
        {
          id: "q1",
          options: [
            { id: "a", scores: { "自知": 3, "行动": 1 } },
            { id: "b", scores: { "自知": 0, "行动": 0 } },
          ],
        },
        {
          id: "q2",
          options: [
            { id: "a", scores: { "自知": 3, "行动": 1 } },
            { id: "b", scores: { "自知": 0, "行动": 0 } },
          ],
        },
      ],
      results: [
        { id: "r1", title: "起步", dimension_profile: { "自知": 0.2, "行动": 0.2 } },
        { id: "r2", title: "进阶", dimension_profile: { "自知": 0.4, "行动": 0.4 } },
        { id: "r3", title: "成熟", dimension_profile: { "自知": 0.7, "行动": 0.7 } },
        { id: "r4", title: "顶配", dimension_profile: { "自知": 0.9, "行动": 0.9 } },
      ],
    };

    const result = scoreGeneric(quiz, [
      { questionId: "q1", optionId: "a" },
      { questionId: "q2", optionId: "a" },
    ]);

    expect(result.resultId).toBe("r4");
    expect(result.overallScore).toBeGreaterThanOrEqual(0.75);
  });

  it("level-band without scoring.bands infers cutoffs from results (avoids always-first result)", () => {
    const quiz = {
      scoring: {
        type: "level-band",
        dimensions: ["X"],
      },
      questions: [
        {
          id: "q1",
          options: [
            { id: "hi", scores: { X: 3 } },
            { id: "lo", scores: { X: 0 } },
          ],
        },
      ],
      results: [
        { id: "low", title: "低", levelRank: 1 },
        { id: "high", title: "高", levelRank: 2 },
      ],
    };

    const low = scoreGeneric(quiz, [{ questionId: "q1", optionId: "lo" }]);
    expect(low.resultId).toBe("low");

    const high = scoreGeneric(quiz, [{ questionId: "q1", optionId: "hi" }]);
    expect(high.resultId).toBe("high");
    expect(high.overallScore).toBe(1);
  });

  it("level-band uses attainable-normalized t when minTotal > 0 (not legacy overall)", () => {
    const quiz = {
      scoring: {
        type: "level-band",
        dimensions: ["恋爱成熟"],
        bands: [
          { resultId: "r1", rank: 0, min: 0, max: 0.19 },
          { resultId: "r2", rank: 1, min: 0.2, max: 0.39 },
          { resultId: "r3", rank: 2, min: 0.4, max: 0.59 },
          { resultId: "r4", rank: 3, min: 0.6, max: 0.79 },
          { resultId: "r5", rank: 4, min: 0.8, max: 1 },
        ],
      },
      questions: [
        {
          id: "q1",
          options: [
            { id: "a", bandPoints: 0, scores: { 恋爱成熟: 0 } },
            { id: "b", bandPoints: 1, scores: { 恋爱成熟: 1 } },
            { id: "c", bandPoints: 2, scores: { 恋爱成熟: 2 } },
            { id: "d", bandPoints: 3, scores: { 恋爱成熟: 3 } },
          ],
        },
      ],
      results: [
        { id: "r1", title: "低" },
        { id: "r2", title: "中低" },
        { id: "r3", title: "中" },
        { id: "r4", title: "中高" },
        { id: "r5", title: "高" },
      ],
    };

    const low = scoreGeneric(quiz, [{ questionId: "q1", optionId: "a" }]);
    expect(low.resultId).toBe("r1");
    expect(low.overallScore).toBe(0);

    const high = scoreGeneric(quiz, [{ questionId: "q1", optionId: "d" }]);
    expect(high.resultId).toBe("r5");
    expect(high.overallScore).toBe(1);
  });

  it("level-band raw point bands still match achieved total (exam-style)", () => {
    const quiz = {
      scoring: {
        type: "level-band",
        dimensions: ["经学造诣", "文学素养", "史学见识"],
        bands: [
          { resultId: "r0", rank: 0, min: 0, max: 2 },
          { resultId: "r1", rank: 1, min: 3, max: 3 },
        ],
      },
      questions: [
        {
          id: "q1",
          options: [
            { id: "w", scores: {} },
            { id: "c", scores: { 经学造诣: 1, 文学素养: 1, 史学见识: 1 } },
          ],
        },
      ],
      results: [{ id: "r0", title: "低" }, { id: "r1", title: "高" }],
    };

    const wrong = scoreGeneric(quiz, [{ questionId: "q1", optionId: "w" }]);
    expect(wrong.resultId).toBe("r0");

    const right = scoreGeneric(quiz, [{ questionId: "q1", optionId: "c" }]);
    expect(right.resultId).toBe("r1");
    expect(right.overallScore).toBe(1);
  });
});
