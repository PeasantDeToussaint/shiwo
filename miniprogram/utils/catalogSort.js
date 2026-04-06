/**
 * Normalizes CloudBase / JSON catalog timestamps for stable sorting.
 * WeChat may return Date, ISO string, { type, seconds }, etc.
 */

function toMillis(v) {
  if (v == null) return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === "object") {
    if (typeof v.getTime === "function") return v.getTime();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v.milliseconds === "number") return v.milliseconds;
    if (typeof v.$date === "number") return v.$date;
    if (typeof v.$date === "string") {
      const t = Date.parse(v.$date);
      return Number.isNaN(t) ? 0 : t;
    }
  }
  return 0;
}

/** Best-effort “how new is this listing” — prefers _updatedAt so republished quizzes surface. */
function catalogRecencyMillis(item) {
  if (!item || typeof item !== "object") return 0;
  return Math.max(toMillis(item._updatedAt), toMillis(item._createdAt));
}

function catalogTitleKey(item) {
  return String(item.displayTitleZh || item.title || item.id || "");
}

/** Newest first; tie-breaker: Chinese title / id lexical order. */
function compareCatalogByRecencyThenTitle(a, b) {
  const ra = catalogRecencyMillis(a);
  const rb = catalogRecencyMillis(b);
  if (rb !== ra) return rb - ra;
  return catalogTitleKey(a).localeCompare(catalogTitleKey(b), "zh-Hans-CN");
}

function sortCatalogByRecency(items) {
  if (!Array.isArray(items) || items.length < 2) return items ? [...items] : [];
  return [...items].sort(compareCatalogByRecencyThenTitle);
}

module.exports = {
  toMillis,
  catalogRecencyMillis,
  compareCatalogByRecencyThenTitle,
  sortCatalogByRecency,
};
