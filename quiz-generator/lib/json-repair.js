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

/**
 * Models sometimes output array field values wrapped in quotes:
 *   "highAnchorResults": "[\"word1\", \"word2\"]"   (escaped inner quotes)
 *   "highAnchorResults": "["word1", "word2"]"       (unescaped inner quotes)
 * Both cases are invalid JSON. This function detects the pattern by scanning
 * for known array field names whose value starts with `"[`, then unwraps them.
 */
function fixStringifiedArrayFields(str) {
  const ARRAY_FIELDS = [
    "highAnchorResults", "lowAnchorResults", "forbiddenInterpretations",
    "dimensions",
  ];

  for (const fieldName of ARRAY_FIELDS) {
    const fieldPrefix = `"${fieldName}"`;
    let searchFrom = 0;
    while (true) {
      const fieldPos = str.indexOf(fieldPrefix, searchFrom);
      if (fieldPos === -1) break;

      // Find colon
      let colonPos = fieldPos + fieldPrefix.length;
      while (colonPos < str.length && str[colonPos] !== ':') colonPos++;
      if (colonPos >= str.length) { searchFrom = fieldPos + 1; break; }

      // Skip whitespace to find value start
      let vStart = colonPos + 1;
      while (vStart < str.length && /\s/.test(str[vStart])) vStart++;

      // Only handle when value starts with "[  (string wrapping an array)
      if (str[vStart] !== '"' || str[vStart + 1] !== '[') {
        searchFrom = fieldPos + fieldPrefix.length;
        continue;
      }

      // Scan for balanced [] inside the string, respecting inner escape sequences
      const innerStart = vStart + 1; // points to [
      let depth = 0;
      let inInnerStr = false;
      let esc = false;
      let arrayEnd = -1;

      for (let i = innerStart; i < str.length; i++) {
        const c = str[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inInnerStr = !inInnerStr; continue; }
        if (inInnerStr) continue;
        if (c === '[') depth++;
        if (c === ']') {
          depth--;
          if (depth === 0) { arrayEnd = i; break; }
        }
      }

      if (arrayEnd === -1) { searchFrom = fieldPos + fieldPrefix.length; continue; }

      // Check if immediately after ] there's a closing " (the outer string close)
      let afterArray = arrayEnd + 1;
      if (str[afterArray] === '"') {
        // Extract array content [vStart+1 .. arrayEnd+1) and unescape inner \"
        let inner = str.slice(vStart + 1, arrayEnd + 1); // includes [ ... ]
        inner = inner.replace(/\\"/g, '"');               // unescape \" → "
        str = str.slice(0, vStart) + inner + str.slice(afterArray + 1);
        // re-scan from same position in case of multiple occurrences
        continue;
      }

      searchFrom = fieldPos + fieldPrefix.length;
    }
  }
  return str;
}

function normalizeJSONCandidate(candidate) {
  candidate = fixStringifiedArrayFields(candidate);
  candidate = escapeNewlinesInStrings(candidate);
  candidate = removeTrailingCommas(candidate);

  // Fix unquoted string values: "field": some text,  →  "field": "some text",
  // Must run before the STRING_FIELDS pass below.
  const UNQUOTED_FIELDS = [
    "setting", "type", "dimension", "text", "label", "description",
    "portrait", "title", "subtitle", "eyebrow", "name", "id",
  ];
  for (const f of UNQUOTED_FIELDS) {
    candidate = candidate.replace(
      new RegExp(`("${f}"\\s*:\\s*)(?!")([^,{}\\[\\]\\n]+)`, "g"),
      (_, prefix, val) => `${prefix}"${val.trim()}"`
    );
  }

  const STRING_FIELDS = [
    "reaction","text","label","description","portrait",
    "temperament","situation","lifeAdvice","destiny",
    "token","verse","verseSource","boldQuote","title","subtitle",
    "insight","nameContext","coreIdentity","distinctiveFeature",
    "domainInsight","figureContext","axisLabel","lowPole",
    "eyebrow","instruction","dimension","name","resultType","scoringFamily",
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
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\uff1a/g, ":")    // ： full-width colon → ASCII
    .replace(/\uff0c/g, ",")    // ， full-width comma → ASCII
    .replace(/\uff5b/g, "{")    // ｛ full-width brace
    .replace(/\uff5d/g, "}")    // ｝
    .replace(/\uff3b/g, "[")    // ［ full-width bracket
    .replace(/\uff3d/g, "]");   // ］

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
  removeTrailingCommas, fixStringifiedArrayFields, normalizeJSONCandidate, extractJSON,
};
