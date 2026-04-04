import type { EmbedderProvider } from "../common/models/provider-factory.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import { SemanticFeatureStore, type SemanticFeatureRecord } from "../storage/semantic-feature-store.js";
import type { SqliteDatabase } from "../storage/sqlite/database.js";
import { decodeFloat32Embedding } from "../vector/blob.js";

export type SemanticSearchResult = {
  features: Array<{
    feature: SemanticFeatureRecord;
    score: number;
  }>;
};

type SemanticSearchServiceOptions = {
  embedder: EmbedderProvider;
  candidateMultiplier?: number;
  maxCandidates?: number;
  metrics?: MetricsRegistry;
};

export class SemanticSearchService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly featureStore: SemanticFeatureStore,
    private readonly options: SemanticSearchServiceOptions
  ) {}

  async search(input: {
    query: string;
    setId?: string;
    limit?: number;
  }): Promise<SemanticSearchResult> {
    this.options.metrics?.increment("semantic_search_total");
    const queryVector = await this.options.embedder.encode(input.query);
    const limit = input.limit ?? 5;
    const features = this.featureStore
      .queryFeatures({
        setId: input.setId
      })
      .map((feature) => ({
        feature,
        score: cosineSimilarity(queryVector, this.lookupFeatureEmbedding(feature.id) ?? [])
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(
        0,
        candidateLimit(
          limit,
          this.options.candidateMultiplier ?? 3,
          this.options.maxCandidates ?? 100
        )
      )
      .slice(0, limit);

    return { features };
  }

  private lookupFeatureEmbedding(featureId: number): number[] | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT embedding
          FROM semantic_feature_vectors
          WHERE feature_id = ?
        `
      )
      .get(featureId) as { embedding: Uint8Array } | undefined;
    if (row === undefined) {
      return null;
    }
    return decodeFloat32Embedding(row.embedding);
  }
}

const candidateLimit = (
  limit: number,
  multiplier: number,
  maxCandidates: number
): number => {
  const requested = Math.max(limit, 1) * Math.max(multiplier, 1);
  return Math.min(Math.max(requested, limit), Math.max(maxCandidates, 1));
};

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
