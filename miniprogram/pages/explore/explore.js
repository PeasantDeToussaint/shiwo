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
    searchKey: 0,      // Increment on clear to force-recreate the uncontrolled <input>
    lastQuery: "",     // Display copy, written when search runs
    searchResults: [],
    searchDone: false,
    isSearching: false,
  },

  _allItems: [],
  _searchQuery: "",   // Live input value — never round-tripped through setData

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
    const isSearching = raw.length > 0;
    if (!isSearching) {
      this.setData({ isSearching: false, searchResults: [], searchDone: false });
      return;
    }
    this._runSearch(raw);
  },

  _runSearch(raw) {
    const q = raw.trim().toLowerCase();
    if (!q) return;
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
    this.setData({ isSearching: true, searchResults, searchDone: true, lastQuery: raw.trim() });
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

  onSearchConfirm() {
    // Trigger search on keyboard "搜索" button as an extra entry point
    if (this._searchQuery) this._runSearch(this._searchQuery);
  },

  onSearchClear() {
    this._searchQuery = "";
    this.setData({
      searchKey: this.data.searchKey + 1,   // Recreates the <input> element → clears it
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
