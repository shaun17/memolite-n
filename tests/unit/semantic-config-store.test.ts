import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SemanticConfigStore } from "../../src/storage/semantic-config-store.js";
import { createSqliteDatabase } from "../../src/storage/sqlite/database.js";
import { initializeSqliteSchema } from "../../src/storage/sqlite/schema.js";

describe("semantic config store", () => {
  let database: ReturnType<typeof createSqliteDatabase> | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("supports set binding, inherited categories, templates, tags, and disabled categories", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-semantic-config-"));
    const sqlitePath = join(root, "memolite.sqlite3");

    database = createSqliteDatabase({ sqlitePath });
    initializeSqliteSchema(database);

    const store = new SemanticConfigStore(database);

    const setTypeId = store.createSetType({
      orgId: "org-a",
      metadataTagsSig: "user_id|agent_id",
      name: "default",
      description: "Default set type"
    });

    store.setSetConfig({
      setId: "set-a",
      setName: "Set A",
      setDescription: "Primary set",
      embedderName: "sentence_transformer",
      languageModelName: "gpt-4.1"
    });
    store.registerSetTypeBinding({
      setId: "set-a",
      setTypeId
    });

    const inheritedCategoryId = store.createCategory({
      setTypeId,
      name: "persona",
      prompt: "persona prompt"
    });
    const localCategoryId = store.createCategory({
      setId: "set-a",
      name: "profile",
      prompt: "profile prompt",
      description: "Set-specific category"
    });
    const templateId = store.createCategoryTemplate({
      setTypeId,
      name: "persona-template",
      categoryName: "persona",
      prompt: "template prompt"
    });
    const tagId = store.createTag({
      categoryId: localCategoryId,
      name: "food",
      description: "Food preference"
    });
    store.disableCategory({
      setId: "set-a",
      categoryName: "persona"
    });

    expect(store.listSetTypes("org-a")).toEqual([
      {
        id: setTypeId,
        org_id: "org-a",
        org_level_set: 0,
        metadata_tags_sig: "user_id|agent_id",
        name: "default",
        description: "Default set type"
      }
    ]);
    expect(store.listSetIds()).toEqual(["set-a"]);
    expect(store.getSetConfig("set-a")).toEqual({
      set_id: "set-a",
      set_name: "Set A",
      set_description: "Primary set",
      embedder_name: "sentence_transformer",
      language_model_name: "gpt-4.1"
    });
    expect(store.getCategory(inheritedCategoryId)?.name).toBe("persona");
    expect(store.getCategorySetIds("profile")).toEqual(["set-a"]);
    expect(store.listCategoriesForSet("set-a")).toEqual([
      {
        id: localCategoryId,
        set_id: "set-a",
        set_type_id: null,
        name: "profile",
        prompt: "profile prompt",
        description: "Set-specific category",
        inherited: false
      },
      {
        id: inheritedCategoryId,
        set_id: null,
        set_type_id: setTypeId,
        name: "persona",
        prompt: "persona prompt",
        description: null,
        inherited: true
      }
    ]);
    expect(store.listCategoryTemplates(setTypeId)).toEqual([
      {
        id: templateId,
        set_type_id: setTypeId,
        name: "persona-template",
        category_name: "persona",
        prompt: "template prompt",
        description: null
      }
    ]);
    expect(store.listTags(localCategoryId)).toEqual([
      {
        id: tagId,
        category_id: localCategoryId,
        name: "food",
        description: "Food preference"
      }
    ]);
    expect(store.listDisabledCategories("set-a")).toEqual(["persona"]);
  });
});
