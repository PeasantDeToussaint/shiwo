const CLOUD = "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

module.exports = {
  id: "dialect",
  catalog: {
    title: "听你的用词习惯，你更像哪片方言气质？",
    subtitle: "用语选择映射地域亲缘（趣味溯源，非严谨语言学鉴定）",
    bgImage: CLOUD + "city-card.jpg",
    displayTitleZh: "听你的用词习惯，你更像哪片方言气质？",
    displayTitleEn: "Dialect Origins",
    tags: ["方言", "地域"],
    estimatedMinutes: 4,
    questionCount: 25,
    isAvailable: true,
    themeKey: "dialect",
    featureId: "lifestyle",
  },
  themeKey: "dialect",
  questionPage: "/subpackages/quiz/pages/dialect-question/dialect-question",
  resultPage:   "/subpackages/quiz/pages/dialect-result/dialect-result",
};
