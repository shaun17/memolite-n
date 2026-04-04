import { describe, expect, it } from "vitest";

import {
  buildDerivativesForEpisode,
  chunkEpisodeContent,
  vectorItemId
} from "../../src/derivatives/pipeline.js";

describe("derivative pipeline", () => {
  it("splits episodes into sentence-level derivatives with stable ids", () => {
    const chunks = chunkEpisodeContent("First sentence. Second sentence!\nThird line");
    expect(chunks).toEqual(["First sentence.", "Second sentence!", "Third line"]);

    const derivatives = buildDerivativesForEpisode({
      uid: "ep-1",
      session_key: "session-a",
      session_id: "session-a",
      producer_id: "user-1",
      producer_role: "user",
      produced_for_id: null,
      sequence_num: 1,
      content: "First sentence. Second sentence!",
      content_type: "text",
      episode_type: "message",
      created_at: "2026-04-04T00:00:00Z",
      metadata_json: "{\"source\":\"test\"}",
      filterable_metadata_json: null,
      deleted: 0
    });

    expect(derivatives.map((item) => item.uid)).toEqual(["ep-1:d:1", "ep-1:d:2"]);
    expect(derivatives[1].content).toBe("Second sentence!");
    expect(vectorItemId("ep-1:d:1")).toBe(vectorItemId("ep-1:d:1"));
  });
});
