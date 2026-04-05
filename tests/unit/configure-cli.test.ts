import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCliSettings,
  configureEnvironment,
  initializeLocalEnvironment,
  detectSqliteVec,
  renderEnv,
  writeEnvFile
} from "../../src/cli/configure-cli.js";

describe("configure cli helpers", () => {
  it("builds settings from the provided data directory", () => {
    const dataDir = join("/tmp", "memolite-data");
    const settings = buildCliSettings({ dataDir });

    expect(settings.sqlitePath).toBe(join(dataDir, "memolite.sqlite3"));
    expect(settings.kuzuPath).toBe(join(dataDir, "kuzu"));
    expect(settings.host).toBe("127.0.0.1");
    expect(settings.port).toBe(18731);
  });

  it("renders a memolite env file", () => {
    const content = renderEnv(
      buildCliSettings({
        dataDir: "/tmp/memolite-data",
        host: "127.0.0.1",
        port: 19001
      })
    );

    expect(content).toContain("MEMOLITE_HOST=127.0.0.1");
    expect(content).toContain("MEMOLITE_PORT=19001");
    expect(content).toContain("MEMOLITE_SQLITE_PATH=/tmp/memolite-data/memolite.sqlite3");
    expect(content).toContain("MEMOLITE_KUZU_PATH=/tmp/memolite-data/kuzu");
  });

  it("refuses to overwrite env files by default", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-config-"));
    const output = join(root, ".env");
    writeFileSync(output, "EXISTING=1\n", "utf8");

    expect(() =>
      writeEnvFile({
        output,
        settings: buildCliSettings({ dataDir: join(root, "data") }),
        overwrite: false
      })
    ).toThrow(/file already exists/);
  });

  it("writes env files and creates the data directory", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-config-"));
    const output = join(root, ".env");
    const dataDir = join(root, "data");

    configureEnvironment({
      output,
      dataDir,
      host: "127.0.0.1",
      port: 19002,
      overwrite: true
    });

    expect(readFileSync(output, "utf8")).toContain("MEMOLITE_PORT=19002");
  });

  it("initializes local sqlite and data directories", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-init-"));
    const dataDir = join(root, "data");

    const settings = buildCliSettings({ dataDir });
    initializeLocalEnvironment(settings);

    expect(() => readFileSync(settings.sqlitePath, "utf8")).not.toThrow();
    expect(existsSync(settings.kuzuPath)).toBe(false);
    expect(statSync(dataDir).isDirectory()).toBe(true);
  });

  it("detects sqlite-vec by the configured path", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-sqlite-vec-"));
    const extensionPath = join(root, "sqlite-vec.dylib");

    expect(detectSqliteVec({ extensionPath })).toBe(1);

    writeFileSync(extensionPath, "", "utf8");
    expect(detectSqliteVec({ extensionPath })).toBe(0);
  });
});
