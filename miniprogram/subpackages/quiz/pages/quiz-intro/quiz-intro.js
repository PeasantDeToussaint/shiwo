const { getQuizById } = require("../../utils/quizStore");
const { resolveQuiz } = require("../../utils/cloudQuizLoader");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");
const { resolveCloudImageSrc, downloadCloudImageSrc } = require("../../../../utils/resolveCloudImage");

Page({
  data: {
    quiz: null,
    heroPainting: "",
    questionCount: 0,
    estimatedMinutes: 0,
    pageThemeStyle: "",
    mounted: false,
    statusBarHeight: 0,
    safeAreaBottom: 0,
    heroPaintingDisplay: "",
    loading: false,
  },

  onLoad(options) {
    const info = wx.getWindowInfo();
    const safeAreaBottom = info.screenHeight - (info.safeArea ? info.safeArea.bottom : info.screenHeight);
    const { quizId } = options;
    this._heroHint = options.hero ? decodeURIComponent(options.hero) : "";
    this.setData({ statusBarHeight: info.statusBarHeight, safeAreaBottom, loading: true });

    resolveQuiz(quizId, getQuizById).then(({ quiz }) => {
      this._applyQuiz(quiz);
    }).catch((e) => {
      console.error("[quiz-intro] failed to load quiz:", e);
      wx.showToast({ title: "测验暂不可用", icon: "none", duration: 1500 });
      setTimeout(() => wx.navigateBack(), 1200);
    });
  },

  _applyQuiz(quiz) {
    const theme = resolveTheme({ themeKey: quiz.themeKey || "default" });
    const questions = quiz.questions || [];
    const heroPainting =
      (questions[0] && questions[0].painting) ||
      quiz.introPainting ||
      quiz.bgImage ||
      this._heroHint ||
      "";
    const questionCount = questions.length;
    const estimatedMinutes = quiz.estimatedMinutes || Math.ceil(questionCount * 0.3);

    this.setData({
      quiz,
      heroPainting,
      questionCount,
      estimatedMinutes,
      pageThemeStyle: toCssVarString(theme),
      loading: false,
    });

    if (!heroPainting) return;

    if (!heroPainting.startsWith("cloud://")) {
      this.setData({ heroPaintingDisplay: heroPainting });
      return;
    }

    resolveCloudImageSrc(heroPainting).then((url) => {
      if (url) this.setData({ heroPaintingDisplay: url });
    });
  },

  onReady() {
    setTimeout(() => this.setData({ mounted: true }), 60);
  },

  onShow() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage", "shareTimeline"],
    });
  },

  // Fires if the CDN URL gets a 403 (e.g. in devtools).
  // Downloads the file locally — always works but takes a few seconds.
  onPaintingError() {
    const { heroPainting } = this.data;
    if (!heroPainting) return;
    downloadCloudImageSrc(heroPainting).then((path) => {
      if (path) this.setData({ heroPaintingDisplay: path });
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onStartQuiz() {
    const { quiz } = this.data;
    const page = quiz.questionPage || `/subpackages/quiz/pages/generic-question/generic-question`;
    wx.redirectTo({ url: `${page}?quizId=${quiz.id}` });
  },

  onShareAppMessage() {
    const { quiz } = this.data;
    return {
      title: quiz
        ? `${quiz.title} — ${quiz.subtitle || "MYTYPE"}`
        : "MYTYPE · 在文学、历史、艺术中寻找自己",
      path: quiz
        ? `/subpackages/quiz/pages/quiz-intro/quiz-intro?quizId=${quiz.id}`
        : "/pages/home/home",
      imageUrl: this.data.heroPaintingDisplay || "",
    };
  },

  onShareTimeline() {
    const { quiz } = this.data;
    return {
      title: quiz
        ? `${quiz.title} · MYTYPE`
        : "MYTYPE · 在文学、历史、艺术中寻找自己",
      query: quiz ? `quizId=${quiz.id}` : "",
    };
  },
});
