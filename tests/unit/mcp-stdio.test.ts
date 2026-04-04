import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createResources } from "../../src/app/resources.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { handleMcpStdioLine } from "../../src/mcp/runtime.js";

describe("mcp stdio", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("processes tool calls from a JSON line", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-mcp-stdio-"));
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

    const output = await handleMcpStdioLine(
      server,
      JSON.stringify({
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
      })
    );

    expect(JSON.parse(output).structured_content.uids).toEqual(["ep-1"]);
    resources.close();
  });
});
