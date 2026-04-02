const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ADMIN_TOKEN = "mytype-admin-b7661ef16c97d12f67fff058";

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
    case "patchCatalog":
      return await patchCatalog(data);
    case "patchQuizText":
      return await patchQuizText(data);
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

/** Patch specific fields on quiz_catalog (and optionally quizzes) without full re-upload. */
async function patchCatalog({ id, fields } = {}) {
  if (!id || !fields) return { success: false, error: "id and fields are required" };
  const res = await db.collection("quiz_catalog").where({ id }).get();
  if (res.data.length === 0) return { success: false, error: `Catalog entry "${id}" not found` };
  await db.collection("quiz_catalog").doc(res.data[0]._id).update({ data: { ...fields, _updatedAt: db.serverDate() } });
  // Mirror featureId patch into main quizzes collection if requested
  if (fields.featureId !== undefined) {
    const qRes = await db.collection("quizzes").where({ id }).get();
    if (qRes.data.length > 0) {
      await db.collection("quizzes").doc(qRes.data[0]._id).update({ data: { featureId: fields.featureId, _updatedAt: db.serverDate() } });
    }
  }
  return { success: true, id };
}

// Safe text-only fields an admin editor may touch on a result object.
const RESULT_TEXT_KEYS = [
  "title", "subtitle", "token", "verse", "verseSource",
  "portrait", "lifeAdvice", "situation", "destiny", "boldQuote",
];

async function patchQuizText({ id, adminToken, questions, results } = {}) {
  if (adminToken !== ADMIN_TOKEN) {
    return { success: false, error: "Unauthorized" };
  }
  if (!id) return { success: false, error: "id is required" };

  const res = await db.collection("quizzes").where({ id }).limit(1).get();
  if (res.data.length === 0) return { success: false, error: `Quiz "${id}" not found` };

  const quiz = res.data[0];
  const docId = quiz._id;

  // Patch questions — only text fields on questions and options
  if (Array.isArray(questions)) {
    const qMap = {};
    (quiz.questions || []).forEach((q) => { qMap[q.id] = q; });
    questions.forEach(({ id: qid, text, options }) => {
      if (!qMap[qid]) return;
      if (typeof text === "string") qMap[qid].text = text;
      if (Array.isArray(options)) {
        const oMap = {};
        (qMap[qid].options || []).forEach((o) => { oMap[o.id] = o; });
        options.forEach(({ id: oid, text: otext }) => {
          if (oMap[oid] && typeof otext === "string") oMap[oid].text = otext;
        });
        qMap[qid].options = (qMap[qid].options || []).map((o) => oMap[o.id] || o);
      }
    });
    quiz.questions = (quiz.questions || []).map((q) => qMap[q.id] || q);
  }

  // Patch results — only whitelisted text keys + strengths/weaknesses label+description
  if (Array.isArray(results)) {
    const rMap = {};
    (quiz.results || []).forEach((r) => { rMap[r.id] = r; });
    results.forEach((patch) => {
      const r = rMap[patch.id];
      if (!r) return;
      RESULT_TEXT_KEYS.forEach((k) => {
        if (typeof patch[k] === "string") r[k] = patch[k];
      });
      ["strengths", "weaknesses"].forEach((listKey) => {
        if (!Array.isArray(patch[listKey])) return;
        const existing = r[listKey] || [];
        patch[listKey].forEach(({ index, label, description }) => {
          if (existing[index]) {
            if (typeof label === "string") existing[index].label = label;
            if (typeof description === "string") existing[index].description = description;
          }
        });
        r[listKey] = existing;
      });
    });
    quiz.results = (quiz.results || []).map((r) => rMap[r.id] || r);
  }

  delete quiz._id;
  delete quiz._openid;
  await db.collection("quizzes").doc(docId).set({ data: { ...quiz, _updatedAt: db.serverDate() } });
  await upsertCatalogEntry(quiz);

  return { success: true, id };
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
