const CLOUD = "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

module.exports = {
  id: "temple",
  catalog: {
    title:            "你的内心气质，更贴近哪一座庙的意境？",
    subtitle:         "禅意小测，仅供文化与自我觉察",
    bgImage:          CLOUD + "temple-pic.png",
    displayTitleZh:   "你的内心气质，更贴近哪一座庙的意境？",
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
