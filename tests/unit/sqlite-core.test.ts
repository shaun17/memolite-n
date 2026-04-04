import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { SessionStore } from "../../src/storage/session-store.js";
import { EpisodeStore } from "../../src/storage/episode-store.js";

describe("sqlite core stores", () => {
  let database: ReturnType<typeof createSqliteDatabase> | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("bootstraps the base schema and supports project/session/episode flows", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-sqlite-"));
    const sqlitePath = join(root, "memolite.sqlite3");

    database = createSqliteDatabase({ sqlitePath });
    initializeSqliteSchema(database);

    const projectStore = new ProjectStore(database);
    const sessionStore = new SessionStore(database);
    const episodeStore = new EpisodeStore(database);

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

    expect(projectStore.getProject("org-a", "project-a")?.project_id).toBe("project-a");
    expect(sessionStore.getSession("session-a")?.user_id).toBe("user-1");
    expect(episodeStore.listEpisodes({ sessionKey: "session-a" })).toHaveLength(1);
    expect(projectStore.getEpisodeCount("org-a", "project-a")).toBe(1);

    episodeStore.deleteEpisodes(["ep-1"]);
    expect(episodeStore.listEpisodes({ sessionKey: "session-a" })).toHaveLength(0);
    expect(episodeStore.listEpisodes({ sessionKey: "session-a", includeDeleted: true })).toHaveLength(1);
  });
});
