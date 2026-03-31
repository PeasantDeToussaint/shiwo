const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA_DIR } = require("./config");

const CKPT_DIR = path.join(DATA_DIR, ".checkpoints");

function topicHash(topic) {
  return "ckpt-" + crypto.createHash("sha256").update(topic).digest("hex").slice(0, 12);
}

function saveCheckpoint(topic, phase, data) {
  const dir = path.join(CKPT_DIR, topicHash(topic));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${phase}.json`), JSON.stringify(data, null, 2));
}

function loadCheckpoint(topic, phase) {
  const file = path.join(CKPT_DIR, topicHash(topic), `${phase}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function clearCheckpoints(topic) {
  const dir = path.join(CKPT_DIR, topicHash(topic));
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { saveCheckpoint, loadCheckpoint, clearCheckpoints, topicHash };
