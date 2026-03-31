const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  switch (action) {
    case "ensureUser":
      return await ensureUser(openid);
    case "saveRecord":
      return await saveRecord(openid, data);
    case "getRecords":
      return await getRecords(openid, data);
    case "getRecordByQuiz":
      return await getRecordByQuiz(openid, data);
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
};

/**
 * Create user doc if first visit, otherwise update lastActiveAt.
 * Returns { success, user, isNew }.
 */
async function ensureUser(openid) {
  const col = db.collection("users");
  const existing = await col.where({ _openid: openid }).limit(1).get();

  if (existing.data.length > 0) {
    const user = existing.data[0];
    await col.doc(user._id).update({
      data: { lastActiveAt: db.serverDate() },
    });
    return { success: true, user, isNew: false };
  }

  const now = db.serverDate();
  const newUser = {
    _openid: openid,
    quizCount: 0,
    createdAt: now,
    lastActiveAt: now,
  };
  const res = await col.add({ data: newUser });
  newUser._id = res._id;
  return { success: true, user: newUser, isNew: true };
}

/**
 * Save a quiz completion record and increment user's quizCount.
 * Expects data: { quizId, quizTitle, featureId, resultId, resultTitle,
 *                 normalized?, duration?, themeKey?, resultPage? }
 */
async function saveRecord(openid, data) {
  if (!data || !data.quizId || !data.resultId) {
    return { success: false, error: "quizId and resultId are required" };
  }

  const record = {
    _openid: openid,
    quizId: data.quizId,
    quizTitle: data.quizTitle || "",
    featureId: data.featureId || "",
    resultId: data.resultId,
    resultTitle: data.resultTitle || "",
    normalized: data.normalized || null,
    duration: data.duration || null,
    themeKey: data.themeKey || "default",
    resultPage: data.resultPage || "",
    completedAt: db.serverDate(),
  };

  await db.collection("quiz_records").add({ data: record });

  // Increment quizCount on user doc (best-effort)
  try {
    await db.collection("users").where({ _openid: openid }).update({
      data: {
        quizCount: _.inc(1),
        lastActiveAt: db.serverDate(),
      },
    });
  } catch (_e) { /* user doc may not exist yet — non-blocking */ }

  return { success: true, record };
}

/**
 * Get user's quiz records, newest first.
 * Optional data.limit (default 20), data.skip (default 0).
 */
async function getRecords(openid, data = {}) {
  const limit = Math.min(data.limit || 20, 50);
  const skip = data.skip || 0;

  const res = await db.collection("quiz_records")
    .where({ _openid: openid })
    .orderBy("completedAt", "desc")
    .skip(skip)
    .limit(limit)
    .get();

  return { success: true, records: res.data };
}

/**
 * Get the most recent record for a specific quiz (to show "you got X last time").
 */
async function getRecordByQuiz(openid, data = {}) {
  if (!data.quizId) return { success: false, error: "quizId is required" };

  const res = await db.collection("quiz_records")
    .where({ _openid: openid, quizId: data.quizId })
    .orderBy("completedAt", "desc")
    .limit(1)
    .get();

  return {
    success: true,
    record: res.data.length > 0 ? res.data[0] : null,
  };
}
