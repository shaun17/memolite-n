import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type PackageJson = {
  name?: string;
  bin?: Record<string, string>;
  files?: string[];
  exports?: Record<string, string | Record<string, string>>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
};

const readPackageJson = (): PackageJson => {
  const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
};

describe("package manifest", () => {
  it("uses npm package name memolite-n", () => {
    const packageJson = readPackageJson();

    expect(packageJson.name).toBe("memolite-n");
  });

  it("only exposes the unified memolite command", () => {
    const packageJson = readPackageJson();

    expect(packageJson.bin).toMatchObject({
      memolite: expect.any(String)
    });
    expect(packageJson.bin).not.toHaveProperty("memolite-server");
    expect(packageJson.bin).not.toHaveProperty("memolite-mcp-stdio");
    expect(packageJson.bin).not.toHaveProperty("memolite-mcp-http");
    expect(packageJson.bin).not.toHaveProperty("memolite-configure");
  });

  it("ships a build script and a library export entry", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.build).toBeDefined();
    expect(packageJson.exports).toBeDefined();
    expect(packageJson.exports).toHaveProperty(".");
  });

  it("includes publish-time guards and release artifacts", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.prepublishOnly).toBe("npm run test && npm run build");
    expect(packageJson.files).toEqual(
      expect.arrayContaining(["bin", "dist", "assets/openclaw-plugin"])
    );
    expect(packageJson.engines?.node).toBeDefined();
  });
});
