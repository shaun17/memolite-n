import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("ignores legacy MEMLITE_* variables", () => {
    process.env.MEMLITE_PORT = "19999";

    const settings = getSettings();

    expect(settings.port).toBe(18731);
    expect(process.env.MEMOLITE_PORT).toBeUndefined();
  });

  it("loads MEMOLITE settings from a local .env file", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-dotenv-"));
    const previousCwd = process.cwd();
    try {
      writeFileSync(
        join(root, ".env"),
        "MEMOLITE_APP_NAME=Env Loaded App\nMEMOLITE_PORT=19123\n",
        "utf8"
      );
      process.chdir(root);

      const settings = getSettings();

      expect(settings.appName).toBe("Env Loaded App");
      expect(settings.port).toBe(19123);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
