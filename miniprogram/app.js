const { ensureUser } = require("./utils/userService");

const CLOUD_ENV = "cloudbase-4gadl6qo4a9aa95d";

App({
  onLaunch: function () {
    this.globalData = {
      env: CLOUD_ENV,
      currentAttempt: null,
      user: null,
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }

    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true,
    });

    ensureUser().then((res) => {
      if (res && res.success) {
        this.globalData.user = res.user;
      }
    });
  },
});
