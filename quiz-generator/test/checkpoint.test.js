const { saveCheckpoint, loadCheckpoint, clearCheckpoints } = require("../lib/checkpoint");

describe("checkpoint helpers", () => {
  it("saves, loads, and clears checkpoints by topic hash", () => {
    const topic = `vitest-topic-${Date.now()}-${Math.random()}`;
    const phase = "phase1-outline";
    const payload = { id: "quiz-id", dimensions: ["A", "B"] };

    try {
      saveCheckpoint(topic, phase, payload);
      expect(loadCheckpoint(topic, phase)).toEqual(payload);

      clearCheckpoints(topic);
      expect(loadCheckpoint(topic, phase)).toBeNull();
    } finally {
      clearCheckpoints(topic);
    }
  });
});
