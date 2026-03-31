const data = require("./dialect-full");
const { scoreDialect } = require("../utils/scoreDialect");

function score(allAnswers) {
  return scoreDialect(data, allAnswers);
}

module.exports = {
  id:          data.id,
  title:       data.title,
  subtitle:    data.subtitle,
  eyebrow:     data.eyebrow,
  description: data.description,
  themeKey:    data.themeKey,
  accent:      data.accent,
  disclaimer:  data.disclaimer,
  questions:   data.questions,
  results:     data.results,
  scoring:     data.scoring,
  questionPage: "/subpackages/quiz/pages/dialect-question/dialect-question",
  resultPage:   "/subpackages/quiz/pages/dialect-result/dialect-result",
  score,
};
