import type { EmbedderProvider } from "../common/models/provider-factory.js";
import {
  type CategoryRecord,
  type SetConfigRecord,
  SemanticConfigStore
} from "../storage/semantic-config-store.js";
import {
  SemanticFeatureStore,
  type SemanticFeatureRecord
} from "../storage/semantic-feature-store.js";
import { decodeFloat32Embedding } from "../vector/blob.js";
import type { SemanticSearchService } from "./search-service.js";

export type ScoredFeature = {
  feature: SemanticFeatureRecord;
  score: number;
};

export type SemanticServiceDependencies = {
  configStore: SemanticConfigStore;
  featureStore: SemanticFeatureStore;
  embedder: Pick<EmbedderProvider, "encode">;
  defaultCategoryResolver: (setId: string) => CategoryRecord[];
  searchService?: SemanticSearchService;
};

export class SemanticService {
  constructor(private readonly dependencies: SemanticServiceDependencies) {}

  async getDefaultCategories(setId: string): Promise<CategoryRecord[]> {
    const configuredCategories = this.dependencies.configStore.listCategoriesForSet(setId);
    const injectedCategories = this.dependencies.defaultCategoryResolver(setId);
    const disabledNames = new Set(
      this.dependencies.configStore.listDisabledCategories(setId)
    );

    const merged = new Map<string, CategoryRecord>();
    for (const category of injectedCategories) {
      if (!disabledNames.has(category.name)) {
        merged.set(category.name, category);
      }
    }
    for (const category of configuredCategories) {
      if (!disabledNames.has(category.name)) {
        merged.set(category.name, category);
      }
    }
    return [...merged.values()];
  }

  async getEffectiveSetConfig(setId: string): Promise<SetConfigRecord | null> {
    return this.dependencies.configStore.getSetConfig(setId);
  }

  async generateFeatureEmbedding(text: string): Promise<number[]> {
    return this.dependencies.embedder.encode(text);
  }

  async search(input: {
    query: string;
    setId?: string;
    category?: string;
    tag?: string;
    limit?: number;
    minScore?: number;
  }): Promise<{ features: ScoredFeature[] }> {
    const allowedCategories = await this.resolveAllowedCategories(
      input.setId,
      input.category
    );
    const candidateFeatureIds = this.dependencies.featureStore.queryFeatureIds({
      setId: input.setId,
      categories: allowedCategories,
      category: input.category,
      tag: input.tag,
      includeDeleted: false
    });
    if (candidateFeatureIds.length === 0) {
      return { features: [] };
    }

    const result =
      this.dependencies.searchService === undefined
        ? await this.searchLocally({
            query: input.query,
            featureIds: candidateFeatureIds,
            limit: input.limit
          })
        : await this.dependencies.searchService.search({
            query: input.query,
            setId: input.setId,
            limit: input.limit
          });
    const allowedIdSet = new Set(candidateFeatureIds);
    const minScore = input.minScore ?? 0.0001;
    return {
      features: result.features.filter((item) => {
        return (
          item.score >= minScore &&
          allowedIdSet.has(item.feature.id) &&
          (input.tag === undefined || item.feature.tag === input.tag)
        );
      })
    };
  }

  async list(input: {
    setId?: string;
    category?: string;
    tag?: string;
    pageSize?: number;
    pageNum?: number;
  }): Promise<SemanticFeatureRecord[]> {
    const features = this.dependencies.featureStore.queryFeatures({
      setId: input.setId,
      category: input.category,
      tag: input.tag,
      includeDeleted: false
    });
    if (input.pageSize === undefined) {
      return features;
    }
    const offset = Math.max(input.pageNum ?? 0, 0) * input.pageSize;
    return features.slice(offset, offset + input.pageSize);
  }

  async delete(input: {
    featureIds?: number[];
    setId?: string;
    category?: string;
    tag?: string;
  }): Promise<number[]> {
    if (input.featureIds !== undefined && input.featureIds.length > 0) {
      this.dependencies.featureStore.deleteFeatures(input.featureIds);
      return input.featureIds;
    }
    return this.dependencies.featureStore.deleteFeatureSet({
      setId: input.setId,
      category: input.category,
      tag: input.tag
    });
  }

  private async resolveAllowedCategories(
    setId?: string,
    category?: string
  ): Promise<Set<string> | null> {
    if (category !== undefined || setId === undefined) {
      return category === undefined ? null : new Set([category]);
    }
    const categories = await this.getDefaultCategories(setId);
    if (categories.length === 0) {
      return null;
    }
    return new Set(categories.map((item) => item.name));
  }

  private async searchLocally(input: {
    query: string;
    featureIds: number[];
    limit?: number;
  }): Promise<{ features: ScoredFeature[] }> {
    const queryEmbedding = await this.generateFeatureEmbedding(input.query);
    const featureMap = new Map(
      this.dependencies.featureStore
        .queryFeatures({ includeDeleted: false })
        .map((feature) => [feature.id, feature] as const)
    );
    const scored = input.featureIds
      .map((featureId) => {
        const feature = featureMap.get(featureId);
        const embedding = this.dependencies.featureStore.getFeatureEmbedding(featureId);
        if (feature === undefined || embedding === null) {
          return null;
        }
        return {
          feature,
          score: cosineSimilarity(queryEmbedding, decodeFloat32Embedding(embedding))
        };
      })
      .filter((item): item is ScoredFeature => item !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? 5);
    return { features: scored };
  }
}

const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};
