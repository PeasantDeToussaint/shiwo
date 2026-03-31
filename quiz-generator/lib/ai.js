const { httpPost } = require("./http");
const { DEEPSEEK_KEY, ANTHROPIC_KEY, GEMINI_KEY, ZHIPU_KEY } = require("./config");

let _legacyClient = null;

function createClient(provider, model) {
  if (!provider || !model) {
    throw new Error("AI client requires both provider and model");
  }

  async function callAI(systemPrompt, userPrompt, maxTokens = 8000) {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ];

    if (provider === "zhipu") {
      const zhipuMax = Math.min(maxTokens, 8192);
      const res = await httpPost(
        "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        { model, max_tokens: zhipuMax, temperature: 0.85, messages, stream: false },
        { "Authorization": `Bearer ${ZHIPU_KEY}` }
      );
      if (res.error) throw new Error(`Zhipu: ${JSON.stringify(res.error)}`);
      return res.choices[0].message.content;
    }

    if (provider === "deepseek") {
      const res = await httpPost(
        "https://api.deepseek.com/chat/completions",
        { model, max_tokens: maxTokens, temperature: 0.85, messages, stream: false },
        { "Authorization": `Bearer ${DEEPSEEK_KEY}` }
      );
      if (res.error) throw new Error(`DeepSeek: ${res.error.message}`);
      return res.choices[0].message.content;
    }

    if (provider === "anthropic") {
      const res = await httpPost(
        "https://api.anthropic.com/v1/messages",
        { model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
        { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }
      );
      if (res.error) throw new Error(`Anthropic: ${res.error.message}`);
      return res.content[0].text;
    }

    if (provider === "gemini") {
      const geminiModel = encodeURIComponent(model);
      const res = await httpPost(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_KEY}`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85, responseMimeType: "application/json" }
        }
      );
      if (res.error) throw new Error(`Gemini: ${res.error.message}`);
      const candidate = res.candidates?.[0];
      if (!candidate) throw new Error("Gemini: no candidates in response");
      if (candidate.finishReason === "SAFETY") throw new Error("Gemini: response blocked by safety filter");
      return candidate.content.parts[0].text;
    }

    throw new Error(`Unknown provider: ${provider}`);
  }

  return {
    provider,
    model,
    callAI,
  };
}

function configure(provider, model) {
  _legacyClient = createClient(provider, model);
}

function getProvider() {
  return _legacyClient?.provider || null;
}

function getModel() {
  return _legacyClient?.model || null;
}

async function callAI(systemPrompt, userPrompt, maxTokens = 8000) {
  if (!_legacyClient) {
    throw new Error("AI not configured — call ai.configure(provider, model) first");
  }
  return _legacyClient.callAI(systemPrompt, userPrompt, maxTokens);
}

module.exports = { createClient, configure, getProvider, getModel, callAI };
