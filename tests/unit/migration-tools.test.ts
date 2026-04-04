import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GraphMirrorStore } from "../../src/graph/mirror-store.js";
import {
  rebuildVectorsSnapshot,
  reconcileSnapshot,
  repairSnapshot
} from "../../src/tools/migration.js";
import { SemanticFeatureStore } from "../../src/storage/semantic-feature-store.js";
import { EpisodeStore } from "../../src/storage/episode-store.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { SessionStore } from "../../src/storage/session-store.js";
import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";

describe("migration tools", () => {
  const databases: Array<ReturnType<typeof createSqliteDatabase>> = [];

  afterEach(() => {
    for (const database of databases) {
      database.close();
    }
    databases.length = 0;
  });

  it("rebuilds vectors and repairs missing graph mirror state", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-migration-"));
    const sqlitePath = join(root, "memolite.sqlite3");
    const kuzuPath = join(root, "kuzu");
    const database = createSqliteDatabase({ sqlitePath });
    databases.push(database);
    initializeSqliteSchema(database);

    new ProjectStore(database).createProject("org-a", "project-a", "demo");
    new SessionStore(database).createSession({
      sessionKey: "session-a",
      orgId: "org-a",
      projectId: "project-a",
      sessionId: "session-a",
      userId: "user-1"
    });
    new EpisodeStore(database).addEpisodes([
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
    new SemanticFeatureStore(database).createFeature({
      setId: "set-a",
      category: "profile",
      tag: "food",
      featureName: "favorite_food",
      value: "ramen"
    });

    const graphMirror = new GraphMirrorStore(kuzuPath);
    expect(graphMirror.readSnapshot().episodes).toEqual([]);

    const rebuilt = await rebuildVectorsSnapshot({
      sqlitePath,
      kuzuPath,
      target: "all"
    });
    expect(rebuilt.semantic_vectors_rebuilt).toBe(1);
    expect(rebuilt.episodes_rebuilt).toBe(1);

    database.connection.prepare("DELETE FROM semantic_feature_vectors").run();
    database.connection.prepare("DELETE FROM derivative_feature_vectors").run();
    graphMirror.clear();

    const before = reconcileSnapshot({
      sqlitePath,
      kuzuPath
    });
    expect(before.missing_embedding_feature_ids).toEqual([1]);
    expect(before.missing_episode_graph_nodes).toEqual(["ep-1"]);

    const repaired = await repairSnapshot({
      sqlitePath,
      kuzuPath
    });
    expect(repaired.semantic_vectors_rebuilt).toBe(1);
    expect(repaired.episodes_rebuilt).toBe(1);
    expect(repaired.orphan_records_removed).toBe(0);

    const after = reconcileSnapshot({
      sqlitePath,
      kuzuPath
    });
    expect(after.missing_embedding_feature_ids).toEqual([]);
    expect(after.missing_episode_graph_nodes).toEqual([]);
    expect(after.missing_derivative_vector_ids).toEqual([]);
  });
});
