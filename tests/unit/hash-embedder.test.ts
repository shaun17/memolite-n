import { describe, expect, it } from "vitest";

import { encodeHashEmbedding, tokenize } from "../../src/embedders/hash-embedder.js";

describe("hash embedder", () => {
  it("tokenizes english and cjk text", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
    expect(tokenize("机器学习")).not.toHaveLength(0);
  });

  it("returns a normalized vector", () => {
    const vector = encodeHashEmbedding("机器学习 test");

    expect(vector).toHaveLength(64);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
  });
});
