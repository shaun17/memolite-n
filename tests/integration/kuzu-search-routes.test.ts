import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import {
  resetTransformersBackendLoaderForTests,
  setTransformersBackendLoaderForTests,
  type TransformersBackendModule
} from "../../src/common/models/provider-factory.js";
import { createHttpApp } from "../../src/http/app.js";

describe("kuzu-backed episodic search routes", () => {
  afterEach(() => {
    clearSettingsCache();
    resetTransformersBackendLoaderForTests();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
    delete process.env.MEMOLITE_EMBEDDER_PROVIDER;
  });

  it("resolves episodic matches through kuzu graph edges", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-kuzu-search-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");
    process.env.MEMOLITE_EMBEDDER_PROVIDER = "sentence_transformer";

    const backend: TransformersBackendModule = {
      env: {},
      pipeline: async () => {
        return async (input) => {
          const text = String(input);
          if (text === "best soup") {
            return { data: new Float32Array([1, 0]) };
          }
          if (text.includes("soup")) {
            return { data: new Float32Array([1, 0]) };
          }
          return { data: new Float32Array([0, 1]) };
        };
      }
    };
    setTransformersBackendLoaderForTests(async () => backend);

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
            content: "soup noodles are perfect"
          }
        ]
      }
    });

    const search = await app.inject({
      method: "POST",
      url: "/memories/search",
      payload: {
        query: "best soup",
        session_key: "session-a",
        session_id: "session-a",
        mode: "episodic"
      }
    });

    expect(search.statusCode).toBe(200);
    expect(search.json().episodic_matches.map((item: { episode: { uid: string } }) => item.episode.uid)).toEqual([
      "ep-1"
    ]);

    await app.close();
  });
});
