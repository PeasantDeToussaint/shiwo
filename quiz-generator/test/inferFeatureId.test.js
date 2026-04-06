const { inferFeatureId } = require("../lib/assemble");

describe("inferFeatureId", () => {
  const o = (fields) => ({ architectureResultType: "abstract_psychology", ...fields });

  it("classifies MBTI as classics", () => {
    expect(inferFeatureId(o({ title: "MBTI 十六型人格" }))).toBe("classics");
  });

  it("classifies festival copy as festival", () => {
    expect(inferFeatureId(o({ title: "春节你会怎么选", eyebrow: "节日专题" }))).toBe("festival");
  });

  it("classifies dialect as lifestyle (no city bucket)", () => {
    expect(inferFeatureId(o({ title: "你的方言气质", id: "dialect-x" }))).toBe("lifestyle");
  });

  it("classifies workplace as career", () => {
    expect(inferFeatureId(o({ title: "职场沟通风格测验", description: "同事与领导" }))).toBe("career");
  });

  it("classifies cognition keywords before broad psychology", () => {
    expect(inferFeatureId(o({ title: "决策与直觉", subtitle: "思维倾向" }))).toBe("cognition");
  });

  it("classifies romance as relationship", () => {
    expect(inferFeatureId(o({ title: "浪漫场景偏好测验", eyebrow: "浪漫场景原型" }))).toBe("relationship");
  });

  it("classifies known IP slug as ip", () => {
    expect(inferFeatureId(o({ id: "warcraft-race-test", title: "艾泽拉斯种族" }))).toBe("ip");
  });

  it("classifies myth/tarot as archetype", () => {
    expect(inferFeatureId(o({ title: "你是哪种神话原型", description: "塔罗与图腾" }))).toBe("archetype");
  });

  it("classifies Tang poet as history before literary aesthetics", () => {
    expect(inferFeatureId(o({
      title: "你和哪位唐朝诗人气质相符",
      architectureResultType: "figure",
    }))).toBe("history");
  });

  it("classifies perfume as aesthetics", () => {
    expect(inferFeatureId(o({ title: "香水人格", eyebrow: "嗅觉审美" }))).toBe("aesthetics");
  });

  it("classifies pet as lifestyle", () => {
    expect(inferFeatureId(o({ title: "你适合养什么宠物" }))).toBe("lifestyle");
  });

  it("uses figure fallback to history when no keyword matches", () => {
    expect(inferFeatureId(o({ title: "某某测验", architectureResultType: "figure" }))).toBe("history");
  });

  it("uses item fallback to lifestyle", () => {
    expect(inferFeatureId(o({ title: "某某测验", architectureResultType: "item" }))).toBe("lifestyle");
  });

  it("maps architectureResultType scene to relationship", () => {
    expect(inferFeatureId({ architectureResultType: "scene", title: "any" })).toBe("relationship");
  });

  it("maps architectureResultType band to psychology", () => {
    expect(inferFeatureId({ architectureResultType: "band", title: "any" })).toBe("psychology");
  });

  it("maps architectureResultType fictional_figure to ip", () => {
    expect(inferFeatureId({ architectureResultType: "fictional_figure", title: "any" })).toBe("ip");
  });

  it("maps architectureResultType behavior_pattern to relationship", () => {
    expect(inferFeatureId({ architectureResultType: "behavior_pattern", title: "any" })).toBe("relationship");
  });

  it("maps architectureResultType tier_level to psychology", () => {
    expect(inferFeatureId({ architectureResultType: "tier_level", title: "any" })).toBe("psychology");
  });

  it("maps organization_brand with workplace copy to career", () => {
    expect(inferFeatureId({
      architectureResultType: "organization_brand",
      title: "你的团队文化像哪家大厂",
      description: "企业文化与组织架构",
    })).toBe("career");
  });
});
