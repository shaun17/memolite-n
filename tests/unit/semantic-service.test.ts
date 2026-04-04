import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CategoryRecord } from "../../src/storage/semantic-config-store.js";
import { SemanticConfigStore } from "../../src/storage/semantic-config-store.js";
import { SemanticFeatureStore } from "../../src/storage/semantic-feature-store.js";
import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";
import { encodeFloat32Embedding } from "../../src/vector/blob.js";
import { SemanticService } from "../../src/semantic/service.js";

describe("semantic service", () => {
  it("searches, lists, and deletes features with config-aware category rules", async () => {
    const sqlitePath = join(mkdtempSync(join(tmpdir(), "memolite-n-semantic-service-")), "memolite.sqlite3");
    const database = createSqliteDatabase({ sqlitePath });
    initializeSqliteSchema(database);
    const configStore = new SemanticConfigStore(database);
    const featureStore = new SemanticFeatureStore(database);

    const ramenId = featureStore.createFeature({
      setId: "set-a",
      category: "profile",
      tag: "food",
      featureName: "favorite_food",
      value: "ramen"
    });
    const aisleId = featureStore.createFeature({
      setId: "set-a",
      category: "travel",
      tag: "travel",
      featureName: "seat_preference",
      value: "aisle"
    });
    database.connection
      .prepare("INSERT INTO semantic_feature_vectors (feature_id, embedding) VALUES (?, ?)")
      .run(ramenId, encodeFloat32Embedding([1, 0]));
    database.connection
      .prepare("INSERT INTO semantic_feature_vectors (feature_id, embedding) VALUES (?, ?)")
      .run(aisleId, encodeFloat32Embedding([0, 1]));

    configStore.createCategory({
      setId: "set-a",
      name: "profile",
      prompt: "profile prompt"
    });

    const service = new SemanticService({
      configStore,
      featureStore,
      embedder: {
        encode: async (text: string) => (text.includes("food") ? [1, 0] : [0, 1])
      },
      defaultCategoryResolver: () => []
    });

    const search = await service.search({
      query: "food preference",
      setId: "set-a"
    });
    const listed = await service.list({
      setId: "set-a",
      pageSize: 10,
      pageNum: 0
    });
    await service.delete({
      setId: "set-a",
      tag: "travel"
    });
    const remaining = await service.list({
      setId: "set-a"
    });

    expect(search.features.map((item) => item.feature.feature_name)).toEqual([
      "favorite_food"
    ]);
    expect(listed).toHaveLength(2);
    expect(remaining.map((item) => item.feature_name)).toEqual(["favorite_food"]);

    database.close();
  });

  it("applies default categories and disabled categories", async () => {
    const sqlitePath = join(mkdtempSync(join(tmpdir(), "memolite-n-semantic-categories-")), "memolite.sqlite3");
    const database = createSqliteDatabase({ sqlitePath });
    initializeSqliteSchema(database);
    const configStore = new SemanticConfigStore(database);
    const featureStore = new SemanticFeatureStore(database);

    const defaultCategory: CategoryRecord = {
      id: 100,
      set_id: null,
      set_type_id: null,
      name: "profile",
      prompt: "default profile",
      description: null,
      inherited: true
    };
    configStore.createCategory({
      setId: "set-a",
      name: "travel",
      prompt: "travel prompt"
    });
    configStore.disableCategory({
      setId: "set-a",
      categoryName: "profile"
    });

    const service = new SemanticService({
      configStore,
      featureStore,
      embedder: {
        encode: async () => [1, 0]
      },
      defaultCategoryResolver: () => [defaultCategory]
    });

    const categories = await service.getDefaultCategories("set-a");

    expect(categories.map((item) => item.name)).toEqual(["travel"]);

    database.close();
  });
});
