const { resolveTheme, toCssVarString } = require("../../../../utils/themePresets");

const TIER_NAME = { 1: "一线城市", 1.5: "新一线城市", 2: "二线城市", 3: "三线城市" };

Page({
  data: {
    statusBarHeight: 0,
    pageThemeStyle:  "",
    results:         [],
    topCity:         null,
    runner2:         null,
    runner3:         null,
    noResults:       false,
  },

  _rawResults: "",

  onLoad(options) {
    this._rawResults = options.results || "";
    const theme = resolveTheme({ themeKey: "city" });

    wx.getSystemInfo({
      success: (res) => {
        this.setData({
          statusBarHeight: res.statusBarHeight || 44,
          pageThemeStyle:  toCssVarString(theme),
        });
      },
    });

    let top3 = [];
    try {
      top3 = JSON.parse(decodeURIComponent(options.results || "[]"));
    } catch (e) {
      top3 = [];
    }

    if (!top3 || top3.length === 0) {
      this.setData({ noResults: true });
      return;
    }

    const enrich = (r, rank) => {
      if (!r) return null;
      return Object.assign({}, r, {
        rank,
        tierName:  TIER_NAME[r.snapshot.tier] || "",
        matchBar:  `${Math.min(r.matchPercent, 100)}%`,
      });
    };

    this.setData({
      results:  top3.map((r, i) => enrich(r, i + 1)),
      topCity:  enrich(top3[0], 1),
      runner2:  enrich(top3[1], 2) || null,
      runner3:  enrich(top3[2], 3) || null,
    });
  },

  onShow() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage", "shareTimeline"],
    });
  },

  onRetake() {
    wx.navigateBack({ delta: 2 });
  },

  onBackHome() {
    wx.navigateBack({ delta: 10 });
  },

  onShareTap() {
    wx.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage", "shareTimeline"],
      success: () => {
        wx.showToast({ title: "点击右上角 ··· 分享", icon: "none", duration: 2000 });
      },
    });
  },

  onShareAppMessage() {
    const { topCity } = this.data;
    const cityName = topCity && topCity.snapshot && topCity.snapshot.name;
    return {
      title: cityName
        ? `我最适合的城市是「${cityName}」— MYTYPE城市归属`
        : "MYTYPE · 中国哪座城市最适合你？",
      path: `/subpackages/quiz/pages/city-result/city-result?results=${this._rawResults}`,
    };
  },

  onShareTimeline() {
    const { topCity } = this.data;
    const cityName = topCity && topCity.snapshot && topCity.snapshot.name;
    return {
      title: cityName
        ? `我最适合的城市：「${cityName}」· MYTYPE城市归属`
        : "MYTYPE · 城市归属测试",
      query: `results=${this._rawResults}`,
    };
  },
});
