const presets = {
  philosophy: {
    accent: "#8ab0c8",
    chapterGlow: "rgba(138, 176, 200, 0.08)",
    chapterGradientStart: "#0d1318",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(138, 176, 200, 0.13)",
    stateSelectedBorder: "rgba(138, 176, 200, 0.42)",
  },
  "red-chambers": {
    accent: "#c08a8a",
    chapterGlow: "rgba(192, 138, 138, 0.09)",
    chapterGradientStart: "#1a0f0f",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(192, 138, 138, 0.13)",
    stateSelectedBorder: "rgba(192, 138, 138, 0.42)",
  },
  city: {
    accent: "#a07850",
    chapterGlow: "rgba(160, 120, 80, 0.08)",
    chapterGradientStart: "#19140e",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(160, 120, 80, 0.14)",
    stateSelectedBorder: "rgba(160, 120, 80, 0.44)",
  },
  temple: {
    accent: "#c8a26e",
    chapterGlow: "rgba(200, 162, 110, 0.08)",
    chapterGradientStart: "#1a1208",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(200, 162, 110, 0.12)",
    stateSelectedBorder: "rgba(200, 162, 110, 0.48)",
  },
  dialect: {
    accent: "#b8956a",
    chapterGlow: "rgba(184, 149, 106, 0.08)",
    chapterGradientStart: "#1e1910",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(184, 149, 106, 0.14)",
    stateSelectedBorder: "rgba(184, 149, 106, 0.5)",
  },

  // ── Extended palette for AI-generated quizzes ──────────────
  sage: {
    accent: "#7eb89a",
    chapterGlow: "rgba(126, 184, 154, 0.08)",
    chapterGradientStart: "#0e1812",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(126, 184, 154, 0.13)",
    stateSelectedBorder: "rgba(126, 184, 154, 0.42)",
  },
  dusk: {
    accent: "#c47a6e",
    chapterGlow: "rgba(196, 122, 110, 0.09)",
    chapterGradientStart: "#1e100e",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(196, 122, 110, 0.14)",
    stateSelectedBorder: "rgba(196, 122, 110, 0.44)",
  },
  ink: {
    accent: "#8ab0c8",
    chapterGlow: "rgba(138, 176, 200, 0.08)",
    chapterGradientStart: "#0c1318",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(138, 176, 200, 0.12)",
    stateSelectedBorder: "rgba(138, 176, 200, 0.40)",
  },
  plum: {
    accent: "#b08ab8",
    chapterGlow: "rgba(176, 138, 184, 0.08)",
    chapterGradientStart: "#14101a",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(176, 138, 184, 0.13)",
    stateSelectedBorder: "rgba(176, 138, 184, 0.42)",
  },
  ember: {
    accent: "#d4946a",
    chapterGlow: "rgba(212, 148, 106, 0.09)",
    chapterGradientStart: "#1c1208",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(212, 148, 106, 0.14)",
    stateSelectedBorder: "rgba(212, 148, 106, 0.44)",
  },
  stone: {
    accent: "#a8a898",
    chapterGlow: "rgba(168, 168, 152, 0.07)",
    chapterGradientStart: "#141412",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(168, 168, 152, 0.11)",
    stateSelectedBorder: "rgba(168, 168, 152, 0.36)",
  },

  default: {
    accent: "#8ab0c8",
    chapterGlow: "rgba(138, 176, 200, 0.08)",
    chapterGradientStart: "#0d1318",
    chapterGradientEnd: "#09090a",
    stateSelectedBg: "rgba(138, 176, 200, 0.13)",
    stateSelectedBorder: "rgba(138, 176, 200, 0.40)",
  },
};

function resolveTheme({ themeKey } = {}) {
  return presets[themeKey] || presets.default;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 138, g: 176, b: 200 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/**
 * Build a full theme object from a single accent hex color.
 * Used when a result has its own cardAccent that overrides the quiz theme.
 */
function buildThemeFromAccent(hex) {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * 0.12);
  const dg = Math.round(g * 0.12);
  const db = Math.round(b * 0.12);
  const toHex2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return {
    accent: hex,
    chapterGlow: `rgba(${r},${g},${b},0.08)`,
    chapterGradientStart: `#${toHex2(dr)}${toHex2(dg)}${toHex2(db)}`,
    chapterGradientEnd: "#09090a",
    stateSelectedBg: `rgba(${r},${g},${b},0.13)`,
    stateSelectedBorder: `rgba(${r},${g},${b},0.40)`,
  };
}

function toCssVarString(theme) {
  if (!theme) return "";
  return [
    `--accent: ${theme.accent}`,
    `--chapter-accent: ${theme.accent}`,
    `--chapter-glow: ${theme.chapterGlow}`,
    `--chapter-gradient-start: ${theme.chapterGradientStart}`,
    `--chapter-gradient-end: ${theme.chapterGradientEnd}`,
    `--state-selected-bg: ${theme.stateSelectedBg}`,
    `--state-selected-border: ${theme.stateSelectedBorder}`,
  ].join(";");
}

module.exports = { resolveTheme, buildThemeFromAccent, toCssVarString };
