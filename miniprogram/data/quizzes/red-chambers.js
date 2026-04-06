const CLOUD_RC =
  "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

module.exports = {
  id: "red-chambers",
  catalog: {
    title: "《红楼梦》气质画像：你更像哪位女子？",
    subtitle: "借大观园里的选择与心境，照见你的情感与坚持",
    bgImage: CLOUD_RC + "red-chambers-card.jpg",
    displayTitleZh: "《红楼梦》气质画像：你更像哪位女子？",
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
