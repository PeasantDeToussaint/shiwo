const { getQuizById } = require("../../utils/quizStore");
const { resolveQuiz } = require("../../utils/cloudQuizLoader");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");

const LOW_CONFIDENCE_MSG =
  "心无挂碍，处处皆是道场。\n\n你的答案均匀分布在十五座山门之间，说明此刻你的心如水——不偏执于某一处，也不拒绝任何一处。随缘不是将就，是没有执念。\n\n从最近的那座寺庙开始吧。";

Page({
  data: {
    quiz: null,
    result: null,
    subTempleResult: null,
    isLowConfidence: false,
    lowConfidenceMsg: "",
    confidence: 0,
    pageThemeStyle: "",
    mounted: false,
    statusBarHeight: 0,
  },

  _shareOptions: null,

  onLoad(options) {
    this._shareOptions = options;
    const { quizId, resultId, subTempleId, isLowConfidence, confidence } = options;
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });

    resolveQuiz(quizId, getQuizById).then(({ quiz }) => {
      const theme = resolveTheme({ themeKey: quiz.themeKey });
      const result = quiz.results.find((r) => r.id === resultId) || quiz.results[0];
      const subTempleResult = subTempleId
        ? (quiz.results.find((r) => r.id === subTempleId) || null)
        : null;

      this.setData({
        quiz, result, subTempleResult,
        isLowConfidence: isLowConfidence === "1",
        lowConfidenceMsg: isLowConfidence === "1" ? LOW_CONFIDENCE_MSG : "",
        confidence: parseInt(confidence, 10) || 0,
        pageThemeStyle: toCssVarString(theme),
      });
    }).catch((e) => {
      console.error("[temple-result] load failed:", e);
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

  onRetake() {
    wx.navigateBack({ delta: 1 });
  },

  onBackHome() {
    wx.navigateBack({ delta: 10 });
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

  onShareAppMessage() {
    const { result } = this.data;
    const o = this._shareOptions || {};
    return {
      title: result
        ? `我与「${result.title}」最有缘 — MYTYPE寺庙缘分`
        : "MYTYPE · 你的气场，与哪座古刹最相应？",
      path: `/subpackages/quiz/pages/temple-result/temple-result?quizId=${o.quizId}&resultId=${o.resultId}&confidence=${o.confidence}`,
    };
  },

  onShareTimeline() {
    const { result } = this.data;
    const o = this._shareOptions || {};
    return {
      title: result
        ? `我与「${result.title}」最有缘 · MYTYPE寺庙缘分`
        : "MYTYPE · 寺庙缘分测试",
      query: `quizId=${o.quizId}&resultId=${o.resultId}`,
    };
  },
});
