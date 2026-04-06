/**
 * Product taxonomy: 15 resultType slugs. Legacy 8 values map here and are
 * only used via templateStem() for portrait/field templates — not parallel enums.
 */

const RESULT_TYPES_14 = [
  "figure_character",
  "animal_creature",
  "plant",
  "food_beverage",
  "color",
  "nature_celestial",
  "object_accessory",
  "abstract_psychology",
  "place_domain",
  "occupation_role",
  "style_type",
  "occult_symbol",
  "organization_brand",
  "behavior_pattern",
  "tier_level",
];

const LEGACY_TO_14 = {
  figure: "figure_character",
  fictional_figure: "figure_character",
  creature: "animal_creature",
  item: "object_accessory",
  place: "place_domain",
  scene: "behavior_pattern",
  archetype: "abstract_psychology",
  band: "tier_level",
};

/** Product slug → legacy keys used by PORTRAIT_TEMPLATE / defaultFieldObjs / portraitStructure */
const TEMPLATE_STEM = {
  figure_character: "figure",
  animal_creature: "creature",
  plant: "item",
  food_beverage: "item",
  color: "archetype",
  nature_celestial: "archetype",
  object_accessory: "item",
  abstract_psychology: "archetype",
  place_domain: "place",
  occupation_role: "archetype",
  style_type: "archetype",
  occult_symbol: "archetype",
  organization_brand: "item",
  behavior_pattern: "scene",
  tier_level: "band",
};

const TYPE_LABEL_ZH = {
  figure_character: "人物/角色（Figure / Character，真实人物或 IP 中有姓名的角色）",
  animal_creature: "动物/生物（Animal / Creature，物种或作品内种族/神兽通用名）",
  plant: "植物（Plant）",
  food_beverage: "食物/饮品（Food / Beverage）",
  color: "颜色（Color）",
  nature_celestial: "自然现象/天文（Natural Phenomena / Celestial）",
  object_accessory: "物品/配饰（Object / Accessory）",
  abstract_psychology: "抽象概念/心理原型（Abstract / Archetype）",
  place_domain: "地点/领域（Place / Domain，真实地名或作品内领域/分院等）",
  occupation_role: "职业/角色（Occupation / Role，职场或叙事中的身份）",
  style_type: "风格/类型（Style / Type）",
  occult_symbol: "玄学/符号（Occult / Symbol）",
  organization_brand: "机构/组织/品牌（Organization / Brand，真实或作品内可识别的组织、社团、品牌名）",
  behavior_pattern: "行为模式（Behavior Pattern，可想象的具体场面标题）",
  tier_level: "量化等级（Tier / Level，仅配合 level-band）",
};

const SET_14 = new Set(RESULT_TYPES_14);

/** Types that require name + nameContext on each architecture result (anti-vague). */
const NAME_CONTEXT_REQUIRED = new Set([
  "figure_character",
  "animal_creature",
  "plant",
  "food_beverage",
  "color",
  "nature_celestial",
  "object_accessory",
  "abstract_psychology",
  "place_domain",
  "occupation_role",
  "style_type",
  "occult_symbol",
  "organization_brand",
  "behavior_pattern",
  "tier_level",
]);

function isResultType14(v) {
  return typeof v === "string" && SET_14.has(v.trim());
}

function normalizeResultType(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (SET_14.has(s)) return s;
  if (LEGACY_TO_14[s]) return LEGACY_TO_14[s];
  return null;
}

/** Mutates architecture.resultType to a 14 slug when recognized; returns errors if not. */
function normalizeArchitectureResultTypeInPlace(architecture) {
  const errors = [];
  if (!architecture || typeof architecture !== "object") return errors;
  const raw = architecture.resultType;
  if (raw == null || raw === "") {
    architecture.resultType = "abstract_psychology";
    return errors;
  }
  const n = normalizeResultType(raw);
  if (!n) {
    errors.push(
      `resultType must be one of [${RESULT_TYPES_14.join(", ")}] or legacy {figure, fictional_figure, item, place, creature, scene, archetype, band} (got ${JSON.stringify(raw)})`
    );
    return errors;
  }
  architecture.resultType = n;
  return errors;
}

function templateStem(rt14) {
  return TEMPLATE_STEM[rt14] || "archetype";
}

function typeLabelZh(rt14) {
  return TYPE_LABEL_ZH[rt14] || rt14;
}

function validateResultType14WithScoring(resultType14, scoringFamily) {
  const errors = [];
  if (!isResultType14(resultType14)) {
    errors.push(
      `resultType must be one of: ${RESULT_TYPES_14.join(", ")} (legacy eight values are auto-mapped)`
    );
    return errors;
  }
  if (resultType14 === "tier_level" && scoringFamily !== "level-band") {
    errors.push(`resultType "tier_level" requires scoringFamily "level-band" (got ${JSON.stringify(scoringFamily)})`);
  }
  if (resultType14 !== "tier_level" && scoringFamily === "level-band") {
    errors.push(
      `scoringFamily "level-band" requires resultType "tier_level" (got ${JSON.stringify(resultType14)})`
    );
  }
  return errors;
}

function outlineRulesForResultType14(rt) {
  const rtNorm = normalizeResultType(rt) || rt;
  const titleLine = (suffix) => `- title 以结果名称为核心${suffix}`;
  const verseItemLike =
    "- verse 是一句与该结果直接相关的 quote：电影台词、歌词、现代诗、作家金句均可——须与交付物高度相关，禁止泛泛人生感怀。除非主题明确古典语境，否则禁止古诗词";

  if (rtNorm === "figure_character") {
    return {
      typeLabel: typeLabelZh("figure_character"),
      titleHint: titleLine("（真实人物真名或 IP 通用角色名；禁止自创象征名顶替角色名）"),
      verseBlock:
        "- verse：真实人物优先其本人诗词或史评；IP 角色优先台词/作品金句（verseSource 填作品）。禁止无关古诗词、佛学偈语顶替史实。",
    };
  }
  if (rtNorm === "animal_creature") {
    return {
      typeLabel: typeLabelZh("animal_creature"),
      titleHint: titleLine("（须为物种或种族的通用名，如「柴犬」「狼」「暗夜精灵」；禁止纯抽象性格词当标题）"),
      verseBlock: "- verse 与「该生物/种族的习性或叙事气质」强相关，可神话/自然文学；禁止空洞鸡汤",
    };
  }
  if (rtNorm === "plant" || rtNorm === "food_beverage" || rtNorm === "object_accessory") {
    const label =
      rtNorm === "plant"
        ? typeLabelZh("plant")
        : rtNorm === "food_beverage"
          ? typeLabelZh("food_beverage")
          : typeLabelZh("object_accessory");
    return {
      typeLabel: label,
      titleHint: titleLine("（直接使用具体名称，如物种名、食物名、物品名）"),
      verseBlock: verseItemLike,
    };
  }
  if (rtNorm === "color") {
    return {
      typeLabel: typeLabelZh("color"),
      titleHint: titleLine("（颜色或色系名称，禁止空洞四字格）"),
      verseBlock: "- verse 与色彩意象、视觉文化或情绪氛围强相关；禁止泛泛格言",
    };
  }
  if (rtNorm === "nature_celestial") {
    return {
      typeLabel: typeLabelZh("nature_celestial"),
      titleHint: titleLine("（现象或天体/天象的通用名，如「极光」「梅雨」「满月」）"),
      verseBlock: "- verse 与自然描写、科学诗意、现代诗或歌词强相关；非古典主题禁止古诗词堆砌",
    };
  }
  if (rtNorm === "abstract_psychology") {
    return {
      typeLabel: typeLabelZh("abstract_psychology"),
      titleHint: titleLine("（如「翡翠」「猫系恋人」等有质感的意象名）"),
      verseBlock:
        "- verse 是一句与该原型气质契合的 quote：优先现代名言、电影台词、歌词、现代诗；非古典主题禁止古诗词",
    };
  }
  if (rtNorm === "place_domain") {
    return {
      typeLabel: typeLabelZh("place_domain"),
      titleHint: titleLine("（须为真实地名或作品内公认领域名；禁止抽象意象替代地名）"),
      verseBlock: "- verse 须与「该地点/领域的文化或叙事气质」强相关；禁止与交付物无关的泛格言",
    };
  }
  if (rtNorm === "occupation_role") {
    return {
      typeLabel: typeLabelZh("occupation_role"),
      titleHint: titleLine("（职业名或叙事身份名，两两可区分）"),
      verseBlock: verseItemLike,
    };
  }
  if (rtNorm === "style_type") {
    return {
      typeLabel: typeLabelZh("style_type"),
      titleHint: titleLine("（风格或类型名，禁止「外向型」等性格测试套话）"),
      verseBlock: verseItemLike,
    };
  }
  if (rtNorm === "occult_symbol") {
    return {
      typeLabel: typeLabelZh("occult_symbol"),
      titleHint: titleLine("（符号、牌面、阵营、命理意象等可识别名称）"),
      verseBlock: "- verse 与玄学/神话/叙事语境契合；禁止空洞鸡汤",
    };
  }
  if (rtNorm === "organization_brand") {
    return {
      typeLabel: typeLabelZh("organization_brand"),
      titleHint: titleLine(
        "（真实公司/机构/非营利组织/社团简称，或公认消费品牌、作品内组织通用名；禁止用纯隐喻四字格代替可识别名称）"
      ),
      verseBlock: `${verseItemLike}\n- verse 可与该组织的公开叙事、品牌主张或与交付物强相关的金句挂钩；禁止泛泛鸡汤`,
    };
  }
  if (rtNorm === "behavior_pattern") {
    return {
      typeLabel: typeLabelZh("behavior_pattern"),
      titleHint: titleLine("（如「雨夜阳台的长谈」「周末市集牵手闲逛」；禁止纯四字隐喻恋语）"),
      verseBlock: "- verse 贴合该场面的情绪或氛围；优先现代引言，禁止泛泛格言，非古典主题禁止古诗词",
    };
  }
  if (rtNorm === "tier_level") {
    return {
      typeLabel: typeLabelZh("tier_level"),
      titleHint: titleLine("（同一连续谱上弱→强可排序的档位名；禁止历史人物/明星姓名）"),
      verseBlock: "- verse 可略短，贴合该档张力；禁止临床诊断式句子",
    };
  }
  return {
    typeLabel: typeLabelZh("abstract_psychology"),
    titleHint: titleLine("（如「翡翠」「猫系恋人」）"),
    verseBlock:
      "- verse 是一句与该原型气质契合的 quote：优先现代名言、电影台词、歌词、现代诗；非古典主题禁止古诗词",
  };
}

/**
 * Explore catalog bucket. Preserves legacy ordering: some resultTypes short-circuit
 * before the shared text heuristics (same as pre-14 inferFeatureId).
 */
function inferFeatureIdFromOutline(outlineLike) {
  const rawRt = outlineLike?.architectureResultType;
  const legacyRt = rawRt == null || rawRt === "" ? "abstract_psychology" : rawRt;
  const resultType = normalizeResultType(legacyRt) || legacyRt;

  if (legacyRt === "scene" || resultType === "behavior_pattern") return "relationship";
  if (legacyRt === "band" || resultType === "tier_level") return "psychology";
  if (legacyRt === "fictional_figure") return "ip";
  if (legacyRt === "place" || resultType === "place_domain") return "lifestyle";
  if (legacyRt === "creature" || resultType === "animal_creature") return "lifestyle";

  const raw = [
    outlineLike?.id,
    outlineLike?.title,
    outlineLike?.subtitle,
    outlineLike?.eyebrow,
    outlineLike?.description,
    outlineLike?.aestheticContext,
  ]
    .filter(Boolean)
    .join(" ");
  const lower = raw.toLowerCase();
  const has = (re) => re.test(raw) || re.test(lower);

  if (has(/mbti|16人格|十六人格|大五|九型|enneagram|八维/i)) return "classics";
  if (has(/春节|中秋|端午|元宵|七夕|腊八|清明|重阳|圣诞|新年|万圣节|感恩节|节日专题|节令|年货|拜年|年夜饭|春运/)) return "festival";
  if (has(/方言|口音|粤语|闽南|客家话|哪座城|哪座城市|城市气质|城市人格|都市气质|地域|同乡|地名|目的地|dialect/)) return "lifestyle";
  if (has(/\bcity\b/) && has(/城|方言|旅行|目的/)) return "lifestyle";
  if (has(/职场|职业|事业|面试|同事|领导|下属|晋升|跳槽|薪资|加班|管理风格|管理团队|创业|自由职业|工作方式|职业生涯|career|职业倾向|aptitude|适合.*(工作|职业|岗位|赛道|行业)/)) return "career";
  if (has(/思维|逻辑|判断|决策|认知|思考方式|推理|理性|直觉|批判性|脑力|认知偏差/)) return "cognition";
  if (has(/恋爱|爱情|浪漫|伴侣|恋人|夫妻|婚恋|约会|亲密|暧昧|出轨|外遇|忠诚|依恋|桃花运|亲密关系|理想型|前任|脱单|cp\b|情侣|情人节/)) return "relationship";
  if (has(/《[^》]{1,24}》/) && has(/角色|人物|谁最像|中的你|世界观|原著|番剧|剧集|联动|dlc|ip\b/i)) return "ip";
  if (has(/lordoftherings|lord.*rings|warcraft|wow|harry\s*potter|genshin|honkai|onepiece|one\s*piece|naruto|marvel|starwars|star\s*wars|tolkien|原神|星穹|宝可梦|塞尔达|最终幻想|权力的游戏|冰与火|霍格沃茨|魔法世界|甄嬛传|三生三世|金庸|古龙|水浒|红楼梦|西游|三国|三国演义|魔兽|中土|魔戒|指环王/)) return "ip";
  if (has(/神话|图腾|塔罗|星盘|阵营|门派|学院分|四大学院|魔兽.*种族|元素(系|灵)|宿命|神话人物|神格|星座.*配对|分院帽/)) return "archetype";
  if (has(/历史人物|朝代|帝王|宰相|将领|盛世|唐宋元明清|[唐宋元明清]朝|唐诗|宋词|诗词人|民国女性|民国人物|考古|史实|科举|殿试/)) return "history";
  if (has(/审美|艺术|画家|绘画|电影|戏剧|舞蹈|音乐|香水|perfume|literary|时装|穿搭美学/)) return "aesthetics";
  if (has(/诗人|词人|作家|文学/) && !has(/历史人物|朝代|唐宋元明清|民国|科举|你和哪位|最像哪|气质相符/)) return "aesthetics";
  if (has(/宠物|运动|健身|美食|厨房|天气|寺庙|穿搭|家务|作息|sport|pet|生活方式|养生|旅行|出游|度假|temple/)) return "lifestyle";
  if (has(/心理|人格|性格|冲突|友谊|人际|社交|人生哲学|价值观|哲学|情绪|压力|内心|灵魂|自我|philosophy|psychology|边界|讨好型/) && !has(/原型探索|神话|塔罗|阵营|门派/)) return "psychology";

  if (resultType === "organization_brand") {
    if (has(/霍格沃茨|符文之地|中土|星穹|原神|海贼|晓组织|晓\b|复联|神盾局|九头蛇|marvel|dc\b|魔法部|学院|分院帽/i)) return "ip";
    if (has(/职场|企业文化|组织架构|领导力|团队|招聘|创业|大厂|编制|offer|管理风格/i)) return "career";
    if (has(/品牌|奢侈|潮牌|联名|logo|视觉识别|包装设计|slogan/i)) return "aesthetics";
    return "lifestyle";
  }

  if (resultType === "figure_character" || legacyRt === "figure") return "history";
  if (resultType === "object_accessory" || legacyRt === "item") return "lifestyle";
  return "psychology";
}

function phase0ResultTypeEnumLine() {
  return RESULT_TYPES_14.join(" | ");
}

function nameSimilarityMatchThresholdForResultType(rt14) {
  const rt = normalizeResultType(rt14) || rt14;
  return rt === "figure_character" ? 0.75 : 0.6;
}

module.exports = {
  RESULT_TYPES_14,
  LEGACY_TO_14,
  SET_14,
  NAME_CONTEXT_REQUIRED,
  isResultType14,
  normalizeResultType,
  normalizeArchitectureResultTypeInPlace,
  templateStem,
  typeLabelZh,
  validateResultType14WithScoring,
  outlineRulesForResultType14,
  inferFeatureIdFromOutline,
  phase0ResultTypeEnumLine,
  nameSimilarityMatchThresholdForResultType,
};
