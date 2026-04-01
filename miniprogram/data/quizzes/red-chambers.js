const CLOUD_RC =
  "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

module.exports = {
  id: "red-chambers",
  catalog: {
    title: "红楼梦气质画像",
    subtitle: "你身上，住着哪一位红楼女子？",
    bgImage: CLOUD_RC + "red-chambers-card.jpg",
    displayTitleZh: "红楼梦气质画像",
    displayTitleEn: "Red Chamber Soul Mirror",
    tags: ["气质画像", "人格探索"],
    estimatedMinutes: 6,
    questionCount: 20,
    isAvailable: true,
    themeKey: "red-chambers",
    featureId: "ip",
  },
  questionPage: "/subpackages/quiz/pages/rc-question/rc-question",
  resultPage:   "/subpackages/quiz/pages/rc-result/rc-result",
};
