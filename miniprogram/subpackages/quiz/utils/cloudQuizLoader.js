/**
 * cloudQuizLoader.js
 * Fetches full quiz data from cloud database via quizWriter cloud function.
 * 不做会话级缓存，云库更新后重进页面即可拿到最新题面与结果。
 */

const { isRemovedQuizId } = require("../../../utils/removedQuizIds");

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

  return res.result.quiz;
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
