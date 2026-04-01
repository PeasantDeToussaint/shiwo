const { getCatalog } = require("../../utils/quizStore");
const { fetchCloudCatalog } = require("../../utils/cloudCatalog");
const { computeHomeSections } = require("../../utils/catalogSections");
const {
  decorateCatalogItem,
  mergeLocalAndCloud,
  resolveCatalogCardHero,
} = require("../../utils/catalogPresentation");

Page({
  data: {
    featured: null,
    spotlight: [],
    sections: [],
    quizCount: 0,
    statusBarHeight: 0,
  },

  _catalog: [],

  onLoad() {
    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({ statusBarHeight });
  },

  onShow() {
    const user = (getApp().globalData || {}).user;
    if (user && typeof user.quizCount === "number") {
      this.setData({ quizCount: user.quizCount });
    }
    this._syncCatalog();
  },

  _syncCatalog() {
    const local = getCatalog();
    fetchCloudCatalog().then(cloudItems => {
      const merged = cloudItems.length
        ? mergeLocalAndCloud(local, cloudItems, decorateCatalogItem)
        : local.map((item) => decorateCatalogItem(item));
      this._catalog = merged;
      const { featured, spotlight, sections } = computeHomeSections(merged);
      this.setData({ featured, spotlight, sections });
      this._resolveCardImages(featured, spotlight, sections);
    });
  },

  _resolveCardImages(featured, spotlight, sections) {
    const tasks = [];

    if (featured) {
      tasks.push(
        resolveCatalogCardHero(featured).then((patch) => {
          if (patch.hasImage) this.setData({ featured: { ...this.data.featured, ...patch } });
        })
      );
    }

    spotlight.forEach((item, index) => {
      tasks.push(
        resolveCatalogCardHero(item).then((patch) => {
          if (patch.hasImage) this.setData({ [`spotlight[${index}]`]: { ...this.data.spotlight[index], ...patch } });
        })
      );
    });

    sections.forEach((section, si) => {
      section.items.forEach((item, ii) => {
        tasks.push(
          resolveCatalogCardHero(item).then((patch) => {
            if (patch.hasImage) {
              this.setData({ [`sections[${si}].items[${ii}]`]: { ...this.data.sections[si].items[ii], ...patch } });
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
