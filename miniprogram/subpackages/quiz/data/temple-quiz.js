const data = require("./temple-full");
const { scoreTemple } = require("../utils/scoreTemple");

function score(allAnswers) {
  return scoreTemple(data, allAnswers);
}

module.exports = {
  id:          data.id,
  title:       data.title,
  subtitle:    data.subtitle,
  eyebrow:     data.eyebrow,
  description: data.description,
  themeKey:      data.themeKey,
  accent:        data.accent,
  introPainting: data.introPainting || "",
  disclaimer:  data.disclaimer,
  questions:   data.questions,
  results:     data.results,
  scoring:     data.scoring,
  questionPage: "/subpackages/quiz/pages/temple-question/temple-question",
  resultPage:   "/subpackages/quiz/pages/temple-result/temple-result",
  score,
};
