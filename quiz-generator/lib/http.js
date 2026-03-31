const https = require("https");

const HTTP_TIMEOUT_MS = 180000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(); reject(new Error("HTTP GET timeout")); });
    req.on("error", reject);
  });
}

function httpPost(url, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...extraHeaders },
    }, (res) => {
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlObj.hostname}`));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(); reject(new Error("HTTP POST timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(label, fn, maxAttempts = 4, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const is429 = /429/.test(err.message);
      const backoff = is429 ? delayMs * Math.pow(2, attempt - 1) : delayMs;
      console.warn(`  ⚠   ${label} attempt ${attempt} failed: ${err.message}, retrying in ${(backoff / 1000).toFixed(0)}s...`);
      await sleep(backoff);
    }
  }
}

module.exports = { httpGet, httpPost, sleep, withRetry, HTTP_TIMEOUT_MS };
