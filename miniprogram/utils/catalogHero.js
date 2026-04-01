const heroCache = new Map();

function unwrapCloudQuiz(doc) {
  if (!doc || typeof doc !== "object") return null;
  return (doc.quiz && typeof doc.quiz === "object") ? doc.quiz : doc;
}

function extractHero(quiz) {
  if (!quiz || typeof quiz !== "object") return "";
  return quiz.bgImage
    || quiz.introPainting
    || (Array.isArray(quiz.questions) && quiz.questions[0] && quiz.questions[0].painting)
    || "";
}

async function fetchCatalogHero(quizId) {
  if (!quizId) return "";
  if (heroCache.has(quizId)) return heroCache.get(quizId);

  try {
    const res = await wx.cloud.callFunction({
      name: "quizWriter",
      data: { action: "getQuiz", data: { id: quizId } },
    });
    const raw = res && res.result && res.result.success ? res.result.quiz : null;
    const hero = extractHero(unwrapCloudQuiz(raw));
    heroCache.set(quizId, hero || "");
    return hero || "";
  } catch (e) {
    heroCache.set(quizId, "");
    return "";
  }
}

module.exports = { fetchCatalogHero };
