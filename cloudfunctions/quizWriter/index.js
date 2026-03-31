const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { action, data } = event;

  switch (action) {
    case "addQuiz":
      return await addQuiz(data);
    case "updateQuiz":
      return await updateQuiz(data);
    case "listCatalog":
      return await listCatalog(data);
    case "getQuiz":
      return await getQuiz(data);
    case "deleteQuiz":
      return await deleteQuiz(data);
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
};

async function addQuiz(quiz) {
  if (!quiz || !quiz.id) {
    return { success: false, error: "quiz.id is required" };
  }

  const existing = await db.collection("quizzes").where({ id: quiz.id }).count();
  if (existing.total > 0) {
    return { success: false, error: `Quiz "${quiz.id}" already exists. Use updateQuiz to overwrite.` };
  }

  await db.collection("quizzes").add({ data: { ...quiz, _createdAt: db.serverDate() } });

  await upsertCatalogEntry(quiz);

  return { success: true, id: quiz.id };
}

async function updateQuiz(quiz) {
  if (!quiz || !quiz.id) {
    return { success: false, error: "quiz.id is required" };
  }

  const res = await db.collection("quizzes").where({ id: quiz.id }).get();

  if (res.data.length === 0) {
    await db.collection("quizzes").add({ data: { ...quiz, _createdAt: db.serverDate() } });
  } else {
    const docId = res.data[0]._id;
    await db.collection("quizzes").doc(docId).set({ data: { ...quiz, _updatedAt: db.serverDate() } });
  }

  await upsertCatalogEntry(quiz);

  return { success: true, id: quiz.id };
}

async function listCatalog({ featureId } = {}) {
  const query = featureId
    ? db.collection("quiz_catalog").where({ featureId })
    : db.collection("quiz_catalog");

  const res = await query.orderBy("_createdAt", "asc").get();
  return { success: true, catalog: res.data };
}

async function getQuiz({ id } = {}) {
  if (!id) return { success: false, error: "id is required" };
  const res = await db.collection("quizzes").where({ id }).limit(1).get();
  if (res.data.length === 0) return { success: false, error: `Quiz "${id}" not found` };
  return { success: true, quiz: res.data[0] };
}

/** Remove quiz body + catalog entry (app list). Idempotent if already gone. */
async function deleteQuiz({ id } = {}) {
  if (!id) return { success: false, error: "id is required" };
  const qRes = await db.collection("quizzes").where({ id }).get();
  for (const doc of qRes.data) {
    await db.collection("quizzes").doc(doc._id).remove();
  }
  const cRes = await db.collection("quiz_catalog").where({ id }).get();
  for (const doc of cRes.data) {
    await db.collection("quiz_catalog").doc(doc._id).remove();
  }
  return { success: true, id, removedQuizDocs: qRes.data.length, removedCatalogDocs: cRes.data.length };
}

async function upsertCatalogEntry(quiz) {
  const qCount =
    typeof quiz.catalogQuestionCount === "number"
      ? quiz.catalogQuestionCount
      : (quiz.questions || []).length;

  const entry = {
    id: quiz.id,
    featureId: quiz.featureId,
    title: quiz.title,
    subtitle: quiz.subtitle,
    eyebrow: quiz.eyebrow || "",
    themeKey: quiz.themeKey || "default",
    estimatedMinutes: quiz.estimatedMinutes || 5,
    questionCount: qCount,
    isAvailable: quiz.isAvailable !== false,
    questionPage: quiz.questionPage,
    resultPage: quiz.resultPage,
    bgImage: quiz.bgImage || "",
    displayTitleZh: quiz.displayTitleZh || quiz.title || "",
    tags: quiz.tags || [],
    _updatedAt: db.serverDate(),
  };

  const existing = await db.collection("quiz_catalog").where({ id: quiz.id }).get();
  if (existing.data.length === 0) {
    await db.collection("quiz_catalog").add({ data: { ...entry, _createdAt: db.serverDate() } });
  } else {
    await db.collection("quiz_catalog").doc(existing.data[0]._id).update({ data: entry });
  }
}
