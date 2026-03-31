/**
 * Cloud image resolution utilities for WeChat mini programs.
 *
 * Two-step strategy:
 *  1. getTempFileURL  — instant CDN URL; works on real devices once storage
 *     permission is "public read". Set as <image src> immediately.
 *  2. downloadFile    — fallback for devtools (which 403s on unsigned CDN
 *     URLs); bind to <image binderror> so it only triggers on failure.
 *
 * Never pass cloud:// directly to <image src> — devtools render layer treats
 * it as a relative path and tries to load /page/path/cloud://... (500).
 */

const CLOUD_ENV = "cloudbase-4gadl6qo4a9aa95d";

/** In-memory resolved URL cache (survives page transitions within a session) */
const _cache = new Map();

/**
 * Fast: calls getTempFileURL to get a CDN HTTPS URL.
 * Use this to set <image src> immediately.
 * On real devices with public-read storage this will display straight away.
 */
function resolveCloudImageSrc(fileId) {
  return new Promise((resolve) => {
    if (!fileId || typeof fileId !== "string") { resolve(""); return; }
    if (!fileId.startsWith("cloud://")) { resolve(fileId); return; }
    if (_cache.has(fileId)) { resolve(_cache.get(fileId)); return; }
    if (!wx.cloud || typeof wx.cloud.getTempFileURL !== "function") { resolve(""); return; }

    wx.cloud.getTempFileURL({
      fileList: [fileId],
      config: { env: CLOUD_ENV },
      success(res) {
        const item = res.fileList && res.fileList[0];
        const url = item && item.status === 0 && item.tempFileURL;
        const out = url || "";
        _cache.set(fileId, out);
        resolve(out);
      },
      fail(err) {
        console.warn("[resolveCloudImage] getTempFileURL failed:", JSON.stringify(err));
        resolve("");
      },
    });
  });
}

/**
 * Slow fallback: downloads file to a local temp path.
 * Use in <image binderror> handler when the CDN URL 403s (e.g. devtools).
 * Returns a local http://tmp/... path that <image> can always display.
 */
function downloadCloudImageSrc(fileId) {
  return new Promise((resolve) => {
    if (!fileId || typeof fileId !== "string") { resolve(""); return; }
    if (!fileId.startsWith("cloud://")) { resolve(fileId); return; }

    const cached = _cache.get(fileId);
    if (cached && cached.startsWith("http://tmp/")) { resolve(cached); return; }

    if (!wx.cloud || typeof wx.cloud.downloadFile !== "function") { resolve(""); return; }

    wx.cloud.downloadFile({
      fileID: fileId,
      config: { env: CLOUD_ENV },
      success(res) {
        const path = res.tempFilePath || "";
        if (path) _cache.set(fileId, path);
        resolve(path);
      },
      fail(err) {
        console.warn("[resolveCloudImage] downloadFile failed:", JSON.stringify(err));
        resolve("");
      },
    });
  });
}

/**
 * Batch-resolve multiple cloud:// FileIDs via a single getTempFileURL call.
 * Returns Map<fileId, cdnUrl>.
 */
function resolveCloudImageBatch(fileIds) {
  const result = new Map();
  const toFetch = [];

  fileIds.forEach((id) => {
    if (!id) return;
    if (!id.startsWith("cloud://")) { result.set(id, id); return; }
    if (_cache.has(id)) { result.set(id, _cache.get(id)); return; }
    toFetch.push(id);
  });

  if (!toFetch.length) return Promise.resolve(result);
  if (!wx.cloud || typeof wx.cloud.getTempFileURL !== "function") return Promise.resolve(result);

  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: toFetch,
      config: { env: CLOUD_ENV },
      success(res) {
        (res.fileList || []).forEach((item) => {
          const url = item.status === 0 && item.tempFileURL ? item.tempFileURL : "";
          _cache.set(item.fileID, url);
          result.set(item.fileID, url);
        });
        resolve(result);
      },
      fail(err) {
        console.warn("[resolveCloudImage] batch getTempFileURL failed:", JSON.stringify(err));
        resolve(result);
      },
    });
  });
}

module.exports = { resolveCloudImageSrc, downloadCloudImageSrc, resolveCloudImageBatch };
