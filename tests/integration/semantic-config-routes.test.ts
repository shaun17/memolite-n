import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";

describe("semantic config routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("matches the python semantic config happy path", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-semantic-api-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "graph.kuzu");

    const app = createHttpApp();

    const setType = await app.inject({
      method: "POST",
      url: "/semantic/config/set-types",
      payload: {
        org_id: "org-a",
        metadata_tags_sig: "user_id|agent_id",
        name: "default"
      }
    });
    expect(setType.statusCode).toBe(200);
    const setTypeId = setType.json().id as number;

    const setConfig = await app.inject({
      method: "POST",
      url: "/semantic/config/sets",
      payload: {
        set_id: "set-a",
        set_type_id: setTypeId,
        set_name: "Set A",
        embedder_name: "default"
      }
    });
    expect(setConfig.statusCode).toBe(200);
    expect(setConfig.json().set_name).toBe("Set A");

    const inheritedCategory = await app.inject({
      method: "POST",
      url: "/semantic/config/categories",
      payload: {
        set_type_id: setTypeId,
        name: "persona",
        prompt: "persona prompt"
      }
    });
    expect(inheritedCategory.statusCode).toBe(200);

    const category = await app.inject({
      method: "POST",
      url: "/semantic/config/categories",
      payload: {
        set_id: "set-a",
        name: "profile",
        prompt: "profile prompt"
      }
    });
    expect(category.statusCode).toBe(200);
    const categoryId = category.json().id as number;

    const template = await app.inject({
      method: "POST",
      url: "/semantic/config/category-templates",
      payload: {
        set_type_id: setTypeId,
        name: "profile-template",
        category_name: "profile",
        prompt: "template prompt"
      }
    });
    expect(template.statusCode).toBe(200);

    const tag = await app.inject({
      method: "POST",
      url: "/semantic/config/tags",
      payload: {
        category_id: categoryId,
        name: "food",
        description: "Food preference"
      }
    });
    expect(tag.statusCode).toBe(200);

    const disabled = await app.inject({
      method: "POST",
      url: "/semantic/config/disabled-categories",
      payload: {
        set_id: "set-a",
        category_name: "persona"
      }
    });
    expect(disabled.statusCode).toBe(200);

    const listedSetTypes = await app.inject({
      method: "GET",
      url: "/semantic/config/set-types",
      query: {
        org_id: "org-a"
      }
    });
    expect(listedSetTypes.statusCode).toBe(200);
    expect(listedSetTypes.json()[0].id).toBe(setTypeId);

    const fetchedSet = await app.inject({
      method: "GET",
      url: "/semantic/config/sets/set-a"
    });
    expect(fetchedSet.statusCode).toBe(200);
    expect(fetchedSet.json().set_name).toBe("Set A");

    const listedSetIds = await app.inject({
      method: "GET",
      url: "/semantic/config/sets"
    });
    expect(listedSetIds.statusCode).toBe(200);
    expect(listedSetIds.json()).toEqual(["set-a"]);

    const fetchedCategory = await app.inject({
      method: "GET",
      url: `/semantic/config/categories/${categoryId}`
    });
    expect(fetchedCategory.statusCode).toBe(200);
    expect(fetchedCategory.json().name).toBe("profile");

    const listedCategories = await app.inject({
      method: "GET",
      url: "/semantic/config/categories",
      query: {
        set_id: "set-a"
      }
    });
    expect(listedCategories.statusCode).toBe(200);
    expect(listedCategories.json().map((entry: { name: string; inherited: boolean }) => entry.name)).toEqual([
      "profile",
      "persona"
    ]);
    expect(listedCategories.json().map((entry: { name: string; inherited: boolean }) => entry.inherited)).toEqual([
      false,
      true
    ]);

    const categorySetIds = await app.inject({
      method: "GET",
      url: "/semantic/config/categories/profile/set-ids"
    });
    expect(categorySetIds.statusCode).toBe(200);
    expect(categorySetIds.json()).toEqual(["set-a"]);

    const listedTemplates = await app.inject({
      method: "GET",
      url: "/semantic/config/category-templates",
      query: {
        set_type_id: String(setTypeId)
      }
    });
    expect(listedTemplates.statusCode).toBe(200);
    expect(listedTemplates.json()[0].name).toBe("profile-template");

    const listedTags = await app.inject({
      method: "GET",
      url: "/semantic/config/tags",
      query: {
        category_id: String(categoryId)
      }
    });
    expect(listedTags.statusCode).toBe(200);
    expect(listedTags.json()[0].name).toBe("food");

    const disabledCategories = await app.inject({
      method: "GET",
      url: "/semantic/config/disabled-categories/set-a"
    });
    expect(disabledCategories.statusCode).toBe(200);
    expect(disabledCategories.json()).toEqual(["persona"]);

    await app.close();
  });
});
