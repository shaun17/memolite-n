import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { executeCli } from "../../src/cli/root-cli.js";

describe("root cli execution", () => {
  it("writes a sample config through the unified memolite command", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-root-cli-"));
    const output = join(root, ".env.example");
    const dataDir = join(root, "data");

    const exitCode = await executeCli([
      "configure",
      "sample-config",
      "--output",
      output,
      "--data-dir",
      dataDir
    ]);

    expect(exitCode).toBe(0);
    expect(readFileSync(output, "utf8")).toContain("MEMOLITE_SQLITE_PATH=");
    expect(readFileSync(output, "utf8")).toContain("MEMOLITE_KUZU_PATH=");
  });

  it("initializes the local runtime data directory through configure init", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-root-cli-"));
    const dataDir = join(root, "data");

    const exitCode = await executeCli([
      "configure",
      "init",
      "--data-dir",
      dataDir
    ]);

    expect(exitCode).toBe(0);
  });

  it("dispatches serve to the injected server starter", async () => {
    const startServer = vi.fn(async () => undefined);

    const exitCode = await executeCli(["serve"], {
      startServer
    });

    expect(exitCode).toBe(0);
    expect(startServer).toHaveBeenCalledTimes(1);
  });

  it("dispatches mcp stdio and http to injected starters", async () => {
    const startMcpStdio = vi.fn(async () => undefined);
    const startMcpHttp = vi.fn(async () => undefined);

    expect(
      await executeCli(["mcp", "stdio"], {
        startMcpStdio,
        startMcpHttp
      })
    ).toBe(0);
    expect(
      await executeCli(["mcp", "http"], {
        startMcpStdio,
        startMcpHttp
      })
    ).toBe(0);

    expect(startMcpStdio).toHaveBeenCalledTimes(1);
    expect(startMcpHttp).toHaveBeenCalledTimes(1);
  });

  it("dispatches service actions to the injected service runner", async () => {
    const runServiceCommand = vi.fn(async () => 0);

    const exitCode = await executeCli(["service", "install", "--enable"], {
      runServiceCommand
    });

    expect(exitCode).toBe(0);
    expect(runServiceCommand).toHaveBeenCalledWith(["install", "--enable"]);
  });

  it("dispatches openclaw actions to the injected openclaw runner", async () => {
    const runOpenClawCommand = vi.fn(async () => 0);

    const exitCode = await executeCli(["openclaw", "configure", "show"], {
      runOpenClawCommand
    });

    expect(exitCode).toBe(0);
    expect(runOpenClawCommand).toHaveBeenCalledWith(["configure", "show"]);
  });

  it("exports and imports snapshots through configure subcommands", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-root-snapshot-"));
    const sourceDataDir = join(root, "source");
    const targetDataDir = join(root, "target");
    const snapshotPath = join(root, "snapshot.json");

    await executeCli(["configure", "init", "--data-dir", sourceDataDir]);
    const exported = await executeCli([
      "configure",
      "export",
      "--output",
      snapshotPath,
      "--data-dir",
      sourceDataDir
    ]);

    expect(exported).toBe(0);
    expect(readFileSync(snapshotPath, "utf8")).toContain("\"projects\"");

    await executeCli(["configure", "init", "--data-dir", targetDataDir]);
    const imported = await executeCli([
      "configure",
      "import",
      "--input",
      snapshotPath,
      "--data-dir",
      targetDataDir
    ]);

    expect(imported).toBe(0);
  });

  it("writes reconcile, repair, rebuild, and benchmark reports through configure", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-root-tools-"));
    const dataDir = join(root, "data");
    const reconcilePath = join(root, "reconcile.json");
    const repairPath = join(root, "repair.json");
    const rebuildPath = join(root, "rebuild.json");
    const benchmarkPath = join(root, "benchmark.json");

    await executeCli(["configure", "init", "--data-dir", dataDir]);

    expect(
      await executeCli([
        "configure",
        "reconcile",
        "--output",
        reconcilePath,
        "--data-dir",
        dataDir
      ])
    ).toBe(0);
    expect(
      await executeCli([
        "configure",
        "repair",
        "--output",
        repairPath,
        "--data-dir",
        dataDir
      ])
    ).toBe(0);
    expect(
      await executeCli([
        "configure",
        "rebuild-vectors",
        "--target",
        "all",
        "--output",
        rebuildPath,
        "--data-dir",
        dataDir
      ])
    ).toBe(0);
    expect(
      await executeCli([
        "configure",
        "benchmark-search",
        "--output",
        benchmarkPath,
        "--data-dir",
        dataDir,
        "--episode-count",
        "3",
        "--query-iterations",
        "2"
      ])
    ).toBe(0);

    expect(readFileSync(reconcilePath, "utf8")).toContain("missing_embedding_feature_ids");
    expect(readFileSync(repairPath, "utf8")).toContain("semantic_vectors_rebuilt");
    expect(readFileSync(rebuildPath, "utf8")).toContain("episodes_rebuilt");
    expect(readFileSync(benchmarkPath, "utf8")).toContain("episodic_avg_latency_ms");
  });
});
