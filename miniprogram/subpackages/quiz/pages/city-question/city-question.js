const { getQuizById }               = require("../../utils/quizStore");
const { resolveQuiz }               = require("../../utils/cloudQuizLoader");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");
const scoreCity     = require("../../../../utils/scoreCity");
const cityFull      = require("../../data/city-full");
const cityData      = require("../../data/city-data");
const { saveQuizRecord }            = require("../../../../utils/userService");

const PHASE_LABELS = {
  about_you:        "关于你",
  hard_constraints: "我的底线",
  soft_prefs:       "我的偏好",
};

Page({
  data: {
    statusBarHeight:   0,
    pageThemeStyle:    "",
    questions:         [],
    currentIndex:      0,
    totalCount:        0,
    currentQuestion:   null,
    currentPhaseLabel: "",
    progress:          0,

    // choice mode
    selectedOptionId:  null,
    confirming:        false,
    reaction:          "",
    transitioning:     false,
    cardEntering:      false,
    scrollIntoViewId:  "cq-top",

    // province mode
    provinces:         [],
    provinceGroups:    [],
    selectedProvince:  null,
    provinceConfirmed: false,

    answers:           {},
  },

  onLoad(options) {
    const { quizId } = options;

    resolveQuiz(quizId, getQuizById).then(({ quiz }) => {
    const theme = resolveTheme({ themeKey: quiz.themeKey });
    const questions = quiz.questions || [];
    const rawProvinces = quiz.provinces || [];

    // Group provinces by geographic region for cleaner picker UX
    const REGION_ORDER = [
      { label: "华北 · 东北", ids: ["beijing", "tianjin", "hebei", "shanxi", "neimenggu", "liaoning", "jilin", "heilongjiang"] },
      { label: "华东", ids: ["shanghai", "jiangsu", "zhejiang", "anhui", "fujian", "jiangxi", "shandong"] },
      { label: "华中 · 华南", ids: ["henan", "hubei", "hunan", "guangdong", "guangxi", "hainan"] },
      { label: "西南", ids: ["chongqing", "sichuan", "guizhou", "yunnan", "xizang"] },
      { label: "西北", ids: ["shaanxi", "gansu", "qinghai", "ningxia", "xinjiang"] },
    ];
    const provMap = {};
    rawProvinces.forEach((p) => { provMap[p.id] = p; });
    const provinceGroups = REGION_ORDER.map((r) => ({
      label: r.label,
      provinces: r.ids.map((id) => provMap[id]).filter(Boolean),
    })).filter((g) => g.provinces.length);
    const provinces = rawProvinces;

    wx.getSystemInfo({
      success: (res) => {
        this.setData({
          statusBarHeight:   res.statusBarHeight || 44,
          pageThemeStyle:    toCssVarString(theme),
          questions,
          totalCount:        questions.length,
          currentIndex:      0,
          provinces,
          provinceGroups,
          answers:           {},
        });
        this._quiz = quiz;
        this._loadQuestion(0);
      },
    });
    }).catch((e) => {
      console.error("[city-question] load failed:", e);
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    });
  },

  _loadQuestion(idx) {
    const q = this.data.questions[idx];
    this.setData({
      currentQuestion:   q,
      currentPhaseLabel: PHASE_LABELS[q.phase] || q.phase,
      progress:          Math.round((idx / this.data.totalCount) * 100),
      selectedOptionId:  null,
      confirming:        false,
      reaction:          "",
      selectedProvince:  null,
      provinceConfirmed: false,
      scrollIntoViewId:  "cq-top",
      cardEntering:      true,
    });
    setTimeout(() => this.setData({ cardEntering: false }), 380);
  },

  // ── Choice mode ────────────────────────────────────────────────
  onSelectOption(e) {
    if (this.data.confirming) return;
    const optId = e.currentTarget.dataset.optionId;
    const opt = this.data.currentQuestion.options.find(o => o.id === optId);
    this.setData({
      selectedOptionId: optId,
      confirming:       true,
      reaction:         opt ? opt.reaction : "",
    });
  },

  onContinue() {
    const q = this.data.currentQuestion;
    const answers = Object.assign({}, this.data.answers, {
      [q.id]: this.data.selectedOptionId,
    });
    this._advance(answers);
  },

  // ── Province mode ───────────────────────────────────────────────
  onSelectProvince(e) {
    const provinceId = e.currentTarget.dataset.provinceId;
    this.setData({ selectedProvince: provinceId });
  },

  onConfirmProvince() {
    if (!this.data.selectedProvince) return;
    const q = this.data.currentQuestion;
    const answers = Object.assign({}, this.data.answers, {
      [q.id]: this.data.selectedProvince,
    });
    this.setData({ provinceConfirmed: true });
    setTimeout(() => this._advance(answers), 300);
  },

  // ── Advance to next question or finish ─────────────────────────
  _advance(answers) {
    this.setData({ transitioning: true, answers });
    setTimeout(() => {
      const next = this.data.currentIndex + 1;
      this.setData({ transitioning: false, currentIndex: next });
      if (next >= this.data.totalCount) {
        this._finishQuiz(answers);
      } else {
        this._loadQuestion(next);
      }
    }, 240);
  },

  _finishQuiz(answers) {
    const quiz = this._quiz;
    const top3 = scoreCity(cityFull, answers, cityData);
    const payload = JSON.stringify(top3);

    const topCity = top3 && top3[0];
    saveQuizRecord({
      quizId: quiz.id,
      quizTitle: quiz.title || "",
      featureId: quiz.featureId || "",
      resultId: topCity ? topCity.id : "",
      resultTitle: topCity ? topCity.name : "",
      themeKey: quiz.themeKey || "default",
      resultPage: "/subpackages/quiz/pages/city-result/city-result",
    });

    wx.navigateTo({
      url: `../city-result/city-result?quizId=${quiz.id}&results=${encodeURIComponent(payload)}`,
    });
  },

  onGoBack() {
    const idx = this.data.currentIndex;
    if (idx === 0) {
      wx.navigateBack();
      return;
    }
    this.setData({
      transitioning: true,
      confirming: false,
      selectedOptionId: null,
      reaction: "",
    });
    setTimeout(() => {
      this.setData({ transitioning: false, currentIndex: idx - 1 });
      this._loadQuestion(idx - 1);
    }, 200);
  },
});
