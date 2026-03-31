const { getQuizById } = require("../../utils/quizStore");
const { resolveQuiz } = require("../../utils/cloudQuizLoader");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");
const { resolveCloudImageSrc, downloadCloudImageSrc } = require("../../../../utils/resolveCloudImage");

Page({
  data: {
    quiz: null,
    result: null,
    subTypeResult: null,
    hasTension: false,
    rankedDimensions: [],
    pageThemeStyle: "",
    mounted: false,
    showCard: false,
    savingCard: false,
    takeawayLine: "",
    topTraits: [],
    cardPortrait: "",
    paintingDisplay: "",
  },

  _shareOptions: null,

  onLoad(options) {
    this._shareOptions = options;
    const { quizId, resultId, subTypeId, hasTension, ranked } = options;

    resolveQuiz(quizId, getQuizById).then(({ quiz }) => {
      const theme = resolveTheme({ themeKey: quiz.themeKey });
      const result = quiz.results.find((r) => r.id === resultId) || quiz.results[0];
      const subTypeResult = subTypeId
        ? (quiz.results.find((r) => r.id === subTypeId) || null)
        : null;

      const rankedDimensions = ranked ? JSON.parse(decodeURIComponent(ranked)) : [];

      const toFirstSentence = (text = "") => {
        const t = String(text || "").trim();
        if (!t) return "";
        const m = t.match(/^[^。！？!?]+[。！？!?]?/);
        return m ? m[0] : t;
      };
      const toTwoSentences = (text = "") => {
        const t = String(text || "").trim();
        const matches = t.match(/[^。！？!?]+[。！？!?]/g);
        if (!matches) return t.slice(0, 60);
        return matches.slice(0, 2).join("");
      };

      const cardPortrait = toTwoSentences(result.portrait);
      const topTraits = rankedDimensions.slice(0, 3).map((d) => {
        const matched = quiz.results.find((r) => r.id === d.id);
        return { id: d.id, label: String(matched ? matched.title : d.id).replace(/型$/, ""), score: d.score };
      });
      const takeawayLine = result.subtitle || toFirstSentence(result.temperament) || toFirstSentence(result.portrait);

      this.setData({
        quiz, result, subTypeResult,
        hasTension: hasTension === "1",
        rankedDimensions, takeawayLine, topTraits, cardPortrait,
        pageThemeStyle: toCssVarString(theme),
      });

      if (result.painting) {
        const rp = result.painting;
        if (!rp.startsWith("cloud://")) {
          this.setData({ paintingDisplay: rp });
        } else {
          resolveCloudImageSrc(rp).then((url) => { this.setData({ paintingDisplay: url }); });
        }
      }
    }).catch((e) => {
      console.error("[rc-result] load failed:", e);
      wx.showToast({ title: "结果加载失败", icon: "none" });
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

  onShareTap() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage", "shareTimeline"],
      success: () => {
        wx.showToast({
          title: "点击右上角 ··· 分享",
          icon: "none",
          duration: 2000,
        });
      },
    });
  },

  onPaintingError() {
    const rp = this.data.result && this.data.result.painting;
    if (!rp) return;
    downloadCloudImageSrc(rp).then((path) => {
      if (path) this.setData({ paintingDisplay: path });
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
    const query = [
      `quizId=${o.quizId || "red-chambers"}`,
      `resultId=${o.resultId || ""}`,
      o.subTypeId   ? `subTypeId=${o.subTypeId}`     : "",
      o.hasTension  ? `hasTension=${o.hasTension}`   : "",
    ].filter(Boolean).join("&");

    return {
      title: result
        ? `我是「${result.title}」型 — ${result.subtitle || "红楼梦气质画像"}`
        : "红楼梦气质画像 · 你是哪位红楼女子？",
      path: `/subpackages/quiz/pages/rc-result/rc-result?${query}`,
      imageUrl: this.data.paintingDisplay || "",
    };
  },

  onShareTimeline() {
    const { result } = this.data;
    const o = this._shareOptions || {};
    const query = [
      `quizId=${o.quizId || "red-chambers"}`,
      `resultId=${o.resultId || ""}`,
    ].filter(Boolean).join("&");

    return {
      title: result
        ? `我是「${result.title}」型 · MYTYPE红楼梦气质画像`
        : "MYTYPE · 红楼梦气质画像",
      query,
    };
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

    const done = (ok, msg) => {
      this.setData({ savingCard: false });
      if (msg) wx.showToast({ title: msg, icon: ok ? "success" : "none", duration: 2000 });
    };

    const doSnapshot = () => {
      this.createSelectorQuery()
        .select("#rc-card-snap")
        .node()
        .exec((res) => {
          const snap = res && res[0] && res[0].node;
          if (!snap || typeof snap.takeSnapshot !== "function") {
            done(false, "截图组件不可用，请在最新版微信中重试");
            return;
          }
          snap.takeSnapshot({
            type: "arraybuffer",
            format: "png",
            success: (r) => {
              const path = `${wx.env.USER_DATA_PATH}/mytype-rc-${Date.now()}.png`;
              wx.getFileSystemManager().writeFile({
                filePath: path,
                data: r.data,
                encoding: "binary",
                success: () => {
                  wx.saveImageToPhotosAlbum({
                    filePath: path,
                    success: () => done(true, "已保存至相册"),
                    fail: () => {
                      wx.openSetting({
                        success: (s) => {
                          if (s.authSetting["scope.writePhotosAlbum"]) {
                            wx.saveImageToPhotosAlbum({
                              filePath: path,
                              success: () => done(true, "已保存至相册"),
                              fail: () => done(false, "保存失败，请重试"),
                            });
                          } else {
                            done(false, "需要相册权限才能保存");
                          }
                        },
                        fail: () => done(false, "请在设置中允许访问相册"),
                      });
                    },
                  });
                },
                fail: () => done(false, "写入文件失败"),
              });
            },
            fail: () => done(false, "截图失败，请重试"),
          });
        });
    };

    wx.authorize({
      scope: "scope.writePhotosAlbum",
      success: doSnapshot,
      fail: () => {
        wx.openSetting({
          success: (s) => {
            if (s.authSetting["scope.writePhotosAlbum"]) {
              doSnapshot();
            } else {
              done(false, "需要相册权限才能保存");
            }
          },
          fail: () => done(false, "请在设置中允许访问相册"),
        });
      },
    });
  },
});
