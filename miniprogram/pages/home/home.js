const features = require("../../data/features");
const { resolveCloudImageSrc } = require("../../utils/resolveCloudImage");

Page({
  data: {
    features: [],
    quizCount: 0,
  },

  onLoad() {
    const initial = features.map((f) => ({ ...f, bgImageDisplay: "" }));
    this.setData({ features: initial });

    features.forEach((f, i) => {
      if (!f.bgImage) return;
      resolveCloudImageSrc(f.bgImage).then((url) => {
        if (url) this.setData({ [`features[${i}].bgImageDisplay`]: url });
      });
    });
  },

  onShow() {
    const user = (getApp().globalData || {}).user;
    if (user && typeof user.quizCount === "number") {
      this.setData({ quizCount: user.quizCount });
    }
  },

  onTapFeature(event) {
    const { id } = event.currentTarget.dataset;
    const item = features.find((f) => f.id === id);
    if (!item || !item.isAvailable) return;
    wx.navigateTo({ url: `/pages/feature-quiz/feature-quiz?featureId=${id}` });
  },

  onTapProfile() {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },
});
