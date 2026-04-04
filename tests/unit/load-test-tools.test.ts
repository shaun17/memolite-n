import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";
import { loadTestMemorySearch } from "../../src/tools/load-test.js";

describe("load-test tools", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("runs concurrent requests against the memory search api", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-load-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "graph.kuzu");

    const app = createHttpApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port =
      address !== null && typeof address === "object" && "port" in address
        ? address.port
        : 18731;

    const result = await loadTestMemorySearch({
      baseUrl: `http://127.0.0.1:${port}`,
      orgId: "demo-org",
      projectId: "demo-project",
      query: "memory recall",
      totalRequests: 4,
      concurrency: 2,
      timeoutSeconds: 5
    });

    expect(result.total_requests).toBe(4);
    expect(result.success_count + result.failure_count).toBe(4);
    expect(result.avg_latency_ms).toBeGreaterThanOrEqual(0);

    await app.close();
  });
});
