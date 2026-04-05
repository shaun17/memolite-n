import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SemanticConfigStore } from "../../src/storage/semantic-config-store.js";
import { SemanticFeatureStore } from "../../src/storage/semantic-feature-store.js";
import { EpisodeStore } from "../../src/storage/episode-store.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { SessionStore } from "../../src/storage/session-store.js";
import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";
import { exportSnapshot, importSnapshot } from "../../src/tools/snapshot.js";
import { encodeFloat32Embedding } from "../../src/vector/blob.js";

describe("snapshot tools", () => {
  const databases: Array<ReturnType<typeof createSqliteDatabase>> = [];

  afterEach(() => {
    for (const database of databases) {
      database.close();
    }
    databases.length = 0;
  });

  it("exports and imports the current sqlite truth tables", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-snapshot-"));
    const sourcePath = join(root, "source", "memolite.sqlite3");
    const targetPath = join(root, "target", "memolite.sqlite3");
    const targetKuzuPath = join(root, "target", "kuzu");
    const snapshotPath = join(root, "snapshot.json");

    const source = createSqliteDatabase({ sqlitePath: sourcePath });
    databases.push(source);
    initializeSqliteSchema(source);

    const projectStore = new ProjectStore(source);
    const sessionStore = new SessionStore(source);
    const episodeStore = new EpisodeStore(source);
    const semanticConfigStore = new SemanticConfigStore(source);
    const semanticFeatureStore = new SemanticFeatureStore(source);

    projectStore.createProject("org-a", "project-a", "demo");
    sessionStore.createSession({
      sessionKey: "session-a",
      orgId: "org-a",
      projectId: "project-a",
      sessionId: "session-a",
      userId: "user-1"
    });
    episodeStore.addEpisodes([
      {
        uid: "ep-1",
        sessionKey: "session-a",
        sessionId: "session-a",
        producerId: "user-1",
        producerRole: "user",
        sequenceNum: 1,
        content: "Ramen is my favorite food."
      }
    ]);
    const setTypeId = semanticConfigStore.createSetType({
      orgId: "org-a",
      metadataTagsSig: "user_id",
      name: "default"
    });
    semanticConfigStore.setSetConfig({
      setId: "set-a",
      setName: "Set A"
    });
    semanticConfigStore.registerSetTypeBinding({
      setId: "set-a",
      setTypeId
    });
    const categoryId = semanticConfigStore.createCategory({
      setId: "set-a",
      name: "profile",
      prompt: "profile prompt"
    });
    semanticConfigStore.createTag({
      categoryId,
      name: "food",
      description: "Food preference"
    });
    semanticFeatureStore.createFeature({
      setId: "set-a",
      category: "profile",
      tag: "food",
      featureName: "favorite_food",
      value: "ramen"
    });
    source.connection
      .prepare("INSERT INTO semantic_feature_vectors (feature_id, embedding) VALUES (?, ?)")
      .run(1, encodeFloat32Embedding([0.1, 0.2]));
    source.connection
      .prepare(
        "INSERT INTO derivative_feature_vectors (feature_id, embedding) VALUES (?, ?)"
      )
      .run(11, encodeFloat32Embedding([0.3, 0.4]));
    source.connection
      .prepare("INSERT INTO semantic_citations (feature_id, episode_id) VALUES (?, ?)")
      .run(1, "ep-1");
    source.connection
      .prepare(
        "INSERT INTO semantic_set_ingested_history (set_id, history_id, ingested, created_at) VALUES (?, ?, ?, ?)"
      )
      .run("set-a", "ep-1", 0, "2026-04-04T00:00:00Z");

    exportSnapshot(sourcePath, snapshotPath);
    const exported = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables: Record<string, Array<Record<string, unknown>>>;
    };

    expect(exported.tables.projects[0].project_id).toBe("project-a");
    expect(exported.tables.episodes[0].uid).toBe("ep-1");
    expect(exported.tables.semantic_features[0].feature_name).toBe("favorite_food");
    expect(exported.tables.semantic_config_tag[0].name).toBe("food");
    expect(exported.tables.semantic_feature_vectors[0].feature_id).toBe(1);
    expect(exported.tables.derivative_feature_vectors[0].feature_id).toBe(11);

    await importSnapshot(targetPath, snapshotPath, targetKuzuPath);

    const target = createSqliteDatabase({ sqlitePath: targetPath });
    databases.push(target);
    initializeSqliteSchema(target);

    expect(new ProjectStore(target).listProjects()).toHaveLength(1);
    expect(new SessionStore(target).searchSessions({ orgId: "org-a" })).toHaveLength(1);
    expect(new EpisodeStore(target).listEpisodes({ sessionKey: "session-a" })).toHaveLength(1);
    expect(new SemanticConfigStore(target).listSetTypes("org-a")).toHaveLength(1);
    expect(new SemanticFeatureStore(target).queryFeatures({ setId: "set-a" })).toHaveLength(1);
    expect(
      target.connection.prepare("SELECT COUNT(*) AS count FROM semantic_feature_vectors").get() as {
        count: number;
      }
    ).toEqual({ count: 1 });
    expect(
      target.connection.prepare("SELECT COUNT(*) AS count FROM derivative_feature_vectors").get() as {
        count: number;
      }
    ).toEqual({ count: 1 });
  });
});
