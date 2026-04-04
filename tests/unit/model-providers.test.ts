import { describe, expect, it } from "vitest";

import {
  createEmbedderConfig,
  createRerankerConfig
} from "../../src/common/models/provider-factory.js";

describe("model provider compatibility", () => {
  it("defaults to the Python hash embedder provider", () => {
    expect(createEmbedderConfig({})).toEqual({
      provider: "hash",
      modelName: null
    });
  });

  it("uses the same default sentence-transformer model as Python", () => {
    expect(
      createEmbedderConfig({
        embedderProvider: "sentence_transformer"
      })
    ).toEqual({
      provider: "sentence_transformer",
      modelName: "BAAI/bge-small-zh-v1.5"
    });
  });

  it("defaults reranker to none and uses the same cross-encoder model as Python", () => {
    expect(createRerankerConfig({})).toEqual({
      provider: "none",
      modelName: null
    });

    expect(
      createRerankerConfig({
        rerankerProvider: "cross_encoder"
      })
    ).toEqual({
      provider: "cross_encoder",
      modelName: "BAAI/bge-reranker-base"
    });
  });
});
