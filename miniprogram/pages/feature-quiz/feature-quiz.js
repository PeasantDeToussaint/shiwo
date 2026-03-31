const { getCatalog } = require("../../utils/quizStore");
const { resolveTheme, toCssVarString } = require("../../utils/themePresets");
const { resolveCloudImageSrc } = require("../../utils/resolveCloudImage");
const { fetchCloudCatalog } = require("../../utils/cloudCatalog");

function decorateItem(item, source) {
  const theme = resolveTheme({ themeKey: item.themeKey || "default" });
  return {
    ...item,
    accentColor: item.isAvailable !== false ? theme.accent : null,
    themeStyle: toCssVarString(theme),
    bgImageDisplay: "",
    hasImage: !!item.bgImage,
    _source: source,
  };
}

/**
 * 本地条目顺序优先；同 id 以云端为准（标题、上下架等）。
 * 仅云端有的条目排在后面。
 */
function mergeLocalAndCloud(localDecorated, cloudDecorated) {
  const byId = new Map(localDecorated.map((i) => [i.id, i]));
  for (const c of cloudDecorated) {
    byId.set(c.id, c);
  }
  const order = localDecorated.map((i) => i.id);
  const seen = new Set();
  const merged = [];
  for (const id of order) {
    const row = byId.get(id);
    if (row) {
      merged.push(row);
      seen.add(id);
    }
  }
  for (const c of cloudDecorated) {
    if (!seen.has(c.id)) {
      merged.push(c);
      seen.add(c.id);
    }
  }
  return merged;
}

Page({
  data: {
    featureId: "",
    catalog: [],
    statusBarHeight: 0,
    snackbar: { visible: false, leaving: false, label: "" },
  },

  _snackTimer: null,

  onLoad(options) {
    const { statusBarHeight } = wx.getWindowInfo();
    this._featureId = options.featureId || "";
    this.setData({ featureId: this._featureId, statusBarHeight });
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
    const localCatalog = getCatalog(featureId).map((item) => decorateItem(item, "local"));

    fetchCloudCatalog(featureId).then((cloudItems) => {
      const cloudDecorated = cloudItems.map((item) => decorateItem(item, "cloud"));
      const merged = cloudDecorated.length
        ? mergeLocalAndCloud(localCatalog, cloudDecorated)
        : localCatalog;

      this.setData({ catalog: merged });
      this._resolveImages(merged, 0);
    });
  },

  _resolveImages(items, startIndex) {
    items.forEach((item, i) => {
      if (!item.bgImage) return;
      resolveCloudImageSrc(item.bgImage).then((url) => {
        if (url) this.setData({ [`catalog[${startIndex + i}].bgImageDisplay`]: url });
      });
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onTapCard(event) {
    const { id, available } = event.currentTarget.dataset;
    if (available === false || available === "false") {
      this._showSnackbar("— 即将开放 —");
      return;
    }
    wx.navigateTo({ url: `/subpackages/quiz/pages/quiz-intro/quiz-intro?quizId=${id}` });
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
