const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const ZHIPU_KEY     = process.env.ZHIPU_API_KEY;
const APPID         = process.env.WX_APPID;
const APPSECRET     = process.env.WX_APPSECRET;
const ENV_ID        = process.env.WX_CLOUD_ENV || "cloudbase-4gadl6qo4a9aa95d";

const DATA_DIR = path.resolve(__dirname, "../../scripts/data");

const VALID_PROVIDERS = new Set(["zhipu", "gemini", "deepseek", "anthropic"]);

const MODEL_DEFAULTS = {
  zhipu: "glm-4-plus",
  gemini: "gemini-3-flash-preview",
  deepseek: "deepseek-chat",
  anthropic: "claude-opus-4-5",
};

function inferProviderFromModel(model) {
  const m = (model || "").toLowerCase();
  if (!m) return null;
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("glm") || m.startsWith("zhipu")) return "zhipu";
  if (m.startsWith("deepseek")) return "deepseek";
  if (m.startsWith("claude")) return "anthropic";
  return null;
}

function resolveProvider(providerArg, modelArg) {
  const auto = ZHIPU_KEY ? "zhipu" : GEMINI_KEY ? "gemini" : DEEPSEEK_KEY ? "deepseek" : ANTHROPIC_KEY ? "anthropic" : null;
  return providerArg || inferProviderFromModel(modelArg) || auto;
}

function resolveModel(provider, modelArg) {
  return modelArg || MODEL_DEFAULTS[provider] || null;
}

function validateProviderKey(provider) {
  if (provider === "gemini" && !GEMINI_KEY) return "Missing GEMINI_API_KEY";
  if (provider === "zhipu" && !ZHIPU_KEY) return "Missing ZHIPU_API_KEY";
  if (provider === "deepseek" && !DEEPSEEK_KEY) return "Missing DEEPSEEK_API_KEY";
  if (provider === "anthropic" && !ANTHROPIC_KEY) return "Missing ANTHROPIC_API_KEY";
  return null;
}

module.exports = {
  DEEPSEEK_KEY, ANTHROPIC_KEY, GEMINI_KEY, ZHIPU_KEY,
  APPID, APPSECRET, ENV_ID, DATA_DIR,
  VALID_PROVIDERS, MODEL_DEFAULTS,
  inferProviderFromModel, resolveProvider, resolveModel, validateProviderKey,
};
