import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppResources } from "../../src/app/resources.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";

describe("metrics routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("returns the resource metrics snapshot", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-metrics-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "graph.kuzu");

    const app = createHttpApp();
    const resources = (app as typeof app & { memoliteResources: AppResources }).memoliteResources;
    resources.metrics.increment("requests", 2);
    resources.metrics.observeTiming("search_latency_ms", 12.5);

    const response = await app.inject({
      method: "GET",
      url: "/metrics"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().service).toBe("MemoLite");
    expect(response.json().counters.requests).toBe(2);
    expect(response.json().timings_ms.search_latency_ms.last).toBe(12.5);

    await app.close();
  });
});
