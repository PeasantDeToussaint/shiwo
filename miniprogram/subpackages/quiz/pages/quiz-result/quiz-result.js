const { getQuizById } = require("../../../../utils/quizStore");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");

Page({
  data: {
    quiz: null,
    result: null,
    dims: [],
    pageThemeStyle: "",
    mounted: false,
    showCard: false,
    savingCard: false,
  },

  onLoad(options) {
    const { quizId, resultId, breakdown, ranked } = options;
    const quiz = getQuizById(quizId);
    const theme = resolveTheme({ themeKey: quiz.themeKey });
    const breakdownObj = breakdown ? JSON.parse(decodeURIComponent(breakdown)) : {};
    const rankedDimensions = ranked ? JSON.parse(decodeURIComponent(ranked)) : [];
    const result = quiz.results.find((r) => r.id === resultId) || quiz.results[0];
    const totalScore = rankedDimensions.reduce((s, d) => s + d.score, 0) || 1;

    const dims = quiz.dimensions.map((dim) => {
      const rd = rankedDimensions.find((r) => r.id === dim.id) || { score: 0 };
      return { ...dim, score: rd.score, percent: Math.round((rd.score / totalScore) * 100) };
    });

    this.setData({ quiz, result, dims, pageThemeStyle: toCssVarString(theme) });
  },

  onReady() {
    setTimeout(() => this.setData({ mounted: true }), 60);
  },

  onRetake() {
    // Navigate back to quiz-intro (quiz-question was redirectTo'd away, so
    // delta: 1 lands on quiz-intro without rebuilding the stack).
    wx.navigateBack({ delta: 1 });
  },

  onBackHome() {
    wx.reLaunch({ url: "/pages/home/home" });
  },

  // ── Identity Card ──────────────────────────────────────────
  onGenerateCard() {
    this.setData({ showCard: true });
  },

  onCloseCard() {
    this.setData({ showCard: false });
  },

  onSaveCard() {
    if (this.data.savingCard) return;
    this.setData({ savingCard: true });

    wx.createSelectorQuery()
      .select("#identity-card-snap")
      .node()
      .exec((res) => {
        const snap = res[0]?.node;
        if (!snap) {
          this.setData({ savingCard: false });
          return;
        }
        snap.takeSnapshot({
          type: "arraybuffer",
          format: "png",
          success: (r) => {
            const path = `${wx.env.USER_DATA_PATH}/mytype-${Date.now()}.png`;
            wx.getFileSystemManager().writeFile({
              filePath: path,
              data: r.data,
              encoding: "binary",
              success: () => {
                wx.saveImageToPhotosAlbum({
                  filePath: path,
                  success: () => {
                    wx.showToast({ title: "已保存至相册", icon: "success" });
                    this.setData({ savingCard: false });
                  },
                  fail: () => {
                    wx.showToast({ title: "请允许访问相册", icon: "none" });
                    this.setData({ savingCard: false });
                  },
                });
              },
              fail: () => this.setData({ savingCard: false }),
            });
          },
          fail: () => this.setData({ savingCard: false }),
        });
      });
  },
});
