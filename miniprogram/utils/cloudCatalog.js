/**
 * cloudCatalog.js
 * Fetches quiz catalog entries from the cloud database (quiz_catalog collection).
 *
 * 不做会话级缓存：云库更新（标题、分区、上下架）后，用户下次进列表即可看到最新数据。
 */

const { isRemovedQuizId } = require("./removedQuizIds");

/**
 * Fetch quiz catalog from cloud, optionally filtered by featureId.
 * Returns [] on network/cloud error so local catalog still shows.
 * @param {string} [featureId]
 * @returns {Promise<Array>}
 */
async function fetchCloudCatalog(featureId) {
  try {
    const res = await wx.cloud.callFunction({
      name: "quizWriter",
      data: {
        action: "listCatalog",
        data: featureId ? { featureId } : {},
      },
    });

    const raw = (res.result && res.result.catalog) || [];
    return raw.filter((item) => item && item.id && !isRemovedQuizId(item.id));
  } catch (e) {
    console.warn("[cloudCatalog] fetch failed:", e);
    return [];
  }
}

/** @deprecated 已无内存缓存，保留接口以免旧代码报错 */
function clearCache() {}

module.exports = { fetchCloudCatalog, clearCache };
