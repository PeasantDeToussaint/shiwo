const { getCatalog } = require("../../utils/quizStore");
const { fetchCloudCatalog } = require("../../utils/cloudCatalog");
const { computeExploreSections } = require("../../utils/catalogSections");
const {
  decorateCatalogItem,
  mergeLocalAndCloud,
  resolveCatalogCardHero,
} = require("../../utils/catalogPresentation");

Page({
  data: {
    sections: [],
    quickCategories: [],
    comingSoon: [],
    statusBarHeight: 0,
    searchQuery: "",   // Only written on clear — never during typing (avoids WeChat IME reset)
    lastQuery: "",     // Display copy, written when search runs
    searchResults: [],
    searchDone: false,
    isSearching: false,
  },

  _allItems: [],
  _searchQuery: "",   // Live input value tracked in JS, never round-tripped through setData

  onLoad() {
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });
  },

  onShow() {
    this._syncCatalog();
  },

  _syncCatalog() {
    const local = getCatalog();
    fetchCloudCatalog().then(cloudItems => {
      const merged = cloudItems.length
        ? mergeLocalAndCloud(local, cloudItems, decorateCatalogItem)
        : local.map((item) => decorateCatalogItem(item));
      this._allItems = merged;
      const allSections = computeExploreSections(merged);
      const sections = allSections
        .filter((section) => !section.isEmpty)
        .map((section) => ({
          ...section,
          previewItems: section.items.slice(0, 6),
        }));
      const quickCategories = sections.map((section) => ({
        id: section.id,
        title: section.title,
        count: section.items.length,
      }));
      const comingSoon = allSections.filter((section) => section.isEmpty).map((section) => section.title);
      this.setData({ sections, quickCategories, comingSoon });
      this._resolveCardImages(sections);
    });
  },

  onSearchInput(e) {
    const raw = e.detail.value || "";
    this._searchQuery = raw;
    const q = raw.trim().toLowerCase();
    const isSearching = raw.length > 0;

    if (!q) {
      // Don't touch searchQuery — only clear the results state
      this.setData({ isSearching, searchResults: [], searchDone: false });
      return;
    }

    const searchResults = this._allItems.filter((item) => {
      const fields = [
        item.title,
        item.displayTitleZh,
        item.subtitle,
        item.eyebrow,
        item.primaryTag,
        ...(item.tags || []),
      ];
      return fields.some((field) => field && String(field).toLowerCase().includes(q));
    });
    // Never write searchQuery here — it resets WeChat's soft keyboard IME on real device
    this.setData({ isSearching, searchResults, searchDone: true, lastQuery: raw.trim() });
    this._resolveSearchImages(searchResults);
  },

  _resolveCardImages(sections) {
    const tasks = [];
    sections.forEach((section, si) => {
      section.previewItems.forEach((item, ii) => {
        tasks.push(
          resolveCatalogCardHero(item).then((patch) => {
            if (patch.hasImage) {
              this.setData({ [`sections[${si}].previewItems[${ii}]`]: { ...this.data.sections[si].previewItems[ii], ...patch } });
            }
          })
        );
      });
    });
    return Promise.all(tasks);
  },

  _resolveSearchImages(items) {
    const tasks = items.map((item, index) =>
      resolveCatalogCardHero(item).then((patch) => {
        if (!patch.hasImage) return;
        const current = this.data.searchResults[index];
        if (!current) return;
        this.setData({ [`searchResults[${index}]`]: { ...current, ...patch } });
      })
    );
    return Promise.all(tasks);
  },

  onSearchClear() {
    this._searchQuery = "";
    this.setData({
      searchQuery: "",   // This clears the controlled input value
      lastQuery: "",
      searchResults: [],
      searchDone: false,
      isSearching: false,
    });
  },

  onSearchCancel() {
    this.onSearchClear();
  },

  onTapCard(e) {
    const { id, bg } = e.currentTarget.dataset;
    const hero = bg ? `&hero=${encodeURIComponent(bg)}` : "";
    wx.navigateTo({ url: `/subpackages/quiz/pages/quiz-intro/quiz-intro?quizId=${id}${hero}` });
  },

  onSeeAll(e) {
    const { fid } = e.currentTarget.dataset;
    if (!fid) return;
    wx.navigateTo({ url: `/pages/feature-quiz/feature-quiz?featureId=${fid}` });
  },
});
