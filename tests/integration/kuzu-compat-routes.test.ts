import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Connection, Database, type QueryResult } from "kuzu";
import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";

describe("kuzu compatibility routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("writes episodic graph projections into the configured kuzu database file", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-kuzu-"));
    const kuzuPath = join(root, "kuzu");
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
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
        session_id: "session-a"
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
            content: "ramen is great. soup is hot"
          }
        ]
      }
    });

    const database = new Database(kuzuPath);
    await database.init();
    const connection = new Connection(database);
    await connection.init();

    const episodes = await asSingleResult(
      await connection.query("MATCH (n:Episode) RETURN n.uid AS uid ORDER BY uid")
    ).getAll();
    const derivatives = await asSingleResult(
      await connection.query(
        "MATCH (n:Derivative) RETURN n.uid AS uid, n.episode_uid AS episode_uid ORDER BY uid"
      )
    ).getAll();
    const edges = await asSingleResult(
      await connection.query(
        "MATCH (src:Derivative)-[r:DERIVED_FROM]->(dst:Episode) RETURN src.uid AS derivative_uid, dst.uid AS episode_uid ORDER BY derivative_uid"
      )
    ).getAll();

    expect(episodes).toEqual([{ uid: "ep-1" }]);
    expect(derivatives).toEqual([
      { uid: "ep-1:d:1", episode_uid: "ep-1" },
      { uid: "ep-1:d:2", episode_uid: "ep-1" }
    ]);
    expect(edges).toEqual([
      { derivative_uid: "ep-1:d:1", episode_uid: "ep-1" },
      { derivative_uid: "ep-1:d:2", episode_uid: "ep-1" }
    ]);

    await connection.close();
    await database.close();
    await app.close();
  });
});

const asSingleResult = (result: QueryResult | QueryResult[]): QueryResult => {
  return Array.isArray(result) ? result[0]! : result;
};
