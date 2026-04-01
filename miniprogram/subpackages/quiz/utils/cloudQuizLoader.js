/**
 * cloudQuizLoader.js
 * Fetches full quiz data from cloud database via quizWriter cloud function.
 * 不做会话级缓存，云库更新后重进页面即可拿到最新题面与结果。
 */

const { isRemovedQuizId } = require("../../../utils/removedQuizIds");

function unwrapCloudQuiz(doc) {
  if (!doc || typeof doc !== "object") return null;

  const quiz = (doc.quiz && typeof doc.quiz === "object") ? doc.quiz : doc;
  return {
    ...quiz,
    // Preserve top-level metadata when older uploads wrapped the full quiz.
    id: quiz.id || doc.id,
    featureId: quiz.featureId || doc.featureId,
    isAvailable: quiz.isAvailable !== false && doc.isAvailable !== false,
  };
}

function isUsableQuiz(quiz) {
  if (!quiz || typeof quiz !== "object") return false;
  if (!quiz.id || !quiz.title || !quiz.questionPage || !quiz.resultPage) return false;

  if (quiz.questionPage.includes("/generic-question/")) {
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) return false;
  }

  if (quiz.resultPage.includes("/generic-result/")) {
    if (!Array.isArray(quiz.results) || quiz.results.length === 0) return false;
  }

  return true;
}

/**
 * Fetch a quiz by id from cloud. Throws if not found.
 * @param {string} quizId
 * @returns {Promise<Object>}
 */
async function fetchCloudQuiz(quizId) {
  if (isRemovedQuizId(quizId)) {
    throw new Error(`[cloudQuizLoader] Quiz "${quizId}" was removed`);
  }

  const res = await wx.cloud.callFunction({
    name: "quizWriter",
    data: { action: "getQuiz", data: { id: quizId } },
  });

  if (!res.result || !res.result.success) {
    throw new Error(`[cloudQuizLoader] Quiz "${quizId}" not found in cloud`);
  }

  const quiz = unwrapCloudQuiz(res.result.quiz);
  if (!isUsableQuiz(quiz)) {
    throw new Error(`[cloudQuizLoader] Quiz "${quizId}" payload is incomplete`);
  }

  return quiz;
}

/**
 * Try cloud first, fall back to local bundle.
 * Cloud is the authoritative source; local is the offline/dev fallback.
 * @param {string} quizId
 * @param {Function} [localGetFn] - getQuizById from local quizStore (may throw)
 * @returns {Promise<{quiz: Object, source: 'local'|'cloud'}>}
 */
async function resolveQuiz(quizId, localGetFn) {
  try {
    const quiz = await fetchCloudQuiz(quizId);
    return { quiz, source: "cloud" };
  } catch (_) {
    if (!localGetFn) throw new Error(`Quiz "${quizId}" not found in cloud`);
    try {
      const quiz = localGetFn(quizId);
      return { quiz, source: "local" };
    } catch (e) {
      throw new Error(`Quiz "${quizId}" not found in cloud or local bundle`);
    }
  }
}

module.exports = { fetchCloudQuiz, resolveQuiz };
