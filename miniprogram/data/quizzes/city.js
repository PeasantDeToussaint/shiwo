/**
 * city.js — lightweight catalog stub for "城市归属".
 * Heavy data (city-full, city-data) and scoring (scoreCity) live in
 * the quiz subpackage and are loaded directly by city-question.js.
 */
module.exports = {
  id: "city",
  catalog: {
    title:            "中国哪座城市，最适合你生活？",
    subtitle:         "从节奏、气候、物价与人际偏好，一步步缩小答案",
    bgImage:          "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/city_pic.png",
    displayTitleZh:   "中国哪座城市，最适合你生活？",
    displayTitleEn:   "City Match",
    tags:             ["城市选择", "生活方式"],
    estimatedMinutes: 8,
    questionCount:    25,
    isAvailable:      true,
    themeKey:         "city",
    featureId:        "city",
  },
  title:        "中国哪座城市，最适合你生活？",
  subtitle:     "从节奏、气候、物价与人际偏好，一步步缩小答案",
  themeKey:     "city",
  questions:    [],
  provinces:    [],
  questionPage: "/subpackages/quiz/pages/city-question/city-question",
  resultPage:   "/subpackages/quiz/pages/city-result/city-result",
  score:        null,
};
