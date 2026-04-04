import type { SqliteDatabase } from "./sqlite/database.js";

export type SetTypeRecord = {
  id: number;
  org_id: string;
  org_level_set: number;
  metadata_tags_sig: string;
  name: string | null;
  description: string | null;
};

export type SetConfigRecord = {
  set_id: string;
  set_name: string | null;
  set_description: string | null;
  embedder_name: string | null;
  language_model_name: string | null;
};

export type CategoryRecord = {
  id: number;
  set_id: string | null;
  set_type_id: number | null;
  name: string;
  prompt: string;
  description: string | null;
  inherited: boolean;
};

export type CategoryTemplateRecord = {
  id: number;
  set_type_id: number | null;
  name: string;
  category_name: string;
  prompt: string;
  description: string | null;
};

export type TagRecord = {
  id: number;
  category_id: number;
  name: string;
  description: string;
};

export class SemanticConfigStore {
  constructor(private readonly database: SqliteDatabase) {}

  createSetType(input: {
    orgId: string;
    metadataTagsSig: string;
    orgLevelSet?: boolean;
    name?: string | null;
    description?: string | null;
  }): number {
    const result = this.database.connection
      .prepare(
        `
          INSERT INTO semantic_config_set_type (
            org_id, org_level_set, metadata_tags_sig, name, description
          ) VALUES (
            @orgId, @orgLevelSet, @metadataTagsSig, @name, @description
          )
        `
      )
      .run({
        orgId: input.orgId,
        orgLevelSet: input.orgLevelSet === true ? 1 : 0,
        metadataTagsSig: input.metadataTagsSig,
        name: input.name ?? null,
        description: input.description ?? null
      });
    return Number(result.lastInsertRowid);
  }

  listSetTypes(orgId?: string): SetTypeRecord[] {
    if (orgId === undefined) {
      return this.database.connection
        .prepare(
          `
            SELECT id, org_id, org_level_set, metadata_tags_sig, name, description
            FROM semantic_config_set_type
            ORDER BY id
          `
        )
        .all() as SetTypeRecord[];
    }
    return this.database.connection
      .prepare(
        `
          SELECT id, org_id, org_level_set, metadata_tags_sig, name, description
          FROM semantic_config_set_type
          WHERE org_id = ?
          ORDER BY id
        `
      )
      .all(orgId) as SetTypeRecord[];
  }

  deleteSetType(setTypeId: number): void {
    this.database.connection
      .prepare("DELETE FROM semantic_config_set_type WHERE id = ?")
      .run(setTypeId);
  }

  setSetConfig(input: {
    setId: string;
    setName?: string | null;
    setDescription?: string | null;
    embedderName?: string | null;
    languageModelName?: string | null;
  }): void {
    this.database.connection
      .prepare(
        `
          INSERT INTO semantic_config_set_id_resources (
            set_id, set_name, set_description, embedder_name, language_model_name
          ) VALUES (
            @setId, @setName, @setDescription, @embedderName, @languageModelName
          )
          ON CONFLICT(set_id)
          DO UPDATE SET
            set_name = excluded.set_name,
            set_description = excluded.set_description,
            embedder_name = excluded.embedder_name,
            language_model_name = excluded.language_model_name
        `
      )
      .run({
        setId: input.setId,
        setName: input.setName ?? null,
        setDescription: input.setDescription ?? null,
        embedderName: input.embedderName ?? null,
        languageModelName: input.languageModelName ?? null
      });
  }

  getSetConfig(setId: string): SetConfigRecord | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT set_id, set_name, set_description, embedder_name, language_model_name
          FROM semantic_config_set_id_resources
          WHERE set_id = ?
        `
      )
      .get(setId) as SetConfigRecord | undefined;
    return row ?? null;
  }

  listSetIds(): string[] {
    return (this.database.connection
      .prepare(
        `
          SELECT set_id
          FROM semantic_config_set_id_resources
          ORDER BY set_id
        `
      )
      .all() as Array<{ set_id: string }>).map((row) => row.set_id);
  }

  registerSetTypeBinding(input: { setId: string; setTypeId: number }): void {
    this.database.connection
      .prepare(
        `
          INSERT INTO semantic_config_set_id_set_type (set_id, set_type_id)
          VALUES (@setId, @setTypeId)
          ON CONFLICT(set_id)
          DO NOTHING
        `
      )
      .run(input);
  }

  createCategory(input: {
    name: string;
    prompt: string;
    description?: string | null;
    setId?: string | null;
    setTypeId?: number | null;
  }): number {
    const result = this.database.connection
      .prepare(
        `
          INSERT INTO semantic_config_category (
            set_id, set_type_id, name, prompt, description
          ) VALUES (
            @setId, @setTypeId, @name, @prompt, @description
          )
        `
      )
      .run({
        setId: input.setId ?? null,
        setTypeId: input.setTypeId ?? null,
        name: input.name,
        prompt: input.prompt,
        description: input.description ?? null
      });
    return Number(result.lastInsertRowid);
  }

  getCategory(categoryId: number): Omit<CategoryRecord, "inherited"> | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT id, set_id, set_type_id, name, prompt, description
          FROM semantic_config_category
          WHERE id = ?
        `
      )
      .get(categoryId) as Omit<CategoryRecord, "inherited"> | undefined;
    return row ?? null;
  }

  getCategorySetIds(name: string): string[] {
    return (this.database.connection
      .prepare(
        `
          SELECT DISTINCT set_id
          FROM semantic_config_category
          WHERE name = ? AND set_id IS NOT NULL
          ORDER BY set_id
        `
      )
      .all(name) as Array<{ set_id: string }>).map((row) => row.set_id);
  }

  listCategoriesForSet(setId: string): CategoryRecord[] {
    const local = (this.database.connection
      .prepare(
        `
          SELECT id, set_id, set_type_id, name, prompt, description
          FROM semantic_config_category
          WHERE set_id = ?
          ORDER BY id
        `
      )
      .all(setId) as Array<Omit<CategoryRecord, "inherited">>).map((row) => ({
      ...row,
      inherited: false
    }));
    const binding = this.database.connection
      .prepare("SELECT set_type_id FROM semantic_config_set_id_set_type WHERE set_id = ?")
      .get(setId) as { set_type_id: number } | undefined;
    if (binding === undefined) {
      return local;
    }
    const localNames = new Set(local.map((record) => record.name));
    const inheritedRows = this.database.connection
      .prepare(
        `
          SELECT id, set_id, set_type_id, name, prompt, description
          FROM semantic_config_category
          WHERE set_type_id = ?
          ORDER BY id
        `
      )
      .all(binding.set_type_id) as Array<Omit<CategoryRecord, "inherited">>;
    return local.concat(
      inheritedRows
        .filter((row) => !localNames.has(row.name))
        .map((row) => ({ ...row, inherited: true }))
    );
  }

  deleteCategory(categoryId: number): void {
    const transaction = this.database.connection.transaction((id: number) => {
      this.database.connection
        .prepare("DELETE FROM semantic_config_tag WHERE category_id = ?")
        .run(id);
      this.database.connection
        .prepare("DELETE FROM semantic_config_category WHERE id = ?")
        .run(id);
    });
    transaction(categoryId);
  }

  createCategoryTemplate(input: {
    setTypeId?: number | null;
    name: string;
    categoryName: string;
    prompt: string;
    description?: string | null;
  }): number {
    const result = this.database.connection
      .prepare(
        `
          INSERT INTO semantic_config_category_template (
            set_type_id, name, category_name, prompt, description
          ) VALUES (
            @setTypeId, @name, @categoryName, @prompt, @description
          )
        `
      )
      .run({
        setTypeId: input.setTypeId ?? null,
        name: input.name,
        categoryName: input.categoryName,
        prompt: input.prompt,
        description: input.description ?? null
      });
    return Number(result.lastInsertRowid);
  }

  listCategoryTemplates(setTypeId?: number): CategoryTemplateRecord[] {
    if (setTypeId === undefined) {
      return this.database.connection
        .prepare(
          `
            SELECT id, set_type_id, name, category_name, prompt, description
            FROM semantic_config_category_template
            ORDER BY id
          `
        )
        .all() as CategoryTemplateRecord[];
    }
    return this.database.connection
      .prepare(
        `
          SELECT id, set_type_id, name, category_name, prompt, description
          FROM semantic_config_category_template
          WHERE set_type_id = ?
          ORDER BY id
        `
      )
      .all(setTypeId) as CategoryTemplateRecord[];
  }

  createTag(input: { categoryId: number; name: string; description: string }): number {
    const result = this.database.connection
      .prepare(
        `
          INSERT INTO semantic_config_tag (category_id, name, description)
          VALUES (@categoryId, @name, @description)
        `
      )
      .run(input);
    return Number(result.lastInsertRowid);
  }

  listTags(categoryId: number): TagRecord[] {
    return this.database.connection
      .prepare(
        `
          SELECT id, category_id, name, description
          FROM semantic_config_tag
          WHERE category_id = ?
          ORDER BY id
        `
      )
      .all(categoryId) as TagRecord[];
  }

  deleteTag(tagId: number): void {
    this.database.connection.prepare("DELETE FROM semantic_config_tag WHERE id = ?").run(tagId);
  }

  disableCategory(input: { setId: string; categoryName: string }): void {
    this.database.connection
      .prepare(
        `
          INSERT OR IGNORE INTO semantic_config_disabled_category (set_id, disabled_category)
          VALUES (@setId, @categoryName)
        `
      )
      .run(input);
  }

  listDisabledCategories(setId: string): string[] {
    return (this.database.connection
      .prepare(
        `
          SELECT disabled_category
          FROM semantic_config_disabled_category
          WHERE set_id = ?
          ORDER BY disabled_category
        `
      )
      .all(setId) as Array<{ disabled_category: string }>).map((row) => row.disabled_category);
  }
}
