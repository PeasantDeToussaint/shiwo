const { fetchCloudQuiz } = require("../../utils/cloudQuizLoader");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");

Page({
  data: {
    quiz: null,
    result: null,
    pageThemeStyle: "",
    mounted: false,
    loading: true,
  },

  onLoad(options) {
    const { quizId, resultId } = options;
    this._shareOptions = options;

    fetchCloudQuiz(quizId).then((quiz) => {
      const result = (quiz.results || []).find((r) => r.id === resultId) || quiz.results[0];
      const theme = resolveTheme({ themeKey: quiz.themeKey || "default" });

      this.setData({
        quiz,
        result,
        pageThemeStyle: toCssVarString(theme),
        loading: false,
      });
    }).catch((e) => {
      console.error("[perfume-result] load failed:", e);
      wx.showToast({ title: "结果加载失败", icon: "none" });
      this.setData({ loading: false });
    });
  },

  onReady() {
    setTimeout(() => this.setData({ mounted: true }), 80);
  },

  onShow() {
    wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage", "shareTimeline"] });
  },

  onRetake() {
    wx.navigateBack({ delta: 1 });
  },

  onBackHome() {
    wx.navigateBack({ delta: 10 });
  },

  onShareAppMessage() {
    const { quiz, result } = this.data;
    const o = this._shareOptions || {};
    const tokenSuffix = result && result.token ? `·${result.token}` : "";
    return {
      title: result && quiz
        ? `我在「${quiz.title}」里测出了${result.title}${tokenSuffix}，你是哪种？`
        : "MYTYPE · 在历史与文学中，找到你自己",
      path: `/subpackages/quiz/pages/perfume-result/perfume-result?quizId=${o.quizId}&resultId=${o.resultId}`,
    };
  },

  onShareTimeline() {
    const { quiz, result } = this.data;
    const o = this._shareOptions || {};
    return {
      title: result && quiz ? `${result.title} · ${quiz.title} · MYTYPE` : "MYTYPE",
      query: `quizId=${o.quizId}&resultId=${o.resultId}`,
    };
  },
});
