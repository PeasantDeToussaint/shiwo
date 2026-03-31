const { getQuizById } = require("../../utils/quizStore");
const { resolveQuiz } = require("../../utils/cloudQuizLoader");
const { scoreDialect } = require("../../utils/scoreDialect");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");
const { saveQuizRecord } = require("../../../../utils/userService");

const CATEGORIES = ["亲属称谓", "动植物", "食物", "日常器物", "身体部位", "自然现象", "时间"];

Page({
  data: {
    quiz: null,
    questions: [],
    currentIndex: 0,
    totalCount: 0,
    currentQuestion: null,
    currentCategory: "",
    progress: 0,
    answers: {},
    selectedOptionId: null,
    confirming: false,
    transitioning: false,
    cardEntering: false,
    pageThemeStyle: "",
    statusBarHeight: 0,
  },

  _advanceTimer: null,
  _transitionTimer: null,
  _enterTimer: null,

  onLoad(options) {
    const { quizId } = options;
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });

    resolveQuiz(quizId, getQuizById).then(({ quiz }) => {
      const theme = resolveTheme({ themeKey: quiz.themeKey });
      const questions = quiz.questions || [];
      this.setData({
        quiz,
        questions,
        currentIndex: 0,
        totalCount: questions.length,
        currentQuestion: questions[0] || null,
        currentCategory: questions[0] ? questions[0].source : "",
        progress: questions.length > 0 ? (1 / questions.length) * 100 : 0,
        cardEntering: true,
        pageThemeStyle: toCssVarString(theme),
      });
      this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 350);
    }).catch((e) => {
      console.error("[dialect-question] load failed:", e);
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    });
  },

  onUnload() {
    clearTimeout(this._advanceTimer);
    clearTimeout(this._transitionTimer);
    clearTimeout(this._enterTimer);
  },

  onSelectOption(event) {
    if (this.data.confirming) return;
    const { optionId } = event.currentTarget.dataset;
    const { currentQuestion, answers, currentIndex, questions, quiz } = this.data;
    if (!currentQuestion) return;

    if (this.data.cardEntering) clearTimeout(this._enterTimer);

    const newAnswers = { ...answers, [currentQuestion.id]: optionId };
    this.setData({ selectedOptionId: optionId, confirming: true, cardEntering: false, answers: newAnswers });

    // Wait 500ms so user sees the selected state, then advance
    this._advanceTimer = setTimeout(() => {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= questions.length) {
        this._finishQuiz(newAnswers);
      } else {
        this._goToIndex(nextIndex, newAnswers);
      }
    }, 500);
  },

  onGoBack() {
    const { currentIndex, questions, answers, confirming } = this.data;
    if (confirming) {
      clearTimeout(this._advanceTimer);
      this.setData({ confirming: false, selectedOptionId: null });
      return;
    }
    if (currentIndex <= 0) { wx.navigateBack(); return; }
    clearTimeout(this._advanceTimer);
    clearTimeout(this._transitionTimer);

    const prevIndex = currentIndex - 1;
    const prevQuestion = questions[prevIndex];
    const prevSelected = answers[prevQuestion.id] || null;

    this.setData({ transitioning: true });
    this._transitionTimer = setTimeout(() => {
      this.setData({
        currentIndex: prevIndex,
        currentQuestion: prevQuestion,
        currentCategory: prevQuestion.source || "",
        progress: ((prevIndex + 1) / questions.length) * 100,
        selectedOptionId: prevSelected,
        confirming: false,
        transitioning: false,
        cardEntering: true,
      });
      this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 350);
    }, 220);
  },

  _goToIndex(nextIndex, newAnswers) {
    const { questions } = this.data;
    this.setData({ transitioning: true });
    this._transitionTimer = setTimeout(() => {
      const q = questions[nextIndex];
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: q,
        currentCategory: q ? q.source : "",
        progress: ((nextIndex + 1) / questions.length) * 100,
        answers: newAnswers,
        selectedOptionId: null,
        confirming: false,
        transitioning: false,
        cardEntering: true,
      });
      this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 350);
    }, 260);
  },

  _finishQuiz(answers) {
    const { quiz } = this.data;
    const scored = scoreDialect(quiz, answers);
    const { resultId, subRegionId, confidence, ranked, matchedWords } = scored;

    const bestResult = (quiz.results || []).find((r) => r.id === resultId);
    saveQuizRecord({
      quizId: quiz.id,
      quizTitle: quiz.title || "",
      featureId: quiz.featureId || "",
      resultId,
      resultTitle: bestResult ? bestResult.title : "",
      themeKey: quiz.themeKey || "default",
      resultPage: quiz.resultPage || "",
    });

    wx.redirectTo({
      url: `${quiz.resultPage}` +
        `?quizId=${quiz.id}` +
        `&resultId=${resultId}` +
        `&subRegionId=${subRegionId || ""}` +
        `&confidence=${confidence || 0}` +
        `&matchedWords=${encodeURIComponent(JSON.stringify(matchedWords || []))}` +
        `&ranked=${encodeURIComponent(JSON.stringify((ranked || []).slice(0, 5)))}`,
    });
  },
});
