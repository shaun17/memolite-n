import {
  type CategoryRecord,
  type CategoryTemplateRecord,
  SemanticConfigStore,
  type SetConfigRecord,
  type SetTypeRecord,
  type TagRecord
} from "../storage/semantic-config-store.js";

export type SetBindingRequest = {
  setId: string;
  setTypeId?: number | null;
  setName?: string | null;
  setDescription?: string | null;
  embedderName?: string | null;
  languageModelName?: string | null;
};

export class SemanticSessionManager {
  constructor(private readonly store: SemanticConfigStore) {}

  createSetType(input: {
    orgId: string;
    metadataTagsSig: string;
    orgLevelSet?: boolean;
    name?: string | null;
    description?: string | null;
  }): number {
    return this.store.createSetType(input);
  }

  listSetTypes(orgId?: string): SetTypeRecord[] {
    return this.store.listSetTypes(orgId);
  }

  deleteSetType(setTypeId: number): void {
    this.store.deleteSetType(setTypeId);
  }

  listSetIds(): string[] {
    return this.store.listSetIds();
  }

  bindSet(request: SetBindingRequest): SetConfigRecord | null {
    this.store.setSetConfig({
      setId: request.setId,
      setName: request.setName,
      setDescription: request.setDescription,
      embedderName: request.embedderName,
      languageModelName: request.languageModelName
    });
    if (request.setTypeId !== undefined && request.setTypeId !== null) {
      this.store.registerSetTypeBinding({
        setId: request.setId,
        setTypeId: request.setTypeId
      });
    }
    return this.store.getSetConfig(request.setId);
  }

  getSetConfig(setId: string): SetConfigRecord | null {
    return this.store.getSetConfig(setId);
  }

  createCategory(input: {
    name: string;
    prompt: string;
    description?: string | null;
    setId?: string | null;
    setTypeId?: number | null;
  }): number {
    return this.store.createCategory(input);
  }

  getCategory(categoryId: number): CategoryRecord | null {
    const category = this.store.getCategory(categoryId);
    if (category === null) {
      return null;
    }
    return {
      ...category,
      inherited: false
    };
  }

  listCategories(setId: string): CategoryRecord[] {
    return this.store.listCategoriesForSet(setId);
  }

  getCategorySetIds(name: string): string[] {
    return this.store.getCategorySetIds(name);
  }

  deleteCategory(categoryId: number): void {
    this.store.deleteCategory(categoryId);
  }

  createCategoryTemplate(input: {
    setTypeId?: number | null;
    name: string;
    categoryName: string;
    prompt: string;
    description?: string | null;
  }): number {
    return this.store.createCategoryTemplate(input);
  }

  listCategoryTemplates(setTypeId?: number): CategoryTemplateRecord[] {
    return this.store.listCategoryTemplates(setTypeId);
  }

  createTag(input: { categoryId: number; name: string; description: string }): number {
    return this.store.createTag(input);
  }

  listTags(categoryId: number): TagRecord[] {
    return this.store.listTags(categoryId);
  }

  deleteTag(tagId: number): void {
    this.store.deleteTag(tagId);
  }

  disableCategory(input: { setId: string; categoryName: string }): void {
    this.store.disableCategory(input);
  }

  listDisabledCategories(setId: string): string[] {
    return this.store.listDisabledCategories(setId);
  }
}
