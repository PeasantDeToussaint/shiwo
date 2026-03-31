const { fetchCloudQuiz } = require("../../utils/cloudQuizLoader");
const { scoreGeneric } = require("../../utils/scoreGeneric");
const { computePhase1Branch } = require("../../utils/scoreTwoPhaseArchetype");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");
const { saveQuizRecord } = require("../../../../utils/userService");

Page({
  data: {
    quiz: null,
    questions: [],
    currentIndex: 0,
    totalCount: 0,
    currentQuestion: null,
    progress: 0,
    selectedOptionId: null,
    sliderValue: 50,
    sliderTouched: false,
    sliderHint: "",
    canConfirm: false,
    confirming: false,
    cardEntering: false,
    pageThemeStyle: "",
    statusBarHeight: 0,
    loading: true,
    showExitModal: false,
    // ── Group mode (5 questions per page, radio-circle UI) ──
    groupMode: false,
    groupSize: 5,
    groupIndex: 0,
    groupCount: 0,
    groupQuestions: [],   // current page's questions (each has .selectedOptionId)
    groupAnswers: {},     // { [questionId]: optionId }
    groupComplete: false, // all questions on this page answered
  },

  _answers: [],
  _advanceTimer: null,
  _enterTimer: null,
  _allQuestions: null,
  _phase2Injected: false,
  _startTime: null,

  _isSliderQuestion(question) {
    if (!question) return false;
    const type = question.type || question.interaction;
    return type === "likert-slider" || type === "slider-likert" || type === "slider";
  },

  _sliderHint(value) {
    if (value <= 20) return "非常不同意";
    if (value <= 40) return "不太同意";
    if (value < 60) return "中立";
    if (value < 80) return "比较同意";
    return "非常同意";
  },

  _resetInputForQuestion(question) {
    const isSlider = this._isSliderQuestion(question);
    const initialSlider = question && typeof question.defaultValue === "number"
      ? Math.max(0, Math.min(100, question.defaultValue))
      : 50;
    this.setData({
      selectedOptionId: null,
      sliderValue: initialSlider,
      sliderTouched: false,
      sliderHint: this._sliderHint(initialSlider),
      canConfirm: isSlider, // slider questions are ready to confirm at default value
    });
    return isSlider;
  },

  _isGroupMode(quiz) {
    if (!quiz || !quiz.scoring) return false;
    const { type, groupSize } = quiz.scoring;
    if (groupSize > 1) return true;
    return type === "big-five" || type === "mbti";
  },

  _makeGroupQuestions(questions, groupIdx, groupSize) {
    return questions
      .slice(groupIdx * groupSize, (groupIdx + 1) * groupSize)
      .map((q) => Object.assign({}, q, { selectedOptionId: null }));
  },

  onLoad(options) {
    const { quizId } = options;
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });
    this._startTime = Date.now();

    fetchCloudQuiz(quizId).then((quiz) => {
      const theme = resolveTheme({ themeKey: quiz.themeKey || "default" });
      const allQuestions = quiz.questions || [];

      // Two-phase quizzes: start with only phase-1 questions.
      const isTwoPhase = quiz.scoring && quiz.scoring.type === "two-phase-archetype";
      const questions = isTwoPhase
        ? allQuestions.filter((q) => q.phase === 1)
        : allQuestions;

      if (isTwoPhase) this._allQuestions = allQuestions;

      const isGroup = this._isGroupMode(quiz);

      if (isGroup) {
        const groupSize = (quiz.scoring && quiz.scoring.groupSize) || 5;
        const groupCount = Math.ceil(questions.length / groupSize);
        this.setData({
          quiz, questions, totalCount: questions.length,
          groupMode: true, groupSize, groupIndex: 0, groupCount,
          groupQuestions: this._makeGroupQuestions(questions, 0, groupSize),
          groupAnswers: {}, groupComplete: false,
          progress: (1 / groupCount) * 100,
          pageThemeStyle: toCssVarString(theme),
          loading: false,
        });
      } else {
        this.setData({
          quiz, questions, totalCount: questions.length,
          currentIndex: 0, currentQuestion: questions[0] || null,
          progress: questions.length > 0 ? (1 / questions.length) * 100 : 0,
          pageThemeStyle: toCssVarString(theme),
          cardEntering: true, loading: false,
        });
        this._resetInputForQuestion(questions[0] || null);
        this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 400);
      }
    }).catch((e) => {
      console.error("[generic-question] load failed:", e);
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
      this.setData({ loading: false });
    });
  },

  onSelectOption(e) {
    if (this.data.confirming) return;
    const { id } = e.currentTarget.dataset;
    this.setData({ selectedOptionId: id, canConfirm: true });
  },

  onSliderChanging(e) {
    if (this.data.confirming) return;
    const value = Number((e.detail || {}).value || 0);
    this.setData({
      sliderValue: value,
      sliderHint: this._sliderHint(value),
      sliderTouched: true,
      canConfirm: true,
    });
  },

  onSliderChange(e) {
    if (this.data.confirming) return;
    const value = Number((e.detail || {}).value || 0);
    this.setData({
      sliderValue: value,
      sliderHint: this._sliderHint(value),
      sliderTouched: true,
      canConfirm: true,
    });
  },

  // ── Group-mode handlers ────────────────────────────────────

  onGroupSelect(e) {
    const { qid, oid } = e.currentTarget.dataset;
    const groupAnswers = Object.assign({}, this.data.groupAnswers, { [qid]: oid });
    const groupQuestions = this.data.groupQuestions.map((q) =>
      q.id === qid ? Object.assign({}, q, { selectedOptionId: oid }) : q
    );
    const groupComplete = groupQuestions.every((q) => q.selectedOptionId);
    this.setData({ groupAnswers, groupQuestions, groupComplete });
  },

  onGroupConfirm() {
    if (!this.data.groupComplete) return;
    const { groupQuestions, groupAnswers, groupIndex, groupSize, groupCount, questions } = this.data;

    groupQuestions.forEach((q) => {
      const optionId = groupAnswers[q.id];
      if (optionId) this._answers.push({ questionId: q.id, optionId });
    });

    const nextIdx = groupIndex + 1;
    if (nextIdx >= groupCount) {
      this._finish();
      return;
    }

    this.setData({
      groupIndex: nextIdx,
      groupQuestions: this._makeGroupQuestions(questions, nextIdx, groupSize),
      groupAnswers: {}, groupComplete: false,
      progress: ((nextIdx + 1) / groupCount) * 100,
    });
  },

  // ── Single-question confirm ────────────────────────────────

  onConfirm() {
    const { selectedOptionId, sliderValue, sliderTouched, currentQuestion, confirming } = this.data;
    if (confirming) return;

    const isSlider = this._isSliderQuestion(currentQuestion);
    if (!isSlider && !selectedOptionId) return;

    this.setData({ confirming: true });

    if (isSlider) {
      this._answers.push({
        questionId: currentQuestion.id,
        sliderValue: Number(sliderValue),
      });
    } else {
      this._answers.push({
        questionId: currentQuestion.id,
        optionId: selectedOptionId,
      });
    }

    this._advanceTimer = setTimeout(() => this._advance(), 480);
  },

  _advance() {
    const { currentIndex, questions, quiz } = this.data;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      // Two-phase: after phase 1 ends, inject the winning branch's phase-2 questions
      const isTwoPhase = quiz.scoring && quiz.scoring.type === "two-phase-archetype";
      if (isTwoPhase && this._allQuestions && !this._phase2Injected) {
        this._phase2Injected = true;
        const phase1Answers = this._answers.filter((a) =>
          questions.some((q) => q.id === a.questionId)
        );
        const branch = computePhase1Branch(quiz, phase1Answers);
        const phase2Qs = this._allQuestions.filter(
          (q) => q.phase === 2 && q.branch === branch
        );
        if (phase2Qs.length) {
          const merged = [...questions, ...phase2Qs];
          this.setData({
            questions: merged,
            totalCount: merged.length,
            currentIndex: nextIndex,
            currentQuestion: phase2Qs[0],
            progress: ((nextIndex + 1) / merged.length) * 100,
            confirming: false,
            cardEntering: true,
          });
          this._resetInputForQuestion(phase2Qs[0]);
          this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 400);
          return;
        }
      }
      this._finish();
      return;
    }

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: questions[nextIndex],
      progress: ((nextIndex + 1) / questions.length) * 100,
      confirming: false,
      cardEntering: true,
    });
    this._resetInputForQuestion(questions[nextIndex]);
    this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 400);
  },

  _finish() {
    const { quiz } = this.data;
    const { resultId, normalized, ranked } = scoreGeneric(quiz, this._answers);

    const bestResult = (quiz.results || []).find((r) => r.id === resultId);
    const resultPage = quiz.resultPage || "/subpackages/quiz/pages/generic-result/generic-result";
    saveQuizRecord({
      quizId: quiz.id,
      quizTitle: quiz.title || "",
      featureId: quiz.featureId || "",
      resultId,
      resultTitle: bestResult ? bestResult.title : "",
      normalized,
      duration: this._startTime ? Math.round((Date.now() - this._startTime) / 1000) : null,
      themeKey: quiz.themeKey || "default",
      resultPage,
    });

    getApp().globalData._pendingResult = { normalized, ranked };
    wx.redirectTo({
      url: `${resultPage}?quizId=${quiz.id}&resultId=${resultId}`,
    });
  },

  onExit() {
    this.setData({ showExitModal: true });
  },

  onExitConfirm() {
    this.setData({ showExitModal: false });
    wx.navigateBack({ delta: 1 });
  },

  onExitCancel() {
    this.setData({ showExitModal: false });
  },

  onBackPress() {
    this.onExit();
    return true;
  },

  onUnload() {
    if (this._advanceTimer) clearTimeout(this._advanceTimer);
    if (this._enterTimer) clearTimeout(this._enterTimer);
  },
});
