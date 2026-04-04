import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import {
  SqliteVecExtensionLoader,
  SqliteVecIndex
} from "../../src/storage/sqlite-vec.js";

describe("sqlite-vec compatibility", () => {
  const databases: Array<ReturnType<typeof createSqliteDatabase>> = [];

  afterEach(() => {
    for (const database of databases) {
      database.close();
    }
    databases.length = 0;
  });

  it("detects a configured sqlite-vec extension path", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-sqlite-vec-loader-"));
    const extensionPath = join(root, "sqlite-vec.dylib");
    const loader = new SqliteVecExtensionLoader(extensionPath);

    expect(loader.isAvailable()).toBe(false);
  });

  it("migrates legacy embedding_json rows and searches top-k with cosine fallback", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-sqlite-vec-"));
    const sqlitePath = join(root, "memolite.sqlite3");
    const database = createSqliteDatabase({ sqlitePath });
    databases.push(database);

    database.connection
      .prepare(
        `
          CREATE TABLE derivative_feature_vectors (
            feature_id INTEGER PRIMARY KEY,
            embedding_json TEXT NOT NULL
          )
        `
      )
      .run();
    database.connection
      .prepare(
        "INSERT INTO derivative_feature_vectors (feature_id, embedding_json) VALUES (?, ?), (?, ?)"
      )
      .run(11, "[1,0]", 12, "[0,1]");

    const index = new SqliteVecIndex(database, "derivative_feature_vectors", {
      idColumn: "feature_id"
    });
    await index.initialize();

    const rows = database.connection
      .prepare("SELECT feature_id, embedding FROM derivative_feature_vectors ORDER BY feature_id")
      .all() as Array<{ feature_id: number; embedding: Uint8Array }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].embedding).toBeInstanceOf(Uint8Array);

    const results = await index.searchTopK([1, 0], {
      limit: 2
    });
    expect(results.map((item) => item.itemId)).toEqual([11, 12]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});
