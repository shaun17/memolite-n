import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createResources } from "../../src/app/resources.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { extractFeatures } from "../../src/app/background-tasks.js";

describe("background tasks", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("supports chinese feature extraction and hash-friendly embed text", () => {
    const features = extractFeatures("我叫 wenren。我最喜欢吃拉面。");

    expect(features.some((feature) => feature.category === "profile" &&
      feature.tag === "identity" &&
      feature.feature_name === "name" &&
      feature.value === "wenren")).toBe(true);
    expect(features.some((feature) => feature.feature_name === "favorite_food" &&
      feature.value === "拉面" &&
      feature.embed_text.includes("喜欢"))).toBe(true);
  });

  it("tracks startup recovery and compensation backlog", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-bg-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");

    const resources = createResources();
    resources.semanticFeatureStore.addHistoryToSet("set-a", "ep-1");

    const recovery = await resources.backgroundTasks.runStartupRecovery();
    expect(recovery.ingestion_backlog).toBe(1);
    expect(resources.metrics.snapshot().counters.ingestion_backlog).toBe(1);

    resources.projectStore.createProject("org-a", "project-a", null);
    resources.sessionStore.createSession({
      sessionKey: "session-a",
      orgId: "org-a",
      projectId: "project-a",
      sessionId: "session-a",
      userId: "user-1"
    });
    resources.episodeStore.addEpisodes([
      {
        uid: "ep-1",
        sessionKey: "session-a",
        sessionId: "session-a",
        producerId: "user-1",
        producerRole: "user",
        sequenceNum: 1,
        content: "My name is Wenren. I love ramen."
      }
    ]);

    const processed = await resources.backgroundTasks.runCompensationPass();
    expect(processed).toBeGreaterThanOrEqual(1);
    expect(resources.semanticFeatureStore.getHistoryMessages({
      setIds: ["set-a"],
      isIngested: false
    })).toEqual([]);
    expect(resources.semanticFeatureStore.queryFeatures({
      setId: "set-a"
    }).map((feature) => feature.feature_name)).toEqual(
      expect.arrayContaining(["name", "favorite_preference"])
    );

    resources.close();
  });
});
