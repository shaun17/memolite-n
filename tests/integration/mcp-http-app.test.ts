import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createResources } from "../../src/app/resources.js";
import { createMcpHttpApp } from "../../src/mcp/http-app.js";

describe("mcp http app", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("lists tools and supports tool calls over http", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-mcp-http-"));
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

    const app = createMcpHttpApp(resources);

    const tools = await app.inject({
      method: "GET",
      url: "/tools"
    });
    expect(tools.statusCode).toBe(200);
    expect(tools.json().tools.map((tool: { name: string }) => tool.name)).toContain("add_memory");

    const add = await app.inject({
      method: "POST",
      url: "/call-tool",
      payload: {
        name: "add_memory",
        input: {
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
      }
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().structured_content.uids).toEqual(["ep-1"]);

    await app.close();
    resources.close();
  });
});
