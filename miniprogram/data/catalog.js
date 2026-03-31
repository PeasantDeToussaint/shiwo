const quizzes = require("./quizzes/index");

module.exports = quizzes.map((quiz) => ({
  id: quiz.id,
  ...quiz.catalog,
}));
