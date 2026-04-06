/**
 * Quizzes removed from the product; hide from catalog and refuse to load.
 * Keep in sync with scripts/delete-quizzes-from-cloud.js (IDS_TO_DELETE).
 */

const REMOVED = new Set([
  "city-for-your-soul",
  "your-deep-relationship-with-food",
  "your-perfect-walk-route",
  "breakfast-philosophy",
  "hidden-decision-pattern",
  "intimacy-with-loneliness",
  "love-language-type",
  "regret-coping-style",
  "season-of-your-soul",
  "subconscious-fear",
  "true-relationship-with-procrastination",
  "unspoken-needs",
  "unfinished-childhood-dreams",
  "what-your-intuition-excels-at",
  "your-hidden-talent",
  "your-unique-relationship-with-night",
  "what-your-dreams-reveal",
  "what-your-recent-dreams-reveal",
  "invisible-family-contract",
  "tea-persona",
  "your-writing-style",
  "which-movie-resonates-with-your-heart",
  "your-life-bgm",
  "what-your-style-reveals",
  "ancient-scholar-examination-fate",
  "three-kingdoms-character-match",
  "your-natural-element-connection",
  "your-secret-dialogue-with-stars",
  "ancient-greece-decision-making",
  "ancient-rome-decision-making",
  "chunqiu-zhanguo-choices",
  "late-qing-dynasty-time-travel",
  "ming-dynasty-decision-making",
  "qin-han-historical-crossroads",
  "sheng-tang-chuan-yue-jue-ze",
  "song-dynasty-time-travel",
  "three-kingdoms-decision-style",
  // Merged into sibling quiz (2026-04); keep one id per theme, cloud rows deleted
  "tang-poets",
  "which-tang-poet-lives-in-your-heart",
  "middle-earth-character",
  "wow-survival-philosophy-quiz",
  "anti-affair-resilience-test",
  "love-level-test",
  "自媒体赛道人格测验",
  "自媒体人格原型",
  "ming-dynasty-persona",
]);

function isRemovedQuizId(id) {
  return !!(id && REMOVED.has(id));
}

module.exports = { isRemovedQuizId, REMOVED_QUIZ_IDS: REMOVED };
