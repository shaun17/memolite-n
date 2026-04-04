import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SemanticFeatureStore } from "../../src/storage/semantic-feature-store.js";
import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";

describe("semantic feature store", () => {
  it("deduplicates identical active features", () => {
    const sqlitePath = join(mkdtempSync(join(tmpdir(), "memolite-n-feature-store-")), "memolite.sqlite3");
    const database = createSqliteDatabase({ sqlitePath });
    initializeSqliteSchema(database);
    const store = new SemanticFeatureStore(database);

    const firstId = store.createFeature({
      setId: "set-a",
      category: "profile",
      tag: "food",
      featureName: "favorite_food",
      value: "ramen",
      metadataJson: "{\"source\":\"test\"}"
    });
    const secondId = store.createFeature({
      setId: "set-a",
      category: "profile",
      tag: "food",
      featureName: "favorite_food",
      value: "ramen",
      metadataJson: "{\"source\":\"test\"}"
    });

    expect(secondId).toBe(firstId);
    expect(store.queryFeatures({ setId: "set-a" })).toHaveLength(1);

    database.close();
  });
});
