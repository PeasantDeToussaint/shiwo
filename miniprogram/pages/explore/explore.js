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
  },

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
