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

type TsConfigJson = {
  extends?: string;
  compilerOptions?: {
    noEmit?: boolean;
    outDir?: string;
    rootDir?: string;
  };
};

const readPackageJson = (): PackageJson => {
  const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
};

const readBuildTsConfig = (): TsConfigJson => {
  const tsConfigPath = resolve(import.meta.dirname, "../../tsconfig.build.json");
  return JSON.parse(readFileSync(tsConfigPath, "utf8")) as TsConfigJson;
};

const readBinEntry = (): string => {
  const binPath = resolve(import.meta.dirname, "../../bin/memolite.js");
  return readFileSync(binPath, "utf8");
};

describe("package manifest", () => {
  it("uses npm package name memolite-n", () => {
    const packageJson = readPackageJson();

    expect(packageJson.name).toBe("memolite-n");
  });

  it("only exposes the unified memolite command", () => {
    const packageJson = readPackageJson();

    expect(packageJson.bin).toMatchObject({
      "memolite-n": expect.any(String)
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
    expect(packageJson.scripts?.prepack).toBe("npm run build");
    expect(packageJson.files).toEqual(
      expect.arrayContaining(["bin", "dist", "assets/openclaw-plugin"])
    );
    expect(packageJson.engines?.node).toBeDefined();
  });

  it("emits build artifacts into dist for publish-time execution", () => {
    const tsConfig = readBuildTsConfig();

    expect(tsConfig.compilerOptions?.outDir).toBe("./dist");
    expect(tsConfig.compilerOptions?.rootDir).toBe("./src");
    expect(tsConfig.compilerOptions?.noEmit).toBe(false);
  });

  it("resolves the memolite bin through built dist output instead of src", () => {
    const binEntry = readBinEntry();

    expect(binEntry).toContain("../dist/cli/root-cli.js");
    expect(binEntry).not.toContain("../src/cli/root-cli.js");
  });
});
