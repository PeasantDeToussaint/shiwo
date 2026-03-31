const CLOUD = "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

module.exports = {
  id: "temple",
  catalog: {
    title:            "寺庙之缘",
    subtitle:         "你的气场，与哪座古刹最相应？",
    bgImage:          CLOUD + "temple-pic.png",
    displayTitleZh:   "寺庙缘分",
    displayTitleEn:   "Temple Origins",
    tags:             ["禅学", "五行", "风水"],
    estimatedMinutes: 4,
    questionCount:    12,
    isAvailable:      true,
    themeKey:         "temple",
    featureId:        "lifestyle",
  },
  themeKey:     "temple",
  questionPage: "/subpackages/quiz/pages/temple-question/temple-question",
  resultPage:   "/subpackages/quiz/pages/temple-result/temple-result",
};
