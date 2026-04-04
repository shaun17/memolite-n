import { afterEach, describe, expect, it } from "vitest";

import {
  createEmbedderProvider,
  createRerankerProvider,
  resetTransformersBackendLoaderForTests,
  setTransformersBackendLoaderForTests,
  type TransformersBackendModule
} from "../../src/common/models/provider-factory.js";

describe("model runtime providers", () => {
  afterEach(() => {
    resetTransformersBackendLoaderForTests();
  });

  it("creates a working hash embedder provider", async () => {
    const provider = createEmbedderProvider({
      embedderProvider: "hash"
    });

    expect(provider.name).toBe("hash");
    expect(provider.dimensions).toBe(64);
    await expect(provider.encode("机器学习 test")).resolves.toHaveLength(64);
  });

  it("loads sentence transformer models via the transformers backend", async () => {
    const backend: TransformersBackendModule = {
      env: {},
      pipeline: async (task, modelName) => {
        expect(task).toBe("feature-extraction");
        expect(modelName).toBe("BAAI/bge-small-zh-v1.5");
        return async (input, options) => {
          expect(input).toBe("hello world");
          expect(options).toEqual({
            pooling: "mean",
            normalize: true
          });
          return {
            data: new Float32Array([0.6, 0.8]),
            dims: [1, 2]
          };
        };
      }
    };
    setTransformersBackendLoaderForTests(async () => backend);

    const provider = createEmbedderProvider({
      embedderProvider: "sentence_transformer",
      modelBasePath: "/models",
      modelCacheDir: "/cache",
      allowRemoteModels: false
    });

    await provider.warmUp();
    const vector = await provider.encode("hello world");
    expect(vector[0]).toBeCloseTo(0.6);
    expect(vector[1]).toBeCloseTo(0.8);
    expect(provider.name).toBe("sentence_transformer");
    expect(provider.dimensions).toBe(2);
    expect(backend.env.localModelPath).toBe("/models");
    expect(backend.env.cacheDir).toBe("/cache");
    expect(backend.env.allowRemoteModels).toBe(false);
  });

  it("reranks episodic matches through the cross encoder backend", async () => {
    const backend: TransformersBackendModule = {
      env: {},
      pipeline: async (task, modelName) => {
        expect(task).toBe("text-classification");
        expect(modelName).toBe("BAAI/bge-reranker-base");
        return async (pairs) => {
          expect(pairs).toEqual([
            { text: "favorite food", text_pair: "weather is rainy" },
            { text: "favorite food", text_pair: "ramen is great" }
          ]);
          return [
            [{ score: 0.1 }],
            [{ score: 0.9 }]
          ];
        };
      }
    };
    setTransformersBackendLoaderForTests(async () => backend);

    const provider = createRerankerProvider({
      rerankerProvider: "cross_encoder"
    });
    if (provider === null) {
      throw new Error("expected reranker provider");
    }
    const matches = [
      {
        episode: {
          uid: "ep-2",
          content: "weather is rainy"
        },
        derivative_uid: "drv-2",
        score: 0.4
      },
      {
        episode: {
          uid: "ep-1",
          content: "ramen is great"
        },
        derivative_uid: "drv-1",
        score: 0.3
      }
    ];

    const reranked = await provider.rerank("favorite food", matches);
    expect(reranked.map((item) => item.episode.uid)).toEqual(["ep-1", "ep-2"]);
    expect(provider.name).toBe("cross_encoder");
  });
});
