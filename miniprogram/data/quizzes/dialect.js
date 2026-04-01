const CLOUD = "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

module.exports = {
  id: "dialect",
  catalog: {
    title: "方言溯源",
    subtitle: "你的日常用词，藏着你来自哪里。",
    bgImage: CLOUD + "city-card.jpg",
    displayTitleZh: "方言溯源",
    displayTitleEn: "Dialect Origins",
    tags: ["方言", "地域"],
    estimatedMinutes: 4,
    questionCount: 25,
    isAvailable: true,
    themeKey: "dialect",
    featureId: "city",
  },
  themeKey: "dialect",
  questionPage: "/subpackages/quiz/pages/dialect-question/dialect-question",
  resultPage:   "/subpackages/quiz/pages/dialect-result/dialect-result",
};
