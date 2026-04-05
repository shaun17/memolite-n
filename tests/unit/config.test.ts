import { describe, expect, it } from "vitest";

import {
  DEFAULT_DATA_DIR,
  DEFAULT_KUZU_PATH,
  LEGACY_SQLITE_PATH,
  ENV_PREFIX,
  resolveDefaultSqlitePath
} from "../../src/common/config/settings.js";

describe("settings compatibility", () => {
  it("uses the MEMOLITE environment prefix", () => {
    expect(ENV_PREFIX).toBe("MEMOLITE_");
  });

  it("keeps the same default data locations as Python", () => {
    expect(String(DEFAULT_DATA_DIR)).toContain(".memolite");
    expect(String(DEFAULT_KUZU_PATH)).toContain(".memolite");
    expect(String(LEGACY_SQLITE_PATH)).toContain("memlite.sqlite3");
  });

  it("prefers memolite.sqlite3, then falls back to legacy memlite.sqlite3", () => {
    const preferred = "/tmp/.memolite/memolite.sqlite3";
    const legacy = "/tmp/.memolite/memlite.sqlite3";

    expect(
      resolveDefaultSqlitePath({
        preferredPath: preferred,
        legacyPath: legacy,
        exists: (candidate: string) => candidate === preferred
      })
    ).toBe(preferred);

    expect(
      resolveDefaultSqlitePath({
        preferredPath: preferred,
        legacyPath: legacy,
        exists: (candidate: string) => candidate === legacy
      })
    ).toBe(legacy);
  });
});
