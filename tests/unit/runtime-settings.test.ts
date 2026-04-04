import { afterEach, describe, expect, it } from "vitest";

import {
  clearSettingsCache,
  getSettings
} from "../../src/common/config/runtime-settings.js";

describe("runtime settings", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_APP_NAME;
    delete process.env.MEMOLITE_PORT;
    delete process.env.MEMOLITE_EMBEDDER_PROVIDER;
    delete process.env.MEMOLITE_EMBEDDER_MODEL;
    delete process.env.MEMOLITE_RERANKER_PROVIDER;
    delete process.env.MEMOLITE_RERANKER_MODEL;
    delete process.env.MEMLITE_PORT;
  });

  it("reads modern MEMOLITE_* environment variables", () => {
    process.env.MEMOLITE_APP_NAME = "MemLite Test";
    process.env.MEMOLITE_PORT = "9001";
    process.env.MEMOLITE_EMBEDDER_PROVIDER = "sentence_transformer";
    process.env.MEMOLITE_EMBEDDER_MODEL = "local-demo";
    process.env.MEMOLITE_RERANKER_PROVIDER = "cross_encoder";
    process.env.MEMOLITE_RERANKER_MODEL = "reranker-demo";

    const settings = getSettings();

    expect(settings.appName).toBe("MemLite Test");
    expect(settings.port).toBe(9001);
    expect(settings.embedderProvider).toBe("sentence_transformer");
    expect(settings.embedderModel).toBe("local-demo");
    expect(settings.rerankerProvider).toBe("cross_encoder");
    expect(settings.rerankerModel).toBe("reranker-demo");
  });

  it("backfills legacy MEMLITE_* variables when the modern ones are absent", () => {
    process.env.MEMLITE_PORT = "19999";

    const settings = getSettings();

    expect(settings.port).toBe(19999);
    expect(process.env.MEMOLITE_PORT).toBe("19999");
  });
});
