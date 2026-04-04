import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createResources } from "../../src/app/resources.js";
import { createMcpServer } from "../../src/mcp/server.js";

describe("mcp server", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
    delete process.env.MEMOLITE_MCP_API_KEY;
  });

  it("supports add, search, list, get, delete, and context tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-mcp-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");

    const resources = createResources();
    resources.projectStore.createProject("org-a", "project-a", null);
    resources.sessionStore.createSession({
      sessionKey: "session-a",
      orgId: "org-a",
      projectId: "project-a",
      sessionId: "session-a",
      userId: "user-1"
    });

    const server = createMcpServer(resources);

    const setContext = await server.callTool("set_context", {
      session_key: "session-a",
      session_id: "session-a",
      semantic_set_id: "set-a",
      mode: "mixed",
      limit: 3,
      context_window: 2
    });
    const add = await server.callTool("add_memory", {
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
    });
    const search = await server.callTool("search_memory", {
      query: "food ramen"
    });
    const listed = await server.callTool("list_memory", {});
    const fetched = await server.callTool("get_memory", { uid: "ep-1" });
    const deleted = await server.callTool("delete_memory", {
      episode_uids: ["ep-1"]
    });
    const context = await server.callTool("get_context", {});

    expect(setContext.structured_content.context.session_key).toBe("session-a");
    expect(add.structured_content.uids).toEqual(["ep-1"]);
    expect(search.structured_content.combined[0].identifier).toBe("ep-1");
    expect(listed.structured_content.episodes[0].uid).toBe("ep-1");
    expect(fetched.structured_content.memory.uid).toBe("ep-1");
    expect(deleted.structured_content.status).toBe("ok");
    expect(context.structured_content.context.mode).toBe("mixed");

    resources.close();
  });

  it("rejects missing api keys when configured and emits readable missing-session errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-mcp-auth-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");
    process.env.MEMOLITE_MCP_API_KEY = "secret-key";

    const resources = createResources();
    const server = createMcpServer(resources);

    await expect(server.callTool("get_context", {})).rejects.toThrow(/unauthorized/i);
    await expect(
      server.callTool("add_memory", {
        api_key: "secret-key",
        session_key: "missing-session",
        episodes: [
          {
            uid: "ep-1",
            session_key: "missing-session",
            session_id: "missing-session",
            producer_id: "user-1",
            producer_role: "user",
            sequence_num: 1,
            content: "Ramen is my favorite food."
          }
        ]
      })
    ).rejects.toThrow(/session not found: missing-session/i);

    const authorized = await server.callTool("get_context", {
      api_key: "secret-key"
    });
    expect(authorized.structured_content.context.session_key).toBeUndefined();

    resources.close();
  });
});
