import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createHttpApp } from "../../src/http/app.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";

describe("basic api routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("supports project, session, and memory CRUD basics", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-api-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");

    const app = createHttpApp();

    const createProject = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        org_id: "org-a",
        project_id: "project-a",
        description: "demo"
      }
    });
    expect(createProject.statusCode).toBe(200);
    expect(createProject.json()).toEqual({ status: "ok" });

    const createSession = await app.inject({
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
    expect(createSession.statusCode).toBe(200);

    const addMemory = await app.inject({
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
    expect(addMemory.statusCode).toBe(200);
    expect(addMemory.json()).toEqual([{ uid: "ep-1" }]);

    const project = await app.inject({
      method: "GET",
      url: "/projects/org-a/project-a"
    });
    expect(project.statusCode).toBe(200);
    expect(project.json().project_id).toBe("project-a");

    const count = await app.inject({
      method: "GET",
      url: "/projects/org-a/project-a/episodes/count"
    });
    expect(count.statusCode).toBe(200);
    expect(count.json()).toEqual({ count: 1 });

    const session = await app.inject({
      method: "GET",
      url: "/sessions/session-a"
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().session_key).toBe("session-a");

    const listedSessions = await app.inject({
      method: "GET",
      url: "/sessions",
      query: {
        org_id: "org-a",
        project_id: "project-a",
        user_id: "user-1"
      }
    });
    expect(listedSessions.statusCode).toBe(200);
    expect(listedSessions.json()).toHaveLength(1);

    const memories = await app.inject({
      method: "GET",
      url: "/memories",
      query: {
        session_key: "session-a"
      }
    });
    expect(memories.statusCode).toBe(200);
    expect(memories.json()).toHaveLength(1);

    const memory = await app.inject({
      method: "GET",
      url: "/memories/ep-1"
    });
    expect(memory.statusCode).toBe(200);
    expect(memory.json().uid).toBe("ep-1");

    const shortTermConfig = await app.inject({
      method: "GET",
      url: "/memory-config/short-term"
    });
    expect(shortTermConfig.statusCode).toBe(200);
    expect(shortTermConfig.json()).toEqual({
      message_capacity: 4096,
      summary_enabled: true
    });

    const updatedShortTermConfig = await app.inject({
      method: "PATCH",
      url: "/memory-config/short-term",
      payload: {
        message_capacity: 12,
        summary_enabled: false
      }
    });
    expect(updatedShortTermConfig.statusCode).toBe(200);
    expect(updatedShortTermConfig.json()).toEqual({
      message_capacity: 12,
      summary_enabled: false
    });

    const search = await app.inject({
      method: "POST",
      url: "/memories/search",
      payload: {
        query: "food ramen",
        session_key: "session-a",
        mode: "auto"
      }
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().mode).toBe("mixed");
    expect(search.json().episodic_matches[0].episode.uid).toBe("ep-1");
    expect(search.json().episodic_matches[0].derivative_uid).toBe("ep-1:d:1");
    expect(search.json().short_term_context).toContain("user: Ramen is my favorite food.");
    expect(Object.keys(search.json())).toEqual([
      "mode",
      "rewritten_query",
      "subqueries",
      "episodic_matches",
      "semantic_features",
      "combined",
      "expanded_context",
      "short_term_context"
    ]);

    const updatedEpisodicConfig = await app.inject({
      method: "PATCH",
      url: "/memory-config/episodic",
      payload: {
        top_k: 1,
        context_window: 0
      }
    });
    expect(updatedEpisodicConfig.statusCode).toBe(200);
    expect(updatedEpisodicConfig.json().top_k).toBe(1);

    const updatedLongTermConfig = await app.inject({
      method: "PATCH",
      url: "/memory-config/long-term",
      payload: {
        semantic_enabled: false
      }
    });
    expect(updatedLongTermConfig.statusCode).toBe(200);
    expect(updatedLongTermConfig.json().semantic_enabled).toBe(false);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/memories/episodes",
      payload: {
        episode_uids: ["ep-1"]
      }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ status: "ok" });

    const memoriesAfterDelete = await app.inject({
      method: "GET",
      url: "/memories",
      query: {
        session_key: "session-a"
      }
    });
    expect(memoriesAfterDelete.statusCode).toBe(200);
    expect(memoriesAfterDelete.json()).toEqual([]);

    const deleteSession = await app.inject({
      method: "DELETE",
      url: "/sessions/session-a"
    });
    expect(deleteSession.statusCode).toBe(200);
    expect(deleteSession.json()).toEqual({ status: "ok" });

    const missingSession = await app.inject({
      method: "GET",
      url: "/sessions/session-a"
    });
    expect(missingSession.statusCode).toBe(404);

    const deleteProject = await app.inject({
      method: "DELETE",
      url: "/projects/org-a/project-a"
    });
    expect(deleteProject.statusCode).toBe(200);
    expect(deleteProject.json()).toEqual({ status: "ok" });

    const createFeature = await app.inject({
      method: "POST",
      url: "/semantic/features",
      payload: {
        set_id: "set-a",
        category: "profile",
        tag: "food",
        feature_name: "favorite_food",
        value: "ramen",
        metadata_json: "{\"source\":\"test\"}"
      }
    });
    expect(createFeature.statusCode).toBe(200);
    const featureId = createFeature.json().id;

    const getFeature = await app.inject({
      method: "GET",
      url: `/semantic/features/${featureId}`
    });
    expect(getFeature.statusCode).toBe(200);
    expect(getFeature.json().value).toBe("ramen");

    const updateFeature = await app.inject({
      method: "PATCH",
      url: `/semantic/features/${featureId}`,
      payload: {
        value: "soba"
      }
    });
    expect(updateFeature.statusCode).toBe(200);
    expect(updateFeature.json()).toEqual({ status: "ok" });

    const getFeatureAfter = await app.inject({
      method: "GET",
      url: `/semantic/features/${featureId}`
    });
    expect(getFeatureAfter.statusCode).toBe(200);
    expect(getFeatureAfter.json().value).toBe("soba");

    const restoreLongTermConfig = await app.inject({
      method: "PATCH",
      url: "/memory-config/long-term",
      payload: {
        semantic_enabled: true,
        episodic_enabled: true
      }
    });
    expect(restoreLongTermConfig.statusCode).toBe(200);

    const semanticSearch = await app.inject({
      method: "POST",
      url: "/memories/search",
      payload: {
        query: "favorite_food soba",
        semantic_set_id: "set-a",
        mode: "mixed"
      }
    });
    expect(semanticSearch.statusCode).toBe(200);
    expect(semanticSearch.json().mode).toBe("mixed");
    expect(semanticSearch.json().semantic_features).toHaveLength(1);

    const agentMode = await app.inject({
      method: "POST",
      url: "/memories/agent",
      payload: {
        query: "favorite_food soba",
        semantic_set_id: "set-a",
        mode: "mixed"
      }
    });
    expect(agentMode.statusCode).toBe(200);
    expect(agentMode.json().search.mode).toBe("mixed");
    expect(agentMode.json().context_text).toContain("[semantic] soba");

    const deleteSemantic = await app.inject({
      method: "DELETE",
      url: "/memories/semantic",
      payload: {
        feature_ids: [featureId]
      }
    });
    expect(deleteSemantic.statusCode).toBe(200);
    expect(deleteSemantic.json()).toEqual({ status: "ok" });

    const semanticSearchAfterDelete = await app.inject({
      method: "POST",
      url: "/memories/search",
      payload: {
        query: "favorite_food soba",
        semantic_set_id: "set-a",
        mode: "semantic"
      }
    });
    expect(semanticSearchAfterDelete.statusCode).toBe(200);
    expect(semanticSearchAfterDelete.json().semantic_features).toEqual([]);

    await app.close();
  });
});
