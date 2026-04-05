import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("package pack smoke", () => {
  it(
    "packs the package and runs the memolite bin from the tarball",
    () => {
      const repoRoot = resolve(import.meta.dirname, "../..");
      const workdir = mkdtempSync(join(tmpdir(), "memolite-n-pack-"));

      const packJson = execFileSync(
        "npm",
        ["pack", "--json", "--pack-destination", workdir],
        {
          cwd: repoRoot,
          encoding: "utf8"
        }
      );
      const [{ filename }] = JSON.parse(packJson) as Array<{ filename: string }>;
      const tarballPath = join(workdir, filename);
      execFileSync("tar", ["-xzf", tarballPath, "-C", workdir]);

      const packageDir = join(workdir, "package");
      symlinkSync(join(repoRoot, "node_modules"), join(packageDir, "node_modules"), "dir");

      const output = join(workdir, "sample.env");
      execFileSync(
        process.execPath,
        [
          "bin/memolite.js",
          "configure",
          "sample-config",
          "--output",
          output,
          "--data-dir",
          join(workdir, "data")
        ],
        {
          cwd: packageDir,
          stdio: "pipe"
        }
      );

      const content = readFileSync(output, "utf8");
      expect(content).toContain("MEMOLITE_SQLITE_PATH=");
      expect(content).toContain("MEMOLITE_KUZU_PATH=");
      expect(readFileSync(join(packageDir, "bin", "memolite.js"), "utf8")).toContain(
        "../dist/cli/root-cli.js"
      );
      expect(readFileSync(join(packageDir, "package.json"), "utf8")).toContain("\"name\": \"memolite-n\"");
      expect(readFileSync(join(packageDir, "dist", "cli", "root-cli.js"), "utf8")).toContain(
        "program.name(\"memolite\")"
      );
    },
    60000
  );
});
