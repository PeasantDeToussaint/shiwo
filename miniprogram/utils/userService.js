/**
 * userService.js
 * Client-side wrapper for the userService cloud function.
 * All calls are fire-and-forget safe — failures are logged but never block UI.
 */

function _call(action, data) {
  return wx.cloud
    .callFunction({ name: "userService", data: { action, data } })
    .then((res) => res.result)
    .catch((err) => {
      console.warn(`[userService] ${action} failed:`, err);
      return { success: false, error: err.message || err };
    });
}

/** Create or touch the user doc. Returns { success, user, isNew }. */
function ensureUser() {
  return _call("ensureUser");
}

/**
 * Save a quiz completion record (fire-and-forget from the question page).
 * @param {{ quizId: string, quizTitle?: string, featureId?: string,
 *           resultId: string, resultTitle?: string,
 *           normalized?: Object, duration?: number }} record
 */
function saveQuizRecord(record) {
  return _call("saveRecord", record);
}

/** Fetch user's quiz history (newest first). */
function getQuizRecords(limit, skip) {
  return _call("getRecords", { limit, skip });
}

/** Get the latest record for one quiz. */
function getRecordByQuiz(quizId) {
  return _call("getRecordByQuiz", { quizId });
}

module.exports = { ensureUser, saveQuizRecord, getQuizRecords, getRecordByQuiz };
