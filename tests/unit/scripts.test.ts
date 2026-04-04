import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("scripts", () => {
  it("ships local startup and verification scripts", () => {
    const root = resolve(import.meta.dirname, "../..");
    const startLocal = resolve(root, "scripts/start_local.sh");
    const verify = resolve(root, "scripts/verify_memolite.sh");
    const openclawSetup = resolve(root, "scripts/setup_openclaw_memolite.sh");
    const service = resolve(root, "scripts/memolite_service.sh");

    expect(existsSync(startLocal)).toBe(true);
    expect(readFileSync(startLocal, "utf8").startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(existsSync(verify)).toBe(true);
    expect(existsSync(openclawSetup)).toBe(true);
    expect(existsSync(service)).toBe(true);
  });
});
