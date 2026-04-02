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
    searchQuery: "",
    searchResults: [],
    isSearching: false,
  },

  _allItems: [],

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
    const query = (e.detail.value || "").trim();
    const isSearching = query.length > 0;
    this.setData({ searchQuery: query, isSearching, searchResults: [] });
    if (!isSearching) return;

    const q = query.toLowerCase();
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
    this.setData({ searchResults });
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
    this.setData({
      searchQuery: "",
      searchResults: [],
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
