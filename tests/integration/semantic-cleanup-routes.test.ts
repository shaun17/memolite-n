import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppResources } from "../../src/app/resources.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";

describe("semantic cleanup routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("cascades semantic cleanup when deleting episodes, sessions, and projects", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-cleanup-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");

    const app = createHttpApp();
    const resources = (app as typeof app & { memoliteResources: AppResources }).memoliteResources;

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
        semantic_set_id: "session-a",
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

    const featureId = (
      await app.inject({
        method: "POST",
        url: "/semantic/features",
        payload: {
          set_id: "session-a",
          category: "profile",
          tag: "food",
          feature_name: "favorite_food",
          value: "ramen"
        }
      })
    ).json().id as number;
    resources.semanticFeatureStore.addCitations(featureId, ["ep-1"]);

    await app.inject({
      method: "DELETE",
      url: "/memories/episodes",
      payload: {
        episode_uids: ["ep-1"],
        semantic_set_id: "session-a"
      }
    });

    expect(resources.semanticFeatureStore.getFeature(featureId)?.deleted).toBe(1);
    expect(resources.semanticFeatureStore.getHistoryMessages({
      setIds: ["session-a"]
    })).toEqual([]);

    await app.inject({
      method: "POST",
      url: "/memories",
      payload: {
        session_key: "session-a",
        semantic_set_id: "session-a",
        episodes: [
          {
            uid: "ep-2",
            session_key: "session-a",
            session_id: "session-a",
            producer_id: "user-1",
            producer_role: "user",
            sequence_num: 2,
            content: "I prefer soba."
          }
        ]
      }
    });
    const featureId2 = (
      await app.inject({
        method: "POST",
        url: "/semantic/features",
        payload: {
          set_id: "session-a",
          category: "profile",
          tag: "food",
          feature_name: "favorite_food",
          value: "soba"
        }
      })
    ).json().id as number;
    resources.semanticFeatureStore.addCitations(featureId2, ["ep-2"]);

    await app.inject({
      method: "DELETE",
      url: "/sessions/session-a"
    });
    expect(resources.sessionStore.getSession("session-a")).toBeNull();
    expect(resources.semanticFeatureStore.queryFeatures({ setId: "session-a" })).toEqual([]);

    await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        session_key: "session-b",
        org_id: "org-a",
        project_id: "project-a",
        session_id: "session-b",
        user_id: "user-1"
      }
    });
    await app.inject({
      method: "POST",
      url: "/memories",
      payload: {
        session_key: "session-b",
        semantic_set_id: "session-b",
        episodes: [
          {
            uid: "ep-3",
            session_key: "session-b",
            session_id: "session-b",
            producer_id: "user-1",
            producer_role: "user",
            sequence_num: 1,
            content: "I love udon."
          }
        ]
      }
    });
    await app.inject({
      method: "POST",
      url: "/semantic/features",
      payload: {
        set_id: "session-b",
        category: "profile",
        tag: "food",
        feature_name: "favorite_food",
        value: "udon"
      }
    });

    await app.inject({
      method: "DELETE",
      url: "/projects/org-a/project-a"
    });

    expect(resources.projectStore.listProjects("org-a")).toEqual([]);
    expect(resources.sessionStore.searchSessions({ orgId: "org-a", projectId: "project-a" })).toEqual([]);
    expect(resources.semanticFeatureStore.queryFeatures({ setId: "session-b" })).toEqual([]);

    await app.close();
  });
});
