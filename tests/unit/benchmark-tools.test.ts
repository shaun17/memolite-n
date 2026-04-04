import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { benchmarkSearchWorkload } from "../../src/tools/benchmark.js";

describe("benchmark tools", () => {
  it("measures episodic and semantic search workload latencies", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-bench-"));

    const result = await benchmarkSearchWorkload({
      sqlitePath: join(root, "memolite.sqlite3"),
      kuzuPath: join(root, "kuzu"),
      episodeCount: 5,
      queryIterations: 3
    });

    expect(result.episode_count).toBe(5);
    expect(result.query_iterations).toBe(3);
    expect(result.episodic_avg_latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.semantic_avg_latency_ms).toBeGreaterThanOrEqual(0);
  });
});
