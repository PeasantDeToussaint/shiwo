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
});
