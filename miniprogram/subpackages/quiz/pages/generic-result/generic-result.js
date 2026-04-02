const { fetchCloudQuiz } = require("../../utils/cloudQuizLoader");
const { resolveTheme, buildThemeFromAccent, toCssVarString } = require("../../../../utils/themePresets");
const { resolveCloudImageSrc } = require("../../../../utils/resolveCloudImage");

const BORDERLINE_THRESHOLD = 0.06;
const RADAR_MAX_AXES = 8;
const RADAR_MIN_AXES = 3;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 201, g: 169, b: 106 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

Page({
  data: {
    quiz: null,
    result: null,
    dimensionBars: [],
    hasUserScores: false,
    borderlineTitle: "",
    hasRadarData: false,
    hasRadarProfile: false,
    radarReady: false,
    hasCardImage: false,
    cardImageUrl: "",
    hasVerse: false,
    hasBoldQuote: false,
    hasStrengths: false,
    hasWeaknesses: false,
    hasBars: false,
    hasLevelBands: false,
    levelBands: [],
    levelProgressPct: 0,
    levelBandsLabel: "",
    levelLineEdgePct: 10,
    otherResults: [],
    pageThemeStyle: "",
    mounted: false,
    loading: true,
  },

  _canvasReady: false,
  _radarData: null,
  _radarRetryCount: 0,
  _accentHex: "#8ab0c8",

  onLoad(options) {
    const { quizId, resultId } = options;
    this._shareOptions = options;

    const app = getApp();
    const pending = (app.globalData || {})._pendingResult || {};
    if (app.globalData) app.globalData._pendingResult = null;

    this._pendingNormalized = pending.normalized || null;
    const urlScores = options.sc ? this._decodeScores(options.sc) : null;

    fetchCloudQuiz(quizId).then((quiz) => {
      const result = (quiz.results || []).find((r) => r.id === resultId) || quiz.results[0];

      let theme = resolveTheme({ themeKey: quiz.themeKey || "default" });
      if (result.cardAccent) {
        theme = buildThemeFromAccent(result.cardAccent);
      }

      const normalizedSource = pending.normalized || urlScores || null;
      const hasUserScores = !!normalizedSource;
      const dimensionBars = this._buildBars(quiz, normalizedSource || result.dimension_profile);
      const borderlineTitle = this._detectBorderline(pending.ranked);
      const radarData = this._buildRadarData(quiz, normalizedSource, pending.ranked, result);

      this._radarData = radarData;
      this._radarRetryCount = 0;
      this._accentHex = theme.accent || "#8ab0c8";

      const otherResults = (quiz.results || []).map((r) => ({
        id: r.id,
        title: r.title || "",
        token: r.token || "",
        isCurrent: r.id === resultId,
      }));

      const levelBandsData = this._buildLevelBands(quiz, resultId);
      const scoringType = ((quiz || {}).scoring || {}).type || "weighted-dimension";

      this.setData({
        quiz,
        result,
        dimensionBars,
        hasUserScores,
        borderlineTitle,
        hasRadarData: radarData.user.length >= RADAR_MIN_AXES,
        hasRadarProfile: radarData.hasProfile || false,
        radarReady: false,
        hasVerse: !!(result.verse),
        hasBoldQuote: !!(result.boldQuote),
        hasStrengths: !!(result.strengths && result.strengths.length),
        hasWeaknesses: !!(result.weaknesses && result.weaknesses.length),
        hasBars: dimensionBars.length > 0,
        isBipolar: scoringType === "bipolar-dimension",
        hasLevelBands: !!(levelBandsData && levelBandsData.bands.length > 0),
        levelBands: levelBandsData ? levelBandsData.bands : [],
        levelProgressPct: levelBandsData ? levelBandsData.progressPct : 0,
        levelBandsLabel: levelBandsData ? levelBandsData.label : "",
        levelLineEdgePct: levelBandsData ? levelBandsData.lineEdgePct : 10,
        otherResults,
        pageThemeStyle: toCssVarString(theme),
        loading: false,
      }, () => {
        this._tryDrawRadar();
      });

      if (result.cardImage) {
        resolveCloudImageSrc(result.cardImage).then((url) => {
          if (url) this.setData({ cardImageUrl: url, hasCardImage: true });
        });
      }
    }).catch((e) => {
      console.error("[generic-result] load failed:", e);
      wx.showToast({ title: "结果加载失败", icon: "none" });
      this.setData({ loading: false });
    });
  },

  _dimEntry(dim) {
    if (typeof dim === "string") return { id: dim, label: dim };
    return { id: dim.id || "", label: dim.label || dim.id || "" };
  },

  _buildBars(quiz, normalized) {
    if (!normalized) return [];
    const dimensions = (quiz.scoring || {}).dimensions || [];
    const scoringType = (quiz.scoring || {}).type || "weighted-dimension";
    const axesMap = {};
    ((quiz.scoring || {}).dimensionAxes || []).forEach(a => {
      axesMap[a.dimension] = a;
    });
    const peakValue = dimensions.reduce((max, dim) => {
      const { id } = this._dimEntry(dim);
      return Math.max(max, normalized[id] || 0);
    }, 0) || 1;
    const bars = dimensions.map((dim) => {
      const { id, label } = this._dimEntry(dim);
      const axis = axesMap[id] || {};
      const value = normalized[id];
      if (scoringType === "bipolar-dimension") {
        const safe = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0.5;
        const highPct = Math.round(safe * 100);
        const lowPct = 100 - highPct;
        const lowLabel = axis.lowPole || "低极";
        const highLabel = axis.highPole || label;
        const dominantSide = highPct >= lowPct ? "high" : "low";
        const fillPct = Math.round(Math.abs(safe - 0.5) * 100);
        const dominantLabel = dominantSide === "high" ? highLabel : lowLabel;
        const dominantPct = dominantSide === "high" ? highPct : lowPct;
        return {
          centered: true,
          label,
          pct: dominantPct,
          dominantLabel,
          dominantPct,
          dominantSummary: `${dominantLabel} ${dominantPct}%`,
          dominantSide,
          fillPct,
          fillLeft: dominantSide === "high" ? 50 : Math.max(0, 50 - fillPct),
          markerLeft: Math.round(safe * 100),
          axisLabel: axis.axisLabel || "",
          lowLabel,
          lowPct,
          highLabel,
          highPct,
          lowPole: lowLabel,
          insight: dominantSide === "high"
            ? (axis.highInsight || axis.insight || "")
            : (axis.lowInsight || lowLabel || ""),
        };
      }
      return {
        label: axis.highPole || label,
        pct: Math.round(((value || 0) / peakValue) * 100),
        rawPct: Math.round((value || 0) * 100),
        axisLabel: axis.axisLabel || "",
        lowPole: axis.lowPole || "",
        insight: axis.highInsight || axis.insight || "",
      };
    });
    bars.sort((a, b) => {
      if (a.centered || b.centered) return (b.fillPct || 0) - (a.fillPct || 0);
      return (b.pct || 0) - (a.pct || 0);
    });
    if (bars.length > 0) {
      bars[0].dominant = true;
      // For weighted-dimension bars without pole labels, only the top bar shows insight (reduce clutter).
      // Bars with lowPole defined are bipolar in nature and always show their insight.
      if (scoringType !== "bipolar-dimension") {
        bars.forEach((b, i) => { if (i > 0 && !b.lowPole) b.insight = ""; });
      }
    }
    return bars;
  },

  _buildLevelBands(quiz, resultId) {
    const scoring = quiz.scoring || {};
    if (scoring.type !== "level-band") return null;

    let results = (quiz.results || []).slice();
    if (results.some((r) => typeof r.levelRank === "number")) {
      results.sort((a, b) => (a.levelRank || 0) - (b.levelRank || 0));
    }

    const total = results.length;
    if (total === 0) return null;

    const currentIdx = results.findIndex((r) => r.id === resultId);
    const progressPct = total > 1 && currentIdx >= 0
      ? Math.round((currentIdx / (total - 1)) * 100)
      : (currentIdx === 0 ? 0 : 100);
    const lineEdgePct = Math.round(100 / total / 2);

    return {
      bands: results.map((r, i) => ({
        id: r.id,
        tier: r.tier || r.title || "",
        isCurrent: i === currentIdx,
        isPassed: i < currentIdx,
      })),
      progressPct,
      label: scoring.levelLabel || "段位",
      lineEdgePct,
    };
  },

  _encodeScores(quiz, normalized) {
    if (!normalized) return "";
    const dims = ((quiz.scoring || {}).dimensions || []);
    if (!dims.length) return "";
    return dims
      .map((dim) => {
        const { id } = this._dimEntry(dim);
        return `${encodeURIComponent(id)}:${Math.round((normalized[id] || 0) * 100)}`;
      })
      .join(",");
  },

  _decodeScores(sc) {
    try {
      const normalized = {};
      sc.split(",").forEach((part) => {
        const idx = part.lastIndexOf(":");
        if (idx < 1) return;
        const dim = decodeURIComponent(part.slice(0, idx));
        const pct = parseInt(part.slice(idx + 1), 10);
        if (dim && !isNaN(pct)) normalized[dim] = pct / 100;
      });
      return Object.keys(normalized).length ? normalized : null;
    } catch (_) {
      return null;
    }
  },

  _detectBorderline(ranked) {
    if (!ranked || ranked.length < 2) return "";
    const gap = ranked[0].score - ranked[1].score;
    return gap < BORDERLINE_THRESHOLD ? ranked[1].title : "";
  },

  onReady() {
    this._canvasReady = true;
    setTimeout(() => {
      this.setData({ mounted: true });
      this._tryDrawRadar();
    }, 120);
  },

  _tryDrawRadar() {
    const rd = this._radarData;
    if (!this._canvasReady || !rd || rd.user.length < RADAR_MIN_AXES) return;
    const accentHex = this._accentHex;

    try {
      const ctx = wx.createCanvasContext("radarCanvas", this);
      this._renderRadar(ctx, 240, 240, rd.user, rd.profile, accentHex);
      ctx.draw(false, () => this.setData({ radarReady: true }));
    } catch (e) {
      if (this._radarRetryCount < 8) {
        this._radarRetryCount += 1;
        setTimeout(() => this._tryDrawRadar(), 100);
      } else {
        console.error("[generic-result] radar draw failed:", e);
      }
    }
  },

  // Returns { user: [...], profile: [...] } — both arrays share the same axis order.
  // "user" = user's actual normalized scores; "profile" = result's dimension_profile.
  // If no user data is available, render result profile only and omit the ghost comparison layer.
  _buildRadarData(quiz, normalized, ranked, result) {
    const scoringType = ((quiz || {}).scoring || {}).type || "weighted-dimension";
    const dimensions = ((quiz || {}).scoring || {}).dimensions || [];
    const empty = { user: [], profile: [] };

    if (scoringType === "bipolar-dimension" || scoringType === "level-band") return empty;
    if (dimensions.length < RADAR_MIN_AXES) return empty;

    const resultProfile = (result || {}).dimension_profile || null;

    // Build axes ordered by user score desc (or profile desc as fallback)
    const source = normalized || resultProfile;
    if (!source) return empty;

    const rows = dimensions
      .map((dim) => {
        const { id, label } = this._dimEntry(dim);
        return { id, label, userVal: normalized ? (normalized[id] || 0) : 0, profileVal: resultProfile ? (resultProfile[id] || 0) : 0 };
      })
      .sort((a, b) => (b.userVal || b.profileVal) - (a.userVal || a.profileVal))
      .slice(0, RADAR_MAX_AXES);

    const userPeak = rows.reduce((m, r) => Math.max(m, r.userVal), 0);
    const profilePeak = rows.reduce((m, r) => Math.max(m, r.profileVal), 0);

    if (userPeak <= 0 && profilePeak <= 0) return empty;

    const userPoints = rows.map((r) => ({
      label: (r.label || "").slice(0, 4),
      value: userPeak > 0 ? r.userVal / userPeak : r.profileVal / (profilePeak || 1),
    }));
    const profilePoints = rows.map((r) => ({
      label: (r.label || "").slice(0, 4),
      value: profilePeak > 0 ? r.profileVal / profilePeak : r.userVal / (userPeak || 1),
    }));

    return {
      user: userPoints,
      profile: normalized ? profilePoints : [],
      hasProfile: !!(normalized && resultProfile && profilePeak > 0),
    };
  },

  // userPoints  — user's actual scores (foreground, accent color)
  // profilePoints — result's ideal profile (background ghost, white)
  _renderRadar(ctx, W, H, userPoints, profilePoints, accentHex) {
    const n = userPoints.length;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - 40;
    const TAU = 2 * Math.PI;
    const startAngle = -Math.PI / 2;
    const { r, g, b } = hexToRgb(accentHex);

    const pt = (data, i, ratio) => ({
      x: cx + R * ratio * Math.cos(startAngle + (i / n) * TAU),
      y: cy + R * ratio * Math.sin(startAngle + (i / n) * TAU),
    });

    // Grid rings
    [0.25, 0.5, 0.75, 1.0].forEach((ring) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pt(null, i, ring);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.setStrokeStyle(ring === 1.0 ? `rgba(${r},${g},${b},0.2)` : "rgba(255,255,255,0.05)");
      ctx.setLineWidth(ring === 1.0 ? 1 : 0.5);
      ctx.stroke();
    });

    // Axis spokes
    for (let i = 0; i < n; i++) {
      const p = pt(null, i, 1.0);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.setStrokeStyle("rgba(255,255,255,0.07)");
      ctx.setLineWidth(0.5);
      ctx.stroke();
    }

    // Layer 1: result profile ghost (white, low opacity)
    const hasProfile = profilePoints && profilePoints.length === n;
    if (hasProfile) {
      ctx.beginPath();
      profilePoints.forEach(({ value }, i) => {
        const p = pt(null, i, value);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.setFillStyle("rgba(255,255,255,0.06)");
      ctx.fill();
      ctx.setStrokeStyle("rgba(255,255,255,0.25)");
      ctx.setLineWidth(1);
      ctx.stroke();
    }

    // Layer 2: user score polygon (accent color, foreground)
    ctx.beginPath();
    userPoints.forEach(({ value }, i) => {
      const p = pt(null, i, value);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.setFillStyle(`rgba(${r},${g},${b},0.15)`);
    ctx.fill();
    ctx.setStrokeStyle(`rgba(${r},${g},${b},0.85)`);
    ctx.setLineWidth(1.5);
    ctx.stroke();

    // User score dots
    userPoints.forEach(({ value }, i) => {
      const p = pt(null, i, value);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, TAU);
      ctx.setFillStyle(`rgba(${r},${g},${b},1)`);
      ctx.fill();
    });

    // Axis labels (use userPoints for label text — both arrays share same labels)
    const FONT_SIZE = 11;
    const LABEL_PAD = 6;
    ctx.setFontSize(FONT_SIZE);
    userPoints.forEach(({ label }, i) => {
      const angle = startAngle + (i / n) * TAU;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      let lx = cx + (R + 18) * cosA;
      let ly = cy + (R + 18) * sinA;

      const textAlign = Math.abs(cosA) < 0.15 ? "center" : cosA > 0 ? "left" : "right";
      const textBaseline = sinA > 0.3 ? "top" : sinA < -0.3 ? "bottom" : "middle";

      // Clamp to keep labels inside canvas bounds
      const approxW = label.length * FONT_SIZE * 0.95;
      if (textAlign === "right")       lx = Math.max(lx, approxW + LABEL_PAD);
      else if (textAlign === "left")   lx = Math.min(lx, W - approxW - LABEL_PAD);
      else { lx = Math.max(lx, approxW / 2 + LABEL_PAD); lx = Math.min(lx, W - approxW / 2 - LABEL_PAD); }
      if (textBaseline === "bottom")   ly = Math.max(ly, FONT_SIZE + LABEL_PAD);
      else if (textBaseline === "top") ly = Math.min(ly, H - FONT_SIZE - LABEL_PAD);

      ctx.setTextAlign(textAlign);
      ctx.setTextBaseline(textBaseline);
      ctx.setFillStyle(`rgba(${r},${g},${b},0.75)`);
      ctx.fillText(label, lx, ly);
    });
  },

  onShow() {
    wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage", "shareTimeline"] });
  },

  onTapOtherResult(e) {
    const { id } = e.currentTarget.dataset;
    const { quiz } = this.data;
    if (!id || !quiz) return;
    const resultPage = quiz.resultPage || "/subpackages/quiz/pages/generic-result/generic-result";
    wx.navigateTo({
      url: `${resultPage}?quizId=${quiz.id}&resultId=${id}`,
    });
  },

  onRetake() {
    wx.navigateBack({ delta: 1 });
  },

  onBackHome() {
    wx.navigateBack({ delta: 10 });
  },

  onShareAppMessage() {
    const { quiz, result, shareImageUrl } = this.data;
    const o = this._shareOptions || {};
    const sc = quiz ? this._encodeScores(quiz, this._pendingNormalized) : "";
    const scParam = sc ? `&sc=${sc}` : "";
    const tokenSuffix = result && result.token ? `·${result.token}` : "";
    const card = {
      title: result && quiz
        ? `我在「${quiz.title}」里测出了${result.title}${tokenSuffix}，你是哪种？`
        : "MYTYPE · 在历史与文学中，找到你自己",
      path: `/subpackages/quiz/pages/generic-result/generic-result?quizId=${o.quizId}&resultId=${o.resultId}${scParam}`,
    };
    if (shareImageUrl) card.imageUrl = shareImageUrl;
    return card;
  },

  onShareTimeline() {
    const { quiz, result } = this.data;
    const o = this._shareOptions || {};
    const sc = quiz ? this._encodeScores(quiz, this._pendingNormalized) : "";
    const scParam = sc ? `&sc=${sc}` : "";
    return {
      title: result && quiz ? `${result.title} · ${quiz.title} · MYTYPE` : "MYTYPE",
      query: `quizId=${o.quizId}&resultId=${o.resultId}${scParam}`,
    };
  },
});
