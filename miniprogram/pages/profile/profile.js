const { getQuizRecords } = require("../../utils/userService");
const { resolveTheme, toCssVarString } = require("../../utils/themePresets");

const PAGE_SIZE = 20;

Page({
  data: {
    statusBarHeight: 0,
    quizCount: 0,
    joinDate: "",
    cards: [],
    cardIndex: 0,
    cardTotal: 0,
    hasCards: false,
    emptyState: false,
    loading: true,
  },

  _allRecords: [],

  onLoad() {
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });
  },

  onShow() {
    this._loadData();
  },

  _loadData() {
    const user = (getApp().globalData || {}).user;
    const quizCount = (user && user.quizCount) || 0;
    const joinDate = this._formatDate(user && user.createdAt);
    this.setData({ quizCount, joinDate, loading: true });

    getQuizRecords(PAGE_SIZE, 0).then((res) => {
      if (!res || !res.success) {
        this.setData({ loading: false, emptyState: true });
        return;
      }
      const records = res.records || [];
      this._allRecords = records;
      const cards = records.map((r) => this._toCard(r));
      this.setData({
        cards,
        cardTotal: cards.length,
        cardIndex: 0,
        hasCards: cards.length > 0,
        emptyState: cards.length === 0,
        loading: false,
      });
    });
  },

  _toCard(record) {
    const theme = resolveTheme({ themeKey: record.themeKey || "default" });
    return {
      quizId: record.quizId,
      quizTitle: record.quizTitle || "",
      resultId: record.resultId,
      resultTitle: record.resultTitle || "",
      resultPage: record.resultPage || "",
      date: this._formatDate(record.completedAt),
      duration: record.duration ? `${Math.ceil(record.duration / 60)} 分钟` : "",
      flipped: false,
      accent: theme.accent,
      gradStart: theme.chapterGradientStart,
      gradEnd: theme.chapterGradientEnd,
      themeStyle: toCssVarString(theme),
    };
  },

  _formatDate(val) {
    if (!val) return "";
    const d = typeof val === "string" || typeof val === "number" ? new Date(val) : val;
    if (!(d instanceof Date) || isNaN(d)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  },

  onSwiperChange(e) {
    this.setData({ cardIndex: e.detail.current });
  },

  onTapCard(e) {
    const idx = e.currentTarget.dataset.idx;
    const card = this.data.cards[idx];
    if (!card) return;
    const key = `cards[${idx}].flipped`;
    this.setData({ [key]: !card.flipped });
  },

  onViewResult(e) {
    const idx = e.currentTarget.dataset.idx;
    const card = this.data.cards[idx];
    if (!card) return;
    const resultPage = card.resultPage || "/subpackages/quiz/pages/generic-result/generic-result";
    wx.navigateTo({
      url: `${resultPage}?quizId=${card.quizId}&resultId=${card.resultId}`,
    });
  },

  onRetake(e) {
    const idx = e.currentTarget.dataset.idx;
    const card = this.data.cards[idx];
    if (!card) return;
    wx.navigateTo({
      url: `/subpackages/quiz/pages/quiz-intro/quiz-intro?quizId=${card.quizId}`,
    });
  },

  onGoExplore() {
    wx.switchTab({ url: "/pages/explore/explore" });
  },

});
