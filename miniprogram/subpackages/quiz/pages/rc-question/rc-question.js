const { getQuizById } = require("../../utils/quizStore");
const { resolveQuiz } = require("../../utils/cloudQuizLoader");
const { scoreRedChambers } = require("../../../../utils/scoreRedChambers");
const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");
const { resolveCloudImageSrc, downloadCloudImageSrc, resolveCloudImageBatch } = require("../../../../utils/resolveCloudImage");
const { saveQuizRecord } = require("../../../../utils/userService");

const ACTS = [
  { label: "初入园林", range: [0, 3] },
  { label: "流年人事", range: [4, 9] },
  { label: "命运当头", range: [10, 15] },
  { label: "曲终人散", range: [16, 19] },
];

function getAct(index) {
  const act = ACTS.find((a) => index >= a.range[0] && index <= a.range[1]);
  return act ? act.label : "";
}

Page({
  data: {
    quiz: null,
    questions: [],
    currentIndex: 0,
    totalCount: 0,
    currentQuestion: null,
    currentAct: "",
    progress: 0,
    answers: {},
    selectedOptionId: null,
    reaction: "",
    confirming: false,
    // cardEntering: true only briefly after a question changes, so the
    // enter animation fires exactly once per question — not on every setData.
    cardEntering: false,
    transitioning: false,
    // scrollIntoViewId: set to "rc-top" briefly on question change to reset
    // scroll position; NOT changed on onSelectOption so no scroll-jank.
    scrollIntoViewId: "",
    pageThemeStyle: "",
    statusBarHeight: 0,
    /** Resolved HTTPS URL for <image>; cloud:// alone often fails in devtools */
    paintingDisplay: "",
  },

  _advanceTimer: null,
  _paintingSeq: 0,
  _transitionTimer: null,
  _enterTimer: null,
  /** Map<cloudFileId, resolvedUrl> pre-warmed at page load */
  _paintingCache: null,

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
        currentAct: getAct(0),
        progress: questions.length > 0 ? (1 / questions.length) * 100 : 0,
        cardEntering: true,
        pageThemeStyle: toCssVarString(theme),
      });
      this._enterTimer = setTimeout(() => this.setData({ cardEntering: false }), 400);

      // Batch-resolve all cloud URLs upfront so subsequent questions are instant
      const allPaintingIds = questions.map((q) => q.painting).filter(Boolean);
      resolveCloudImageBatch(allPaintingIds).then((cache) => {
        this._paintingCache = cache;
        const q0 = this.data.currentQuestion;
        if (q0 && q0.painting) {
          const url = cache.get(q0.painting) || "";
          if (url && url !== this.data.paintingDisplay) {
            this.setData({ paintingDisplay: url });
          }
        }
      });

      // Also kick off the first question immediately without waiting for batch
      this._resolvePaintingForQuestion(questions[0]);
    }).catch((e) => {
      console.error("[rc-question] load failed:", e);
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    });
  },

  _resolvePaintingForQuestion(question) {
    if (!question || !question.painting) {
      this.setData({ paintingDisplay: "" });
      return;
    }
    const p = question.painting;
    if (!p.startsWith("cloud://")) {
      this._paintingSeq++;
      this.setData({ paintingDisplay: p });
      return;
    }
    // If the batch already resolved this URL, use it immediately
    if (this._paintingCache && this._paintingCache.has(p)) {
      this._paintingSeq++;
      this.setData({ paintingDisplay: this._paintingCache.get(p) || "" });
      return;
    }
    const seq = ++this._paintingSeq;
    resolveCloudImageSrc(p).then((url) => {
      if (seq !== this._paintingSeq) return;
      if (this._paintingCache) this._paintingCache.set(p, url);
      this.setData({ paintingDisplay: url });
    });
  },

  onUnload() {
    clearTimeout(this._advanceTimer);
    clearTimeout(this._transitionTimer);
    clearTimeout(this._enterTimer);
  },

  // CDN URL 403d (devtools) — download locally as fallback
  onPaintingError() {
    const q = this.data.currentQuestion;
    if (!q || !q.painting) return;
    const p = q.painting;
    const seq = ++this._paintingSeq;
    downloadCloudImageSrc(p).then((path) => {
      if (seq !== this._paintingSeq) return;
      if (path) {
        if (this._paintingCache) this._paintingCache.set(p, path);
        this.setData({ paintingDisplay: path });
      }
    });
  },

  onSelectOption(event) {
    if (this.data.confirming) return;

    const { optionId } = event.currentTarget.dataset;
    const { currentQuestion, answers, currentIndex, questions, quiz } = this.data;

    if (!currentQuestion) return;

    const opt = currentQuestion.options.find((o) => o.id === optionId);
    const reaction = opt ? (opt.reaction || "") : "";
    const newAnswers = { ...answers, [currentQuestion.id]: optionId };

    // Clear cardEntering immediately — if the user taps within the 400ms
    // entry window, the rc-scroll-enter class is still on the scroll-view.
    // Leaving it causes WeChat to re-evaluate and restart the entry animation.
    if (this.data.cardEntering) {
      clearTimeout(this._enterTimer);
    }

    this.setData({
      cardEntering: false,
      answers: newAnswers,
      selectedOptionId: optionId,
      reaction,
      confirming: true,
    });

    // No auto-advance — user taps "继续" to proceed at their own pace.
  },

  onContinue() {
    if (!this.data.confirming) return;
    const { currentIndex, questions, answers } = this.data;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      this._finishQuiz(answers);
      return;
    }
    this._goToIndex(nextIndex, answers);
  },

  onGoBack() {
    const { currentIndex, questions, answers, confirming } = this.data;

    // If the reaction beat is showing, cancel the advance and stay on current question
    if (confirming) {
      clearTimeout(this._advanceTimer);
      this.setData({ confirming: false, selectedOptionId: null, reaction: "" });
      return;
    }

    if (currentIndex <= 0) {
      wx.navigateBack();
      return;
    }

    clearTimeout(this._advanceTimer);
    clearTimeout(this._transitionTimer);

    const prevIndex = currentIndex - 1;
    const prevQuestion = questions[prevIndex];
    // Restore their previous selection so they can see what they picked
    const prevSelectedOption = answers[prevQuestion.id] || null;

    this.setData({
      transitioning: true,
    });

    this._transitionTimer = setTimeout(() => {
      this.setData({
        currentIndex: prevIndex,
        currentQuestion: prevQuestion,
        currentAct: getAct(prevIndex),
        progress: ((prevIndex + 1) / questions.length) * 100,
        selectedOptionId: prevSelectedOption,
        reaction: "",
        confirming: false,
        transitioning: false,
        cardEntering: true,
        scrollIntoViewId: "rc-top",
      });
      this._enterTimer = setTimeout(() => this.setData({ cardEntering: false, scrollIntoViewId: "" }), 400);
      this._resolvePaintingForQuestion(prevQuestion);
    }, 220);
  },

  _goToIndex(nextIndex, newAnswers) {
    const { questions } = this.data;
    this.setData({ transitioning: true });

    this._transitionTimer = setTimeout(() => {
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        currentAct: getAct(nextIndex),
        progress: ((nextIndex + 1) / questions.length) * 100,
        answers: newAnswers,
        selectedOptionId: null,
        reaction: "",
        confirming: false,
        transitioning: false,
        cardEntering: true,
        scrollIntoViewId: "rc-top",
      });
      this._enterTimer = setTimeout(() => this.setData({ cardEntering: false, scrollIntoViewId: "" }), 400);
      this._resolvePaintingForQuestion(questions[nextIndex]);
    }, 260);
  },

  _finishQuiz(answers) {
    const { quiz } = this.data;
    const resultPage = quiz.resultPage || "/subpackages/quiz/pages/rc-result/rc-result";
    const scored = scoreRedChambers(quiz, answers);
    const { resultId, subTypeId, hasTension, breakdown, rankedDimensions } = scored;

    const bestResult = (quiz.results || []).find((r) => r.id === resultId);
    saveQuizRecord({
      quizId: quiz.id,
      quizTitle: quiz.title || "",
      featureId: quiz.featureId || "",
      resultId,
      resultTitle: bestResult ? bestResult.title : "",
      themeKey: quiz.themeKey || "default",
      resultPage,
    });

    wx.redirectTo({
      url:
        `${resultPage}` +
        `?quizId=${quiz.id}` +
        `&resultId=${resultId}` +
        `&subTypeId=${subTypeId || ""}` +
        `&hasTension=${hasTension ? "1" : "0"}` +
        `&breakdown=${encodeURIComponent(JSON.stringify(breakdown))}` +
        `&ranked=${encodeURIComponent(JSON.stringify(rankedDimensions))}`,
    });
  },
});
