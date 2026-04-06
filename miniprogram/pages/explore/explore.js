const { getCatalog } = require("../../utils/quizStore");
const { fetchCloudCatalog } = require("../../utils/cloudCatalog");
const { computeExploreSections } = require("../../utils/catalogSections");
const {
  decorateCatalogItem,
  mergeLocalAndCloud,
  resolveCatalogCardHero,
} = require("../../utils/catalogPresentation");
const { sortCatalogByRecency } = require("../../utils/catalogSort");

Page({
  data: {
    sections: [],
    quickCategories: [],
    comingSoon: [],
    statusBarHeight: 0,
    searchKey: 0,      // Increment on clear to force-recreate the uncontrolled <input>
    hasSearchText: false,
    lastQuery: "",     // Display copy, written when search runs
    searchResults: [],
    searchDone: false,
    isSearching: false,
  },

  _allItems: [],
  _searchQuery: "",   // Live input value — never round-tripped through setData
  _lastSubmittedQuery: "",

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
      // Real device can finish cloud/local catalog sync after the user has already started typing.
      // Re-run the current search once items arrive so results don't stay stale/empty.
      if (this._searchQuery && this._searchQuery.trim()) {
        this._runSearch(this._searchQuery);
      }
      this._resolveCardImages(sections);
    });
  },

  onSearchInput(e) {
    const raw = e.detail.value || "";
    this._searchQuery = raw;
    const hasSearchText = raw.trim().length > 0;
    if (!hasSearchText) {
      this.setData({
        hasSearchText: false,
        isSearching: false,
        lastQuery: "",
        searchResults: [],
        searchDone: false,
      });
      return;
    }
    this.setData({ hasSearchText: true });
  },

  _runSearch(raw) {
    const q = raw.trim().toLowerCase();
    if (!q) return;
    const searchResults = sortCatalogByRecency(
      this._allItems.filter((item) => {
        const fields = [
          item.title,
          item.displayTitleZh,
          item.subtitle,
          item.eyebrow,
          item.primaryTag,
          ...(item.tags || []),
        ];
        return fields.some((field) => field && String(field).toLowerCase().includes(q));
      })
    );
    this.setData({ isSearching: true, searchResults, searchDone: true, lastQuery: raw.trim() });
    this._resolveSearchImages(searchResults);
  },

  onSearchSubmit(e) {
    const detailValue = e && e.detail && e.detail.value;
    const raw = (detailValue && (detailValue.q || detailValue)) || this._searchQuery || "";
    if (!raw.trim()) {
      this.onSearchClear();
      return;
    }
    const normalized = raw.trim();
    if (normalized === this._lastSubmittedQuery && this.data.isSearching) return;
    this._lastSubmittedQuery = normalized;
    if (wx.hideKeyboard) wx.hideKeyboard();
    this._runSearch(raw);
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
    this._lastSubmittedQuery = "";
    this.setData({
      searchKey: this.data.searchKey + 1,   // Recreates the <input> element → clears it
      hasSearchText: false,
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
