import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createOpenClawPaths,
  readOpenClawPluginConfig,
  resetOpenClawPluginConfig,
  setupOpenClawPlugin,
  setOpenClawBaseUrl,
  uninstallOpenClawPlugin
} from "../../src/openclaw/config-manager.js";

const seedOpenClawHome = (root: string): string => {
  const home = join(root, "home");
  const configDir = join(home, ".openclaw");
  const pluginDir = join(configDir, "extensions", "openclaw-memolite-n");

  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    join(pluginDir, "package.json"),
    JSON.stringify({ openclaw: { extensions: ["./dist/index.mjs"] } }),
    "utf8"
  );
  writeFileSync(
    join(configDir, "openclaw.json"),
    JSON.stringify({
      plugins: {
        slots: { memory: "openclaw-memolite-n" },
        entries: {
          "openclaw-memolite-n": {
            enabled: true,
            config: {
              baseUrl: "http://127.0.0.1:18732",
              orgId: "openclaw",
              projectId: "openclaw",
              userId: "openclaw",
              autoCapture: true,
              autoRecall: true,
              searchThreshold: 0.5,
              topK: 5
            }
          }
        }
      }
    }),
    "utf8"
  );

  return home;
};

describe("openclaw config manager", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("updates and resets the plugin base url", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-openclaw-a-"));
    roots.push(root);
    const home = seedOpenClawHome(root);
    const paths = createOpenClawPaths(home);

    expect(setOpenClawBaseUrl(paths, "http://127.0.0.1:19999").baseUrl).toBe(
      "http://127.0.0.1:19999"
    );
    expect(readOpenClawPluginConfig(paths)?.baseUrl).toBe("http://127.0.0.1:19999");
    expect(resetOpenClawPluginConfig(paths).baseUrl).toBe("http://127.0.0.1:18732");
  });

  it("materializes runtime plugin assets during setup", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-openclaw-setup-"));
    roots.push(root);
    const home = join(root, "home");
    const paths = createOpenClawPaths(home);

    const config = setupOpenClawPlugin(paths, {
      baseUrl: "http://127.0.0.1:19999"
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:19999");
    expect(existsSync(join(paths.pluginDir, "package.json"))).toBe(true);
    expect(existsSync(join(paths.pluginDir, "openclaw.plugin.json"))).toBe(true);
    expect(existsSync(join(paths.pluginDir, "dist", "index.mjs"))).toBe(true);
  });

  it("supports dry-run uninstall without mutating files", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-openclaw-b-"));
    roots.push(root);
    const home = seedOpenClawHome(root);
    const paths = createOpenClawPaths(home);

    const result = uninstallOpenClawPlugin(paths, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(existsSync(paths.pluginDir)).toBe(true);
    expect(readFileSync(paths.configPath, "utf8")).toContain("openclaw-memolite-n");
  });

  it("removes the plugin entry, memory slot, and plugin directory on uninstall", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-openclaw-c-"));
    roots.push(root);
    const home = seedOpenClawHome(root);
    const paths = createOpenClawPaths(home);

    const result = uninstallOpenClawPlugin(paths);

    expect(result.dryRun).toBe(false);
    expect(existsSync(paths.pluginDir)).toBe(false);
    expect(readFileSync(paths.configPath, "utf8")).not.toContain("openclaw-memolite-n");
    expect(readFileSync(paths.configPath, "utf8")).not.toContain("\"memory\"");
  });

  it("adds the plugin id to plugins.allow on setup", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-openclaw-d-"));
    roots.push(root);
    const home = join(root, "home");
    const configDir = join(home, ".openclaw");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "openclaw.json"),
      JSON.stringify({ plugins: { allow: ["telegram"] } }),
      "utf8"
    );
    const paths = createOpenClawPaths(home);

    setupOpenClawPlugin(paths);

    const saved = JSON.parse(readFileSync(paths.configPath, "utf8")) as {
      plugins: { allow: string[] };
    };
    expect(saved.plugins.allow).toContain("openclaw-memolite-n");
    expect(saved.plugins.allow).toContain("telegram");
  });

  it("removes the plugin id from plugins.allow on uninstall", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-openclaw-e-"));
    roots.push(root);
    const home = join(root, "home");
    const configDir = join(home, ".openclaw");
    const pluginDir = join(configDir, "extensions", "openclaw-memolite-n");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(configDir, "openclaw.json"),
      JSON.stringify({
        plugins: {
          allow: ["telegram", "openclaw-memolite-n"],
          slots: { memory: "openclaw-memolite-n" },
          entries: { "openclaw-memolite-n": { enabled: true } }
        }
      }),
      "utf8"
    );
    const paths = createOpenClawPaths(home);

    uninstallOpenClawPlugin(paths);

    const saved = JSON.parse(readFileSync(paths.configPath, "utf8")) as {
      plugins: { allow: string[] };
    };
    expect(saved.plugins.allow).not.toContain("openclaw-memolite-n");
    expect(saved.plugins.allow).toContain("telegram");
  });
});
