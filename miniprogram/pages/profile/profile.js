const { getQuizRecords } = require("../../utils/userService");
const { resolveTheme, toCssVarString } = require("../../utils/themePresets");

const PAGE_SIZE = 20;
const INITIAL_VISIBLE_COUNT = 4;

Page({
  data: {
    statusBarHeight: 0,
    quizCount: 0,
    joinDate: "",
    cards: [],
    visibleCards: [],
    hasCards: false,
    emptyState: false,
    loading: true,
    archiveOpened: false,
    showAllRecords: false,
  },

  _allCards: [],

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
      const cards = records.map((r) => this._toCard(r));
      this._allCards = cards;
      this.setData({
        cards,
        hasCards: cards.length > 0,
        emptyState: cards.length === 0,
        loading: false,
        archiveOpened: false,
        showAllRecords: false,
      });
      this._syncVisibleCards();
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
      accent: theme.accent,
      gradStart: theme.chapterGradientStart,
      gradEnd: theme.chapterGradientEnd,
      themeStyle: toCssVarString(theme),
    };
  },

  _syncVisibleCards() {
    const visibleCards = this.data.showAllRecords
      ? this._allCards.slice()
      : this._allCards.slice(0, INITIAL_VISIBLE_COUNT);
    this.setData({ visibleCards });
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

  onOpenArchive() {
    if (this.data.archiveOpened) return;
    this.setData({ archiveOpened: true });
    this._syncVisibleCards();
  },

  onToggleAllRecords() {
    this.setData({ showAllRecords: !this.data.showAllRecords }, () => this._syncVisibleCards());
  },

  onViewResult(e) {
    const idx = e.currentTarget.dataset.idx;
    const card = this.data.visibleCards[idx];
    if (!card) return;
    const resultPage = card.resultPage || "/subpackages/quiz/pages/generic-result/generic-result";
    wx.navigateTo({
      url: `${resultPage}?quizId=${card.quizId}&resultId=${card.resultId}`,
    });
  },

  onRetake(e) {
    const idx = e.currentTarget.dataset.idx;
    const card = this.data.visibleCards[idx];
    if (!card) return;
    wx.navigateTo({
      url: `/subpackages/quiz/pages/quiz-intro/quiz-intro?quizId=${card.quizId}`,
    });
  },

  onGoExplore() {
    wx.switchTab({ url: "/pages/explore/explore" });
  },

});
