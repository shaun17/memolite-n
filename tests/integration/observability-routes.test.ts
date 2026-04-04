import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";

describe("observability routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("emits search metrics across http, episodic, vector, and graph paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-observability-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");

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

    const search = await app.inject({
      method: "POST",
      url: "/memories/search",
      payload: {
        query: "favorite food",
        session_key: "session-a",
        session_id: "session-a"
      }
    });
    expect(search.statusCode).toBe(200);

    const metrics = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().counters.http_requests_total).toBeGreaterThanOrEqual(1);
    expect(metrics.json().counters.episodic_search_total).toBeGreaterThanOrEqual(1);
    expect(metrics.json().counters.vec_queries_total).toBeGreaterThanOrEqual(1);
    expect(metrics.json().counters.graph_queries_total).toBeGreaterThanOrEqual(1);
    expect(metrics.json().timings_ms.search_latency_ms.count).toBeGreaterThanOrEqual(1);

    await app.close();
  });
});
