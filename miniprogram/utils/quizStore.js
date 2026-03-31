const quizzes = require("../data/quizzes/index");

// Scoring engines are required here so they stay in the main-package
// dependency graph — Babel @babel/runtime helpers resolve correctly
// only when files are loaded from the main package.
require("./scoreRedChambers");
require("./scoreCity");

function getCatalog(featureId) {
  return quizzes
    .filter((quiz) => !featureId || quiz.catalog.featureId === featureId)
    .map((quiz) => ({
      id: quiz.id,
      ...quiz.catalog,
    }));
}

module.exports = { getCatalog };
