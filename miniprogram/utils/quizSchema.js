/**
 * Quiz schema — full type definitions.
 *
 * New fields added (all optional, backwards-compatible):
 *   result.token       — 2-4 char identity label (e.g. "守望者"), shown in header
 *   result.boldQuote   — 1-2 sentence punchy assertion, shown as blockquote
 *   result.portrait    — now expects 5-layer narrative (see layer guide below)
 *   result.strengths   — [{label, description}] full 2-3 sentence descriptions
 *   result.weaknesses  — [{label, description}] honest shadow framing
 *
 * Portrait 5-layer structure:
 *   Layer 1: 你是谁 — core definition, dignified name
 *   Layer 2: 你的驱动力 — why you operate this way, inner motivation
 *   Layer 3: 内在矛盾 — your paradox, the light and shadow in you
 *   Layer 4: 常见误解 — how others misread you, your real inner world
 *   Layer 5: 你的潜力 — what you become when you live to your fullest
 */

/**
 * @typedef {Object} QuizCatalogItem
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string[]} tags
 * @property {number} estimatedMinutes
 * @property {number} questionCount
 *
 * @typedef {Object} QuizOption
 * @property {string} id
 * @property {string} label
 * @property {Object.<string, number>} scores
 *
 * @typedef {Object} QuizQuestion
 * @property {string} id
 * @property {string} prompt
 * @property {QuizOption[]} options
 *
 * @typedef {Object} TraitItem
 * @property {string} label      — 1-3 word trait name (e.g. "耐心", "战略思维")
 * @property {string} description — 2-3 sentences; strengths: empowering; weaknesses: honest shadow framing
 *
 * @typedef {Object} QuizResult
 * @property {string}  id
 * @property {string}  title         — result name (e.g. "沃伦·巴菲特")
 * @property {string=} subtitle      — one-line archetype hook (e.g. "价值投资的守望者")
 * @property {string=} token         — 2-4 char identity label shown in wide letter-spacing (e.g. "守望者")
 * @property {string=} boldQuote     — punchy 1-2 sentence assertion, displayed as blockquote before portrait
 * @property {string=} verse         — classical quote / poem matched to this result
 * @property {string=} verseSource   — attribution for the verse
 * @property {string}  portrait      — rich narrative (target: 4-5 paragraphs, 5-layer structure)
 * @property {TraitItem[]=} strengths
 * @property {TraitItem[]=} weaknesses
 * @property {string=} temperament
 * @property {string=} situation
 * @property {string=} career
 * @property {string=} relationships
 * @property {string=} lifeAdvice
 * @property {string=} destiny
 * @property {string=} cardImage    — cloud:// URL of AI-generated result illustration
 * @property {string=} cardAccent   — hex color override for this specific result (e.g. "#d4c088")
 *
 * @typedef {Object} QuizDefinition
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string[]} tags
 * @property {number} estimatedMinutes
 * @property {string} disclaimer
 * @property {{id: string, label: string}[]} dimensions
 * @property {QuizQuestion[]} questions
 * @property {QuizResult[]} results
 */

/**
 * Cloud / generic-question / scoreGeneric 计分族（与 quiz-generator、validate 一致）：
 * - weighted-dimension：累加 raw → 归一化 → 与 dimension_profile **余弦**定结果。
 * - archetype-argmax：累加 raw → 按 results[].primaryDimension 的 **raw 最大**定结果（互斥原型）；非余弦。
 * - bipolar-dimension / level-band：专用计分（见 scoreGeneric 分支）。
 * - two-phase-archetype（仅小程序保留）：须同时有 phase===1 题（scores 键为 A组/B组/C组）与 phase===2 题（branch + 大师维度分）。
 *   无 phase 结构、且要「冠军维度」而非 profile 形状的，标 **archetype-argmax**；要形状匹配才用 weighted-dimension。
 *
 * @typedef {Object} QuizScoring
 * @property {"weighted-dimension"|"archetype-argmax"|"bipolar-dimension"|"level-band"|"two-phase-archetype"|"big-five"|"mbti"} type
 * @property {string[]=} dimensions  — 须与 options[].scores 键一致
 * @property {Object<string,string[]>=} groups — 仅 structured two-phase：branch → 维度名列表
 *
 * level-band：options[].bandPoints（非负整数，优先）参与档位总分；缺省时用该选项 scores 非负分之和。scoring.bands 的 min/max 对「归一化可达分 t」或原始总分（卷面分）见 scoreLevelBand。
 */

module.exports = {};
