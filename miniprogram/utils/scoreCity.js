/**
 * scoreCity.js
 * City recommendation scoring engine.
 *
 * Algorithm:
 *  1. Build userPrefs from all quiz answers (constraints + weighted targets)
 *  2. Hard-filter cities that violate must-have constraints
 *  3. Score remaining cities via weighted match on soft preferences
 *  4. Return top 3 with scores, match %, and explanation bullets
 */

// ─── Normalise a city attribute to [0, 1] ────────────────────────────────────
function normalise(value, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ─── Compute dataset-wide min/max for numeric fields ─────────────────────────
function computeRanges(cities) {
  const numericFields = [
    "avgAnnualPM25", "rentCityCenter1BR", "avgMonthlySalary",
    "avgJanLow", "avgJulHigh", "annualSunshineHours", "rainyDaysPerYear",
    "annualHumidity", "subwayKm", "intlDestinations", "population",
    "tier3HospitalCount", "uni985Count", "uni211Count",
    "paceScore", "nightlifeScore", "spiceLevelScore", "safetyScore",
    "culturalDepthScore", "artsScore", "expatScore", "startupScore",
  ];
  const ranges = {};
  numericFields.forEach(f => {
    let min = Infinity, max = -Infinity;
    cities.forEach(c => {
      const v = c[f];
      if (typeof v === "number" && !isNaN(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    });
    ranges[f] = { min, max };
  });
  return ranges;
}

// ─── Province-to-province distance tier ──────────────────────────────────────
// Returns 0 (same province) → 1 (adjacent) → 2 (same region) → 3 (different)
function distanceTier(originProvince, city) {
  if (!originProvince || originProvince === "overseas" || !city.province) return 3;
  if (city.province === originProvince) return 0;
  if (city.neighboringProvinces && city.neighboringProvinces.includes(originProvince)) return 1;
  if (city.region === _provinceRegion(originProvince)) return 2;
  return 3;
}

// Map province ID → region (mirrors city-full.js PROVINCES)
function _provinceRegion(prov) {
  const map = {
    beijing: "north", tianjin: "north", hebei: "north", shanxi: "north", neimenggu: "north",
    liaoning: "northeast", jilin: "northeast", heilongjiang: "northeast",
    shanghai: "east", jiangsu: "east", zhejiang: "east", anhui: "east",
    fujian: "east", jiangxi: "east", shandong: "east",
    henan: "central", hubei: "central", hunan: "central",
    guangdong: "south", guangxi: "south", hainan: "south",
    chongqing: "southwest", sichuan: "southwest", guizhou: "southwest",
    yunnan: "southwest", xizang: "southwest",
    shaanxi: "northwest", gansu: "northwest", qinghai: "northwest",
    ningxia: "northwest", xinjiang: "northwest",
  };
  return map[prov] || "other";
}

// ─── Match helpers ────────────────────────────────────────────────────────────

// Proximity match: target 0–1 city norm, want it to be high/low
function targetMatch(cityNorm, targetNorm) {
  return 1 - Math.abs(cityNorm - targetNorm);
}

// Spice match: city spice [0–10] vs user target [0–10]
function spiceMatch(citySpice, targetSpice) {
  return 1 - Math.abs(citySpice - targetSpice) / 10;
}

// Pace match: same style
function paceMatch(cityPace, targetPace) {
  return 1 - Math.abs(cityPace - targetPace) / 10;
}

// Size match
function sizeMatch(cityTier, targetSize) {
  if (targetSize === "any") return 0.5;
  const tierMap = { 1: "large", 1.5: "large", 2: "medium", 3: "small" };
  return tierMap[cityTier] === targetSize ? 1 : (Math.abs(cityTier - (targetSize === "large" ? 1 : targetSize === "medium" ? 2 : 3)) <= 0.5 ? 0.5 : 0.1);
}

// Industry match: city.strongIndustries is an array
function industryMatch(city, targetIndustry) {
  if (!targetIndustry || targetIndustry === "remote") return 0.5;
  if (!city.strongIndustries) return 0.3;
  return city.strongIndustries.includes(targetIndustry) ? 1 : 0.1;
}

// Nature match
function natureMatch(city, targetNature) {
  if (targetNature === "any") return 0.5;
  if (targetNature === "mountain") return city.hasMountainNearby ? 1 : 0.1;
  if (targetNature === "coast")    return (city.hasBeach || city.hasCoastline) ? 1 : 0.1;
  if (targetNature === "park")     return 0.6; // most cities have parks
  return 0.5;
}

// Food style match
function foodStyleMatch(city, targetStyle) {
  if (targetStyle === "any") return 0.5;
  if (!city.foodStyles) return 0.3;
  if (targetStyle === "seafood")      return city.foodStyles.includes("seafood") ? 1 : 0.05;
  if (targetStyle === "street")       return city.foodStyles.includes("street_food") ? 1 : 0.4;
  if (targetStyle === "cosmopolitan") return city.expatScore >= 5 ? 1 : normalise(city.expatScore || 0, 0, 10);
  return 0.5;
}

// Climate match
function climateMatch(city, targetClimate) {
  if (!targetClimate) return 0.5;
  const t = targetClimate;
  const ct = city.climateType || "";
  if (t === "mild_spring") {
    // Wants year-round mild: max temp < 30, min temp > 5, rain moderate
    const summerOk = city.avgJulHigh <= 30 ? 1 : city.avgJulHigh <= 34 ? 0.5 : 0;
    const winterOk = city.avgJanLow >= 5 ? 1 : city.avgJanLow >= 2 ? 0.6 : 0;
    return (summerOk + winterOk) / 2;
  }
  if (t === "four_seasons") {
    return (city.hasFourSeasons ? 1 : 0.2);
  }
  if (t === "tropical_warm") {
    return city.avgJanLow >= 8 ? 1 : city.avgJanLow >= 3 ? 0.5 : 0.1;
  }
  if (t === "dry_sunny") {
    const dryScore = city.rainyDaysPerYear <= 80 ? 1 : city.rainyDaysPerYear <= 120 ? 0.5 : 0;
    const sunScore = city.annualSunshineHours >= 2200 ? 1 : city.annualSunshineHours >= 1800 ? 0.5 : 0;
    return (dryScore + sunScore) / 2;
  }
  return 0.5;
}

// Proximity match (origin province → city distance tier)
function proximityMatch(tier, targetProximity) {
  if (targetProximity === "any") return 0.5;
  if (targetProximity === "close")  return [1, 0.7, 0.4, 0.05][tier] || 0.05;
  if (targetProximity === "medium") return [0.6, 1, 0.7, 0.3][tier] || 0.3;
  if (targetProximity === "far")    return [0.05, 0.3, 0.6, 1][tier] || 1;
  return 0.5;
}

// Cost match
function costMatch(city, targetCostLevel, ranges) {
  const norm = normalise(city.rentCityCenter1BR, ranges.rentCityCenter1BR.min, ranges.rentCityCenter1BR.max);
  // norm=0 means cheapest, norm=1 means most expensive
  if (targetCostLevel === "low")         return 1 - norm;
  if (targetCostLevel === "medium")      return 1 - Math.abs(norm - 0.4);
  if (targetCostLevel === "high")        return norm;
  if (targetCostLevel === "constrained") return 1 - norm * 0.5; // mild preference toward cheaper
  return 0.5;
}

// ─── Build userPrefs from quiz answers ───────────────────────────────────────
function buildUserPrefs(questions, allAnswers) {
  const prefs = {
    originProvince: null,
    constraints: {},
    targets: {},
    weights: {},
  };

  questions.forEach(q => {
    const answerId = allAnswers[q.id];
    if (!answerId) return;

    if (q.id === "A1") {
      prefs.originProvince = answerId; // province id
      return;
    }

    const opt = (q.options || []).find(o => o.id === answerId);
    if (!opt || !opt.pref) return;

    // Merge constraints
    if (opt.pref.constraints) {
      Object.assign(prefs.constraints, opt.pref.constraints);
    }
    // Merge targets
    if (opt.pref.targets) {
      Object.assign(prefs.targets, opt.pref.targets);
    }
    // Merge weights
    if (opt.pref.weights) {
      Object.assign(prefs.weights, opt.pref.weights);
    }
  });

  return prefs;
}

// ─── Hard-filter cities ───────────────────────────────────────────────────────
function hardFilter(cities, constraints) {
  return cities.filter(city => {
    const c = constraints;

    if (c.maxPM25Mode === "must" && city.avgAnnualPM25 > c.maxPM25) return false;
    if (c.maxRentMode === "must" && city.rentCityCenter1BR > c.maxRent) return false;
    if (c.requireCoastMode === "must" && c.requireCoast && !city.hasCoastline && !city.hasBeach) return false;
    if (c.minWinterTempMode === "must" && city.avgJanLow < c.minWinterTemp) return false;
    if (c.maxSummerTempMode === "must" && city.avgJulHigh > c.maxSummerTemp) return false;
    if (c.requireSubwayMode === "must" && c.requireSubway && !city.hasSubway) return false;
    if (c.requireIntlAirportMode === "must" && c.requireIntlAirport && !city.hasInternationalAirport) return false;

    return true;
  });
}

// ─── Score a single city ──────────────────────────────────────────────────────
function scoreOneCity(city, prefs, ranges) {
  const { targets, weights, constraints, originProvince } = prefs;
  const breakdown = [];

  function addDim(field, matchVal, label, displayValue) {
    const w = weights[field] || 0;
    if (w === 0) return;
    breakdown.push({ field, label, weight: w, match: matchVal, displayValue });
  }

  // Soft-constraint bonuses (nice-to-have)
  let softBonus = 0;
  if (constraints.requireCoastMode === "nice" && constraints.requireCoast) {
    softBonus += (city.hasCoastline || city.hasBeach) ? 0.5 : 0;
  }
  if (constraints.requireSubwayMode === "nice" && constraints.requireSubway) {
    softBonus += city.hasSubway ? 0.3 : 0;
  }
  if (constraints.requireIntlAirportMode === "nice" && constraints.requireIntlAirport) {
    softBonus += city.hasInternationalAirport ? 0.3 : 0;
  }
  if (constraints.preferSmallCity) {
    softBonus += city.tier >= 3 ? 0.4 : 0;
  }
  if (constraints.preferMountain) {
    softBonus += city.hasMountainNearby ? 0.4 : 0;
  }

  // Spice
  if (weights.spice > 0) {
    const m = spiceMatch(city.spiceLevelScore || 5, targets.spiceLevel || 5);
    addDim("spice", m, "口味辣度", city.spiceLevelScore);
  }
  // Food style
  if (weights.foodStyle > 0) {
    const m = foodStyleMatch(city, targets.foodStyle);
    addDim("foodStyle", m, "美食风格", targets.foodStyle);
  }
  // Pace
  if (weights.pace > 0) {
    const m = paceMatch(city.paceScore || 5, targets.pace || 5);
    addDim("pace", m, "生活节奏", city.paceScore);
  }
  // Nightlife
  if (weights.nightlife > 0) {
    const normN = normalise(city.nightlifeScore || 5, ranges.nightlifeScore.min, ranges.nightlifeScore.max);
    const targetNorm = normalise(targets.nightlife || 5, 0, 10);
    const m = targetMatch(normN, targetNorm);
    addDim("nightlife", m, "夜生活", city.nightlifeScore);
  }
  // Industry
  if (weights.industry > 0) {
    const m = industryMatch(city, targets.industry);
    addDim("industry", m, "职业生态", targets.industry);
  }
  // Nature
  if (weights.nature > 0) {
    const m = natureMatch(city, targets.nature);
    addDim("nature", m, "自然环境", targets.nature);
  }
  // Culture
  if (weights.culture > 0) {
    const normC = normalise(city.culturalDepthScore || 5, ranges.culturalDepthScore.min, ranges.culturalDepthScore.max);
    const targetNorm = normalise(targets.culture || 5, 0, 10);
    const m = targetMatch(normC, targetNorm);
    addDim("culture", m, "文化底蕴", city.culturalDepthScore);
  }
  // City size
  if (weights.citySize > 0) {
    const m = sizeMatch(city.tier, targets.citySize);
    addDim("citySize", m, "城市体量", city.tier);
  }
  // Healthcare
  if (weights.healthcare > 0) {
    const normH = normalise(city.tier3HospitalCount || 0, ranges.tier3HospitalCount.min, ranges.tier3HospitalCount.max);
    const targetNorm = normalise(targets.healthcare || 5, 0, 10);
    const m = targetMatch(normH, targetNorm);
    addDim("healthcare", m, "医疗资源", city.tier3HospitalCount);
  }
  // Education
  if (weights.education > 0) {
    const uniScore = (city.uni985Count || 0) * 3 + (city.uni211Count || 0);
    const normE = normalise(uniScore, 0, 30); // 北京最高约30
    const targetNorm = normalise(targets.education || 5, 0, 10);
    const m = targetMatch(normE, targetNorm);
    addDim("education", m, "教育资源", `${city.uni985Count || 0}所985`);
  }
  // Startup
  if (weights.startup > 0) {
    const normS = normalise(city.startupScore || 3, ranges.startupScore.min, ranges.startupScore.max);
    const targetNorm = normalise(targets.startup || 5, 0, 10);
    const m = targetMatch(normS, targetNorm);
    addDim("startup", m, "创业生态", city.startupScore);
  }
  // Expat
  if (weights.expat > 0) {
    const normEx = normalise(city.expatScore || 2, ranges.expatScore.min, ranges.expatScore.max);
    const targetNorm = normalise(targets.expat || 5, 0, 10);
    const m = targetMatch(normEx, targetNorm);
    addDim("expat", m, "国际化", city.expatScore);
  }
  // Proximity
  if (weights.proximity > 0) {
    const tier = distanceTier(prefs.originProvince, city);
    const m = proximityMatch(tier, targets.proximity);
    addDim("proximity", m, "离家距离", tier);
  }
  // Cost
  if (weights.cost > 0) {
    const m = costMatch(city, targets.costLevel, ranges);
    addDim("cost", m, "生活成本", city.rentCityCenter1BR);
  }
  // Climate
  if (weights.climate > 0) {
    const m = climateMatch(city, targets.climate);
    addDim("climate", m, "气候", targets.climate);
  }

  // Compute weighted sum
  let totalWeight = 0, totalScore = 0;
  breakdown.forEach(d => {
    totalScore += d.weight * d.match;
    totalWeight += d.weight;
  });

  const baseScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;
  const softBonusCapped = Math.min(softBonus * 0.1, 0.15);
  const finalScore = Math.min(1, baseScore + softBonusCapped);

  return { score: finalScore, breakdown };
}

// ─── Build human-readable match reasons ──────────────────────────────────────
const FIELD_LABELS = {
  spice:     "口味辣度",
  foodStyle: "美食风格",
  pace:      "生活节奏",
  nightlife: "夜生活",
  industry:  "职业生态",
  nature:    "自然环境",
  culture:   "文化底蕴",
  citySize:  "城市体量",
  healthcare:"医疗资源",
  education: "教育资源",
  startup:   "创业生态",
  expat:     "国际化",
  proximity: "离家距离",
  cost:      "生活成本",
  climate:   "气候",
};

function buildReasons(city, breakdown, prefs) {
  const sorted = [...breakdown].sort((a, b) => b.weight * b.match - a.weight * a.match);
  const strongMatches = sorted.slice(0, 3).filter(d => d.match >= 0.6).map(d => ({
    field: d.field,
    label: FIELD_LABELS[d.field] || d.label,
    detail: _reasonText(d.field, city, prefs, true),
  }));
  const tradeoffs = sorted.reverse().slice(0, 2).filter(d => d.match < 0.45 && d.weight >= 2).map(d => ({
    field: d.field,
    label: FIELD_LABELS[d.field] || d.label,
    detail: _reasonText(d.field, city, prefs, false),
  }));
  return { strongMatches, tradeoffs };
}

function _reasonText(field, city, prefs, isStrong) {
  const t = prefs.targets;
  switch (field) {
    case "spice":
      return isStrong
        ? `${city.name}的饮食辣度约为 ${city.spiceLevelScore}/10，与你的口味偏好高度契合。`
        : `${city.name}的饮食辣度为 ${city.spiceLevelScore}/10，与你的期望有一定差距。`;
    case "foodStyle":
      return isStrong
        ? `${city.name}在「${t.foodStyle === "seafood" ? "海鲜" : t.foodStyle === "street" ? "街头小吃" : "多元美食"}」方面表现突出。`
        : `${city.name}在你偏好的饮食风格上选择相对有限。`;
    case "pace":
      return isStrong
        ? `${city.name}的生活节奏（${city.paceScore}/10）与你想要的步调非常接近。`
        : `${city.name}的节奏（${city.paceScore}/10）可能比你期望的更${city.paceScore > (t.pace || 5) ? "快" : "慢"}一些。`;
    case "nightlife":
      return isStrong
        ? `${city.name}的夜生活丰富度（${city.nightlifeScore}/10）符合你的期望。`
        : `${city.name}的夜间活动（${city.nightlifeScore}/10）与你的期望存在差距。`;
    case "industry":
      return isStrong
        ? `${city.name}在${_industryName(t.industry)}领域有成熟的行业生态。`
        : `${city.name}在${_industryName(t.industry)}领域的机会相对有限。`;
    case "nature":
      return isStrong
        ? `${city.name}${t.nature === "mountain" ? "靠近山区，周末可以轻松户外" : t.nature === "coast" ? "临海，海岸线资源丰富" : "城市绿化好"}。`
        : `${city.name}在你期望的自然环境类型上稍有欠缺。`;
    case "culture":
      return isStrong
        ? `${city.name}文化底蕴深厚（${city.culturalDepthScore}/10），历史遗存丰富。`
        : `${city.name}相对现代，历史文化积淀不如古都城市。`;
    case "citySize":
      return isStrong
        ? `${city.name}的城市体量（${_tierName(city.tier)}）与你的偏好匹配。`
        : `${city.name}的规模可能比你理想中的更${city.tier <= 1.5 ? "大" : "小"}一些。`;
    case "healthcare":
      return isStrong
        ? `${city.name}拥有 ${city.tier3HospitalCount} 所三甲医院，医疗资源充足。`
        : `${city.name}的三甲医院数量（${city.tier3HospitalCount} 所）低于你的期望。`;
    case "education":
      return isStrong
        ? `${city.name}高校资源丰富，拥有 ${city.uni985Count || 0} 所 985 院校。`
        : `${city.name}的高等教育资源（${city.uni985Count || 0} 所 985）略显有限。`;
    case "startup":
      return isStrong
        ? `${city.name}的创业/科技生态（${city.startupScore}/10）在你的候选城市中名列前茅。`
        : `${city.name}的创业生态相对薄弱，适合寻求稳定的人群。`;
    case "expat":
      return isStrong
        ? `${city.name}的国际化程度（${city.expatScore}/10）符合你的需求。`
        : `${city.name}国际化程度较低，更适合深度融入本地生活。`;
    case "proximity":
      return isStrong
        ? `${city.name}离你的家乡很近，方便探亲。`
        : `${city.name}距离你的家乡较远，回家需要较长时间。`;
    case "cost":
      return isStrong
        ? `${city.name}的生活成本（市中心1BR月租约 ${city.rentCityCenter1BR} 元）符合你的预算期望。`
        : `${city.name}的生活成本（月租约 ${city.rentCityCenter1BR} 元）高于你的理想区间。`;
    case "climate":
      return isStrong
        ? `${city.name}的气候（${_climateName(t.climate)}）与你的偏好高度吻合。`
        : `${city.name}的气候条件与你的期望有一定差距。`;
    default:
      return "";
  }
}

function _industryName(ind) {
  return { tech: "科技/互联网", finance: "金融/商务", creative: "创意/文化", remote: "远程工作" }[ind] || ind;
}
function _tierName(tier) {
  return { 1: "一线", 1.5: "新一线", 2: "二线", 3: "三线" }[tier] || tier;
}
function _climateName(c) {
  return { mild_spring: "四季如春", four_seasons: "四季分明", tropical_warm: "温热湿润", dry_sunny: "干燥阳光" }[c] || c;
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * @param {Object}   quizData   — city-full.js module
 * @param {Object}   allAnswers — { [questionId]: optionId | provinceId }
 * @param {Array}    cityData   — city-data.js array of city objects
 * @returns {Array}  top3 — array of up to 3 result objects
 */
function scoreCity(quizData, allAnswers, cityData) {
  const prefs = buildUserPrefs(quizData.questions, allAnswers);
  const ranges = computeRanges(cityData);

  // Hard filter
  let pool = hardFilter(cityData, prefs.constraints);

  // If hard filter is too aggressive (< 5 cities), relax must→nice for non-critical constraints
  if (pool.length < 5) {
    const relaxed = Object.assign({}, prefs.constraints);
    ["maxPM25Mode", "maxRentMode", "minWinterTempMode", "maxSummerTempMode"].forEach(k => {
      if (relaxed[k] === "must") relaxed[k] = "nice";
    });
    pool = hardFilter(cityData, relaxed);
  }

  // Score
  const scored = pool.map(city => {
    const { score, breakdown } = scoreOneCity(city, prefs, ranges);
    const { strongMatches, tradeoffs } = buildReasons(city, breakdown, prefs);
    return {
      city,
      score,
      matchPercent: Math.round(score * 100),
      strongMatches,
      tradeoffs,
      snapshot: {
        rent: city.rentCityCenter1BR,
        pm25: city.avgAnnualPM25,
        winterTemp: city.avgJanLow,
        summerTemp: city.avgJulHigh,
        pace: city.paceScore,
        hasBeach: city.hasBeach || city.hasCoastline || false,
        hasMountain: city.hasMountainNearby || false,
        hasSubway: city.hasSubway || false,
        subwayKm: city.subwayKm || 0,
        tier: city.tier,
        province: city.province,
      },
    };
  });

  // Rank and return top 3
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

module.exports = scoreCity;
