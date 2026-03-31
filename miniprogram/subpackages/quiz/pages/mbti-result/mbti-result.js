const { fetchCloudQuiz } = require("../../utils/cloudQuizLoader");

const MBTI_DIMS = [
  { key: "E", posLabel: "外向", negLabel: "内向", posEn: "Extraverted", negEn: "Introverted" },
  { key: "S", posLabel: "实感", negLabel: "直觉", posEn: "Observant",   negEn: "Intuitive"   },
  { key: "T", posLabel: "思考", negLabel: "情感", posEn: "Thinking",    negEn: "Feeling"     },
  { key: "J", posLabel: "判断", negLabel: "知觉", posEn: "Judging",     negEn: "Prospecting" },
];

Page({
  data: {
    quiz:   null,
    result: null,
    dimBars: [],
    portraitParagraphs:   [],
    romanticParagraphs:   [],
    friendshipsParagraphs:[],
    parenthoodParagraphs: [],
    careerParagraphs:     [],
    workplaceParagraphs:  [],
    loading: true,
    mounted: false,
  },

  onLoad(options) {
    const { quizId, resultId } = options;
    this._shareOptions = options;

    const app = getApp();
    const pending = (app.globalData || {})._pendingResult || {};
    if (app.globalData) app.globalData._pendingResult = null;

    this._pendingNormalized = pending.normalized || null;
    const urlScores = options.sc ? this._decodeScores(options.sc) : null;

    fetchCloudQuiz(quizId).then((quiz) => {
      const result = (quiz.results || []).find(r => r.id === resultId) || quiz.results[0];
      const normalizedSource = pending.normalized || urlScores || result.dimension_profile || null;

      this.setData({
        quiz,
        result,
        dimBars:               this._buildDimBars(normalizedSource),
        portraitParagraphs:    this._splitParagraphs(result.portrait),
        romanticParagraphs:    this._splitParagraphs(result.romanticRelationships),
        friendshipsParagraphs: this._splitParagraphs(result.friendships),
        parenthoodParagraphs:  this._splitParagraphs(result.parenthood),
        careerParagraphs:      this._splitParagraphs(result.careerPaths),
        workplaceParagraphs:   this._splitParagraphs(result.workplaceHabits),
        loading: false,
      });
    }).catch(e => {
      console.error("[mbti-result] load failed:", e);
      wx.showToast({ title: "结果加载失败", icon: "none" });
      this.setData({ loading: false });
    });
  },

  onReady() {
    setTimeout(() => this.setData({ mounted: true }), 120);
  },

  _splitParagraphs(text) {
    if (!text) return [];
    return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  },

  _buildDimBars(normalized) {
    return MBTI_DIMS.map(({ key, posLabel, posEn, negLabel, negEn }) => {
      const posVal = normalized ? Math.max(0, Math.min(1, normalized[key] || 0)) : 0.5;
      const posPct = Math.round(posVal * 100);
      const negPct = 100 - posPct;
      const dominant = posPct >= 50 ? "pos" : "neg";
      return {
        posLabel, posEn, negLabel, negEn,
        posPct, negPct,
        dominant,
        fillPct:        dominant === "pos" ? posPct : negPct,
        dominantLabel:  dominant === "pos" ? posLabel : negLabel,
        dominantPct:    dominant === "pos" ? posPct : negPct,
      };
    });
  },

  _decodeScores(sc) {
    try {
      const normalized = {};
      sc.split(",").forEach(part => {
        const idx = part.lastIndexOf(":");
        if (idx < 1) return;
        const dim = decodeURIComponent(part.slice(0, idx));
        const pct  = parseInt(part.slice(idx + 1), 10);
        if (dim && !isNaN(pct)) normalized[dim] = pct / 100;
      });
      return Object.keys(normalized).length ? normalized : null;
    } catch (_) { return null; }
  },

  _encodeScores() {
    if (!this._pendingNormalized) return "";
    return MBTI_DIMS.map(d => `${d.key}:${Math.round((this._pendingNormalized[d.key] || 0) * 100)}`).join(",");
  },

  onShow() {
    wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage", "shareTimeline"] });
  },

  onRetake()   { wx.navigateBack({ delta: 1  }); },
  onBackHome() { wx.navigateBack({ delta: 10 }); },

  onShareAppMessage() {
    const { quiz, result } = this.data;
    const o  = this._shareOptions || {};
    const sc = this._encodeScores();
    const scParam = sc ? `&sc=${sc}` : "";
    return {
      title: result && quiz
        ? `我在「${quiz.title}」测出了 ${result.typeCode} ${result.title}，你是哪种？`
        : "MYTYPE · 十六人格测试",
      path: `/subpackages/quiz/pages/mbti-result/mbti-result?quizId=${o.quizId}&resultId=${o.resultId}${scParam}`,
    };
  },

  onShareTimeline() {
    const { result } = this.data;
    const o = this._shareOptions || {};
    const sc = this._encodeScores();
    return {
      title: result ? `${result.typeCode} ${result.title} · MYTYPE` : "MYTYPE",
      query: `quizId=${o.quizId}&resultId=${o.resultId}${sc ? `&sc=${sc}` : ""}`,
    };
  },
});
