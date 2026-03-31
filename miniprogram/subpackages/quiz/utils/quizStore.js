/**
 * Subpackage-level quizStore.
 * Returns full quiz objects (with questions, results, score) for quiz pages.
 *
 * Navigation quiz: navigation-full.js is currently missing.
 * It is marked isAvailable: false in the catalog stub so users cannot open it.
 * City quiz: city-question.js loads its own data directly.
 */
const redChambersQuiz = require("../data/red-chambers-quiz");
const cityQuiz        = require("../../../data/quizzes/city");
const dialectQuiz     = require("../data/dialect-quiz");
const templeQuiz      = require("../data/temple-quiz");

const QUIZZES = [redChambersQuiz, cityQuiz, dialectQuiz, templeQuiz];

function getQuizById(quizId) {
  const quiz = QUIZZES.find((q) => q.id === quizId);
  if (!quiz) throw new Error("Unknown quiz: " + quizId);
  return quiz;
}

module.exports = { getQuizById };
