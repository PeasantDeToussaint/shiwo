function fixBracketMismatches(str) {
  const stack = [];
  const out = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped)          { out.push(c); escaped = false; continue; }
    if (c === "\\" && inString) { out.push(c); escaped = true; continue; }
    if (c === '"')        { inString = !inString; out.push(c); continue; }
    if (inString)         { out.push(c); continue; }

    if (c === "{" || c === "[") {
      stack.push(c); out.push(c);
    } else if (c === "}" || c === "]") {
      if (stack.length > 0) {
        out.push(stack[stack.length - 1] === "{" ? "}" : "]");
        stack.pop();
      } else {
        out.push(c);
      }
    } else {
      out.push(c);
    }
  }
  return out.join("");
}

function repairJSON(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] !== '"') { out.push(str[i++]); continue; }
    out.push('"'); i++;
    while (i < str.length) {
      if (str[i] === "\\") {
        out.push(str[i], str[i + 1] || "");
        i += 2; continue;
      }
      if (str[i] === '"') {
        let j = i + 1;
        while (j < str.length && str[j] === " ") j++;
        const next = str[j];
        if (next === ":" || next === "," || next === "}" || next === "]" || next === "\n" || next === "\r") {
          out.push('"'); i++; break;
        }
        out.push('\\"'); i++;
      } else {
        out.push(str[i++]);
      }
    }
  }
  return out.join("");
}

function escapeNewlinesInStrings(str) {
  const VALID_ESCAPE = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  const out = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) {
      if (!VALID_ESCAPE.has(c)) {
        out.pop();
      }
      out.push(c);
      escaped = false;
      continue;
    }
    if (c === "\\") {
      if (inString) {
        out.push(c); escaped = true;
        continue;
      }
      const next = str[i + 1];
      if (next === "n" || next === "r" || next === "t") {
        out.push(" ");
        i++;
      }
      continue;
    }
    if (c === '"') { inString = !inString; out.push(c); continue; }
    if (inString) {
      if (c === "\n") { out.push("\\n"); continue; }
      if (c === "\r") { out.push("\\r"); continue; }
      if (c === "\t") { out.push("\\t"); continue; }
    }
    out.push(c);
  }
  return out.join("");
}

function removeTrailingCommas(str) {
  const out = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped)               { out.push(c); escaped = false; continue; }
    if (c === "\\" && inString){ out.push(c); escaped = true;  continue; }
    if (c === '"')             { inString = !inString; out.push(c); continue; }
    if (inString)              { out.push(c); continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < str.length && /\s/.test(str[j])) j++;
      if (str[j] === "}" || str[j] === "]") continue; // drop trailing comma
    }
    out.push(c);
  }
  return out.join("");
}

function normalizeJSONCandidate(candidate) {
  candidate = escapeNewlinesInStrings(candidate);
  candidate = removeTrailingCommas(candidate);

  const STRING_FIELDS = [
    "reaction","text","label","description","portrait",
    "temperament","situation","lifeAdvice","destiny",
    "token","verse","verseSource","boldQuote","title","subtitle",
    "insight","nameContext","coreIdentity","distinctiveFeature",
    "domainInsight","figureContext","axisLabel","lowPole",
    "eyebrow","instruction","dimension","name","resultType",
    "highDefinition","lowDefinition",
  ];
  for (const f of STRING_FIELDS) {
    const re = new RegExp(`("${f}"\\s*:\\s*)([^"\\s{\\[\\d\\-ntf][^"\\n]*?)(")`, "g");
    candidate = candidate.replace(re, '$1"$2$3');
  }

  let prev;
  do {
    prev = candidate;
    candidate = candidate.replace(
      /"portrait"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"portrait"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
      '"portrait": "$1\\n\\n$2"'
    );
  } while (candidate !== prev);

  candidate = candidate.replace(/"((?:[^"\\]|\\.)*)"/g, (m) =>
    m.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  );
  return candidate;
}

function extractJSON(raw) {
  let match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = match ? match[1].trim() : raw.trim();

  const start = jsonStr.indexOf("{");
  const end   = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  jsonStr = jsonStr.slice(start, end + 1);

  jsonStr = jsonStr
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  jsonStr = normalizeJSONCandidate(jsonStr);

  try { return JSON.parse(jsonStr); } catch (_) {}
  try { const r = JSON.parse(normalizeJSONCandidate(fixBracketMismatches(jsonStr))); process.stderr.write("  [json] repaired via bracket fix\n"); return r; } catch (_) {}
  try { const r = JSON.parse(normalizeJSONCandidate(repairJSON(jsonStr))); process.stderr.write("  [json] repaired via jsonrepair\n"); return r; } catch (_) {}
  try { const r = JSON.parse(normalizeJSONCandidate(repairJSON(fixBracketMismatches(jsonStr)))); process.stderr.write("  [json] repaired via bracket fix + jsonrepair\n"); return r; } catch (e) {
    throw new Error(`JSON parse failed after repair: ${e.message}`);
  }
}

module.exports = {
  fixBracketMismatches, repairJSON, escapeNewlinesInStrings,
  removeTrailingCommas, normalizeJSONCandidate, extractJSON,
};
