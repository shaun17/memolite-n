import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";
import { reconcileSnapshot } from "../../src/tools/migration.js";

describe("compatibility sync routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("keeps vectors and graph mirror aligned when memories and semantic features are written", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-sync-"));
    const sqlitePath = join(root, "memolite.sqlite3");
    const kuzuPath = join(root, "graph.kuzu");
    process.env.MEMOLITE_SQLITE_PATH = sqlitePath;
    process.env.MEMOLITE_KUZU_PATH = kuzuPath;

    const app = createHttpApp();

    await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        org_id: "org-a",
        project_id: "project-a"
      }
    });

    await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        session_key: "session-a",
        org_id: "org-a",
        project_id: "project-a",
        session_id: "session-a",
        user_id: "user-1"
      }
    });

    await app.inject({
      method: "POST",
      url: "/memories",
      payload: {
        session_key: "session-a",
        episodes: [
          {
            uid: "ep-1",
            session_key: "session-a",
            session_id: "session-a",
            producer_id: "user-1",
            producer_role: "user",
            sequence_num: 1,
            content: "Ramen is my favorite food."
          }
        ]
      }
    });

    await app.inject({
      method: "POST",
      url: "/semantic/features",
      payload: {
        set_id: "set-a",
        category: "profile",
        tag: "food",
        feature_name: "favorite_food",
        value: "ramen"
      }
    });

    const report = reconcileSnapshot({
      sqlitePath,
      kuzuPath
    });

    expect(report.missing_embedding_feature_ids).toEqual([]);
    expect(report.missing_derivative_vector_ids).toEqual([]);
    expect(report.missing_episode_graph_nodes).toEqual([]);
    expect(report.missing_graph_edge_episode_ids).toEqual([]);

    await app.close();
  });
});
