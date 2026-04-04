import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  benchmarkSearchWorkload
} from "../tools/benchmark.js";
import {
  rebuildVectorsSnapshot,
  reconcileSnapshot,
  repairSnapshot
} from "../tools/migration.js";
import { loadTestMemorySearch } from "../tools/load-test.js";
import { exportSnapshot, importSnapshot } from "../tools/snapshot.js";
import {
  buildCliSettings,
  configureEnvironment,
  detectSqliteVec,
  initializeLocalEnvironment,
  renderEnv,
  writeEnvFile
} from "./configure-cli.js";

const readOption = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
};

const hasFlag = (argv: string[], name: string): boolean => argv.includes(name);

const writeStructuredOutput = (payload: unknown, output?: string): void => {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (output === undefined) {
    process.stdout.write(serialized);
    return;
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialized, "utf8");
};

export const executeConfigureCommand = async (argv: string[]): Promise<number> => {
  const [subcommand, ...rest] = argv;
  const dataDir = readOption(rest, "--data-dir");

  if (subcommand === "configure") {
    configureEnvironment({
      output: readOption(rest, "--output") ?? ".env",
      dataDir,
      sqliteVecExtensionPath: readOption(rest, "--sqlite-vec-extension"),
      host: readOption(rest, "--host") ?? "127.0.0.1",
      port: Number(readOption(rest, "--port") ?? "18731"),
      overwrite: hasFlag(rest, "--overwrite")
    });
    return 0;
  }

  if (subcommand === "init") {
    initializeLocalEnvironment(buildCliSettings({ dataDir }));
    return 0;
  }

  if (subcommand === "sample-config") {
    const settings = buildCliSettings({
      dataDir,
      host: readOption(rest, "--host") ?? "127.0.0.1",
      port: Number(readOption(rest, "--port") ?? "18731")
    });
    writeEnvFile({
      output: readOption(rest, "--output") ?? ".env.example",
      settings,
      overwrite: hasFlag(rest, "--overwrite")
    });
    return 0;
  }

  if (subcommand === "detect-sqlite-vec") {
    return detectSqliteVec({
      extensionPath: readOption(rest, "--extension-path")
    });
  }

  const settings = buildCliSettings({ dataDir });
  const output = readOption(rest, "--output");

  if (subcommand === "export") {
    const outputPath = output;
    if (outputPath === undefined) {
      return 1;
    }
    exportSnapshot(settings.sqlitePath, outputPath);
    return 0;
  }

  if (subcommand === "import") {
    const inputPath = readOption(rest, "--input");
    if (inputPath === undefined) {
      return 1;
    }
    await importSnapshot(settings.sqlitePath, inputPath, settings.kuzuPath);
    return 0;
  }

  if (subcommand === "reconcile") {
    writeStructuredOutput(
      reconcileSnapshot({
        sqlitePath: settings.sqlitePath,
        kuzuPath: settings.kuzuPath
      }),
      output
    );
    return 0;
  }

  if (subcommand === "repair") {
    writeStructuredOutput(
      await repairSnapshot({
        sqlitePath: settings.sqlitePath,
        kuzuPath: settings.kuzuPath
      }),
      output
    );
    return 0;
  }

  if (subcommand === "rebuild-vectors") {
    writeStructuredOutput(
      await rebuildVectorsSnapshot({
        sqlitePath: settings.sqlitePath,
        kuzuPath: settings.kuzuPath,
        target:
          (readOption(rest, "--target") as "semantic" | "derivative" | "all" | undefined) ??
          "all"
      }),
      output
    );
    return 0;
  }

  if (subcommand === "benchmark-search") {
    writeStructuredOutput(
      await benchmarkSearchWorkload({
        sqlitePath: settings.sqlitePath,
        kuzuPath: settings.kuzuPath,
        episodeCount: Number(readOption(rest, "--episode-count") ?? "25"),
        queryIterations: Number(readOption(rest, "--query-iterations") ?? "10")
      }),
      output
    );
    return 0;
  }

  if (subcommand === "load-test") {
    writeStructuredOutput(
      await loadTestMemorySearch({
        baseUrl: readOption(rest, "--base-url") ?? "http://127.0.0.1:18731",
        orgId: readOption(rest, "--org-id") ?? "demo-org",
        projectId: readOption(rest, "--project-id") ?? "demo-project",
        query: readOption(rest, "--query") ?? "memory recall",
        totalRequests: Number(readOption(rest, "--total-requests") ?? "100"),
        concurrency: Number(readOption(rest, "--concurrency") ?? "10"),
        timeoutSeconds: Number(readOption(rest, "--timeout-seconds") ?? "5")
      }),
      output
    );
    return 0;
  }

  return 1;
};
