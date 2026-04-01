const { resolveTheme, toCssVarString } = require("./themePresets");
const { resolveCloudImageSrc } = require("./resolveCloudImage");
const { fetchCatalogHero } = require("./catalogHero");

function decorateCatalogItem(item, extra = {}) {
  const theme = resolveTheme({ themeKey: item.themeKey || "default" });
  return {
    ...item,
    ...extra,
    accentColor: item.isAvailable !== false ? theme.accent : null,
    themeStyle: toCssVarString(theme),
    bgImageDisplay: "",
    hasImage: !!item.bgImage,
    displayMinutes: item.estimatedMinutes ? `${item.estimatedMinutes} 分钟` : "",
    displayQuestionCount: item.questionCount ? `${item.questionCount} 题` : "",
    primaryTag: Array.isArray(item.tags) && item.tags.length ? item.tags[0] : "",
  };
}

function mergeCatalogRow(localRow, cloudRow) {
  return {
    ...(localRow || {}),
    ...(cloudRow || {}),
    title: (cloudRow && cloudRow.title) || (localRow && localRow.title) || "",
    subtitle: (cloudRow && cloudRow.subtitle) || (localRow && localRow.subtitle) || "",
    themeKey: (cloudRow && cloudRow.themeKey) || (localRow && localRow.themeKey) || "default",
    bgImage: (cloudRow && cloudRow.bgImage) || (localRow && localRow.bgImage) || "",
    displayTitleZh: (cloudRow && cloudRow.displayTitleZh) || (localRow && localRow.displayTitleZh) || "",
    tags: (cloudRow && cloudRow.tags && cloudRow.tags.length ? cloudRow.tags : (localRow && localRow.tags)) || [],
    questionPage: (cloudRow && cloudRow.questionPage) || (localRow && localRow.questionPage) || "",
    resultPage: (cloudRow && cloudRow.resultPage) || (localRow && localRow.resultPage) || "",
    questionCount: (cloudRow && cloudRow.questionCount) || (localRow && localRow.questionCount) || 0,
  };
}

function mergeLocalAndCloud(localItems, cloudItems, decorateFn = decorateCatalogItem) {
  const local = localItems.map((item) => decorateFn(item));
  const cloud = cloudItems.map((item) => decorateFn(item));

  const byId = new Map(local.map((item) => [item.id, item]));
  for (const item of cloud) {
    byId.set(item.id, decorateFn(mergeCatalogRow(byId.get(item.id), item)));
  }

  const ordered = [];
  const seen = new Set();

  for (const item of local) {
    const merged = byId.get(item.id);
    if (merged) {
      ordered.push(merged);
      seen.add(item.id);
    }
  }

  for (const item of cloud) {
    if (!seen.has(item.id)) {
      ordered.push(item);
      seen.add(item.id);
    }
  }

  return ordered;
}

async function resolveCatalogCardHero(item) {
  const hero = item.bgImage || await fetchCatalogHero(item.id);
  if (!hero) return { bgImage: "", bgImageDisplay: "", hasImage: false };
  const bgImageDisplay = await resolveCloudImageSrc(hero);
  return {
    bgImage: hero,
    bgImageDisplay: bgImageDisplay || "",
    hasImage: true,
  };
}

module.exports = {
  decorateCatalogItem,
  mergeCatalogRow,
  mergeLocalAndCloud,
  resolveCatalogCardHero,
};
