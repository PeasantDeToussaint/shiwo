const { getCatalog } = require("../../utils/quizStore");
const { fetchCloudCatalog } = require("../../utils/cloudCatalog");
const { FEATURE_LABELS } = require("../../utils/catalogSections");
const {
  decorateCatalogItem,
  mergeLocalAndCloud,
  resolveCatalogCardHero,
} = require("../../utils/catalogPresentation");

const FEATURE_SUBHEADS = {
  classics: "从最稳定、最成熟的题开始。",
  ip: "从熟悉的作品宇宙进入自己。",
  history: "借历史人物与时代气质照见你。",
  archetype: "用原型、神话与象征理解自己。",
  aesthetics: "从审美和创作偏好慢慢靠近你。",
  relationship: "关于情感、连接与亲密方式。",
  cognition: "看见你的思维、判断和倾向。",
  career: "把职业风格与成长路径讲清楚。",
  lifestyle: "日常选择，也是人格的一部分。",
  festival: "节令与情境里的你会怎么选。",
  city: "城市、方言与地方感的题都在这里。",
};

Page({
  data: {
    featureId: "",
    featureLabel: "",
    featureSubhead: "",
    catalog: [],
    statusBarHeight: 0,
    snackbar: { visible: false, leaving: false, label: "" },
  },

  _snackTimer: null,

  onLoad(options) {
    const { statusBarHeight } = wx.getWindowInfo();
    this._featureId = options.featureId || "";
    this.setData({
      featureId: this._featureId,
      featureLabel: FEATURE_LABELS[this._featureId] || "分类浏览",
      featureSubhead: FEATURE_SUBHEADS[this._featureId] || "在这一组题里慢慢挑。",
      statusBarHeight,
    });
  },

  /**
   * 每次进入/返回本页都拉最新云端目录（onLoad 后也会触发一次）。
   * 避免从 quiz 返回仍显示首次进入时的旧列表。
   */
  onShow() {
    const featureId = this.data.featureId || this._featureId;
    if (featureId) this._syncCatalog(featureId);
  },

  _syncCatalog(featureId) {
    const localCatalog = getCatalog(featureId);

    fetchCloudCatalog(featureId).then((cloudItems) => {
      const merged = cloudItems.length
        ? mergeLocalAndCloud(localCatalog, cloudItems, decorateCatalogItem)
        : localCatalog.map((item) => decorateCatalogItem(item));

      this.setData({ catalog: merged });
      this._resolveImages(merged, 0);
    });
  },

  _resolveImages(items, startIndex) {
    items.forEach((item, i) => {
      resolveCatalogCardHero(item).then((patch) => {
        if (!patch.hasImage) return;
        this.setData({ [`catalog[${startIndex + i}]`]: { ...this.data.catalog[startIndex + i], ...patch } });
      });
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onTapCard(event) {
    const { id, bg, available } = event.currentTarget.dataset;
    if (available === false || available === "false") {
      this._showSnackbar("— 即将开放 —");
      return;
    }
    const hero = bg ? `&hero=${encodeURIComponent(bg)}` : "";
    wx.navigateTo({ url: `/subpackages/quiz/pages/quiz-intro/quiz-intro?quizId=${id}${hero}` });
  },

  _showSnackbar(label) {
    if (this._snackTimer) clearTimeout(this._snackTimer);
    this.setData({ snackbar: { visible: true, leaving: false, label } });
    this._snackTimer = setTimeout(() => {
      this.setData({ "snackbar.leaving": true });
      setTimeout(() => {
        this.setData({ snackbar: { visible: false, leaving: false, label: "" } });
      }, 400);
    }, 2000);
  },

  onUnload() {
    if (this._snackTimer) clearTimeout(this._snackTimer);
  },
});
