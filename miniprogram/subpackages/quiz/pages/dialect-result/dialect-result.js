const { getQuizById } = require("../../utils/quizStore");
const { resolveQuiz } = require("../../utils/cloudQuizLoader");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");

Page({
  data: {
    quiz: null,
    result: null,
    subRegionResult: null,
    confidence: 0,
    matchedWords: [],
    ranked: [],
    provinceStr: "",
    pageThemeStyle: "",
    mounted: false,
    statusBarHeight: 0,
  },

  _shareOptions: null,

  onLoad(options) {
    this._shareOptions = options;
    const { quizId, resultId, subRegionId, confidence, matchedWords, ranked } = options;
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });

    resolveQuiz(quizId, getQuizById).then(({ quiz }) => {
      const theme = resolveTheme({ themeKey: quiz.themeKey });
      const result = quiz.results.find((r) => r.id === resultId) || quiz.results[0];
      const subRegionResult = subRegionId
        ? (quiz.results.find((r) => r.id === subRegionId) || null)
        : null;

      let parsedWords = [];
      let parsedRanked = [];
      try { parsedWords = JSON.parse(decodeURIComponent(matchedWords || "[]")); } catch (e) {}
      try { parsedRanked = JSON.parse(decodeURIComponent(ranked || "[]")); } catch (e) {}

      const conf = parseInt(confidence, 10) || 0;
      const confidenceLabel = conf >= 35 ? "特征集中" : conf >= 20 ? "特征较分散" : "特征散乱";
      const confidenceNote = conf < 20
        ? "答题词汇分布分散，可能处于方言过渡带，或受普通话影响较深。"
        : "";

      this.setData({
        quiz, result, subRegionResult,
        confidence: conf, confidenceLabel, confidenceNote,
        matchedWords: parsedWords, ranked: parsedRanked,
        provinceStr: (result.provinces || []).join(" · "),
        pageThemeStyle: toCssVarString(theme),
      });
    }).catch((e) => {
      console.error("[dialect-result] load failed:", e);
      wx.showToast({ title: "结果加载失败", icon: "none" });
    });
  },

  onReady() {
    setTimeout(() => this.setData({ mounted: true }), 80);
  },

  onShow() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage", "shareTimeline"],
    });
  },

  onShareTap() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage", "shareTimeline"],
      success: () => {
        wx.showToast({ title: "点击右上角 ··· 分享", icon: "none", duration: 2000 });
      },
    });
  },

  onRetake() {
    wx.navigateBack({ delta: 1 });
  },

  onBackHome() {
    wx.navigateBack({ delta: 10 });
  },

  onShareAppMessage() {
    const { result } = this.data;
    const o = this._shareOptions || {};
    return {
      title: result
        ? `我的词汇指向「${result.title}」— MYTYPE方言溯源`
        : "MYTYPE · 你的日常用词，藏着你来自哪里",
      path: `/subpackages/quiz/pages/dialect-result/dialect-result?quizId=${o.quizId}&resultId=${o.resultId}&confidence=${o.confidence}`,
    };
  },

  onShareTimeline() {
    const { result } = this.data;
    const o = this._shareOptions || {};
    return {
      title: result
        ? `我是「${result.title}」词汇特征 · MYTYPE方言溯源`
        : "MYTYPE · 方言溯源测试",
      query: `quizId=${o.quizId}&resultId=${o.resultId}`,
    };
  },
});
