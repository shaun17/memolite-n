import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createResources } from "../../src/app/resources.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";

describe("resources", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
    delete process.env.MEMOLITE_EMBEDDER_PROVIDER;
    delete process.env.MEMOLITE_EMBEDDER_MODEL;
  });

  it("uses a single persisted embedder provider override when present", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-resources-"));
    const sqlitePath = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_SQLITE_PATH = sqlitePath;
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");
    process.env.MEMOLITE_EMBEDDER_PROVIDER = "hash";
    process.env.MEMOLITE_EMBEDDER_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

    const database = createSqliteDatabase({ sqlitePath });
    initializeSqliteSchema(database);
    database.connection
      .prepare(
        "INSERT INTO semantic_config_set_id_resources (set_id, embedder_name) VALUES (?, ?)"
      )
      .run("set-a", "sentence_transformer");
    database.close();

    const resources = createResources();

    expect(resources.embedderProvider.name).toBe("sentence_transformer");

    resources.close();
  });
});
