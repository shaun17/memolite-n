import type { SqliteDatabase } from "./sqlite/database.js";
import { encodeFloat32Embedding } from "../vector/blob.js";

export type SemanticFeatureRecord = {
  id: number;
  set_id: string;
  category: string;
  tag: string;
  feature_name: string;
  value: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
};

export type CreateSemanticFeatureInput = {
  setId: string;
  category: string;
  tag: string;
  featureName: string;
  value: string;
  metadataJson?: string | null;
  embedding?: number[] | null;
  deleted?: number;
};

export type UpdateSemanticFeatureInput = {
  setId?: string;
  category?: string;
  tag?: string;
  featureName?: string;
  value?: string;
  metadataJson?: string | null;
  embedding?: number[] | null;
};

export class SemanticFeatureStore {
  constructor(private readonly database: SqliteDatabase) {}

  createFeature(input: CreateSemanticFeatureInput): number {
    const existingFeatureId = this.findExistingFeatureId(input);
    if (existingFeatureId !== null) {
      if (input.embedding !== undefined && input.embedding !== null) {
        this.upsertFeatureEmbedding(existingFeatureId, input.embedding);
      }
      return existingFeatureId;
    }
    const result = this.database.connection
      .prepare(
        `
          INSERT INTO semantic_features (
            set_id, category, tag, feature_name, value, metadata_json, deleted
          ) VALUES (
            @setId, @category, @tag, @featureName, @value, @metadataJson, @deleted
          )
        `
      )
      .run({
        setId: input.setId,
        category: input.category,
        tag: input.tag,
        featureName: input.featureName,
        value: input.value,
        metadataJson: input.metadataJson ?? null,
        deleted: input.deleted ?? 0
      });
    const featureId = Number(result.lastInsertRowid);
    if (input.embedding !== undefined && input.embedding !== null) {
      this.upsertFeatureEmbedding(featureId, input.embedding);
    }
    return featureId;
  }

  getFeature(featureId: number): SemanticFeatureRecord | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT id, set_id, category, tag, feature_name, value,
                 metadata_json, created_at, updated_at, deleted
          FROM semantic_features
          WHERE id = ?
        `
      )
      .get(featureId) as SemanticFeatureRecord | undefined;
    return row ?? null;
  }

  updateFeature(featureId: number, input: UpdateSemanticFeatureInput): void {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    if (input.setId !== undefined) {
      assignments.push("set_id = ?");
      values.push(input.setId);
    }
    if (input.category !== undefined) {
      assignments.push("category = ?");
      values.push(input.category);
    }
    if (input.tag !== undefined) {
      assignments.push("tag = ?");
      values.push(input.tag);
    }
    if (input.featureName !== undefined) {
      assignments.push("feature_name = ?");
      values.push(input.featureName);
    }
    if (input.value !== undefined) {
      assignments.push("value = ?");
      values.push(input.value);
    }
    if (input.metadataJson !== undefined) {
      assignments.push("metadata_json = ?");
      values.push(input.metadataJson);
    }
    if (assignments.length > 0) {
      assignments.push("updated_at = CURRENT_TIMESTAMP");
      values.push(featureId);
      this.database.connection
        .prepare(
          `
            UPDATE semantic_features
            SET ${assignments.join(", ")}
            WHERE id = ?
          `
        )
        .run(...values);
    }
    if (input.embedding !== undefined && input.embedding !== null) {
      this.upsertFeatureEmbedding(featureId, input.embedding);
    }
  }

  queryFeatures(filters: {
    setId?: string;
    category?: string;
    tag?: string;
    includeDeleted?: boolean;
  } = {}): SemanticFeatureRecord[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (!filters.includeDeleted) {
      clauses.push("deleted = 0");
    }
    if (filters.setId !== undefined) {
      clauses.push("set_id = ?");
      values.push(filters.setId);
    }
    if (filters.category !== undefined) {
      clauses.push("category = ?");
      values.push(filters.category);
    }
    if (filters.tag !== undefined) {
      clauses.push("tag = ?");
      values.push(filters.tag);
    }
    return this.database.connection
      .prepare(
        `
          SELECT id, set_id, category, tag, feature_name, value,
                 metadata_json, created_at, updated_at, deleted
          FROM semantic_features
          ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
          ORDER BY id
        `
      )
      .all(...values) as SemanticFeatureRecord[];
  }

  deleteFeatures(featureIds: number[]): void {
    if (featureIds.length === 0) {
      return;
    }
    const placeholders = featureIds.map(() => "?").join(", ");
    this.database.connection
      .prepare(
        `
          UPDATE semantic_features
          SET deleted = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${placeholders}) AND deleted = 0
        `
      )
      .run(...featureIds);
  }

  deleteFeatureSet(filters: {
    setId?: string;
    category?: string;
    tag?: string;
  }): number[] {
    const features = this.queryFeatures(filters);
    const featureIds = features.map((feature) => feature.id);
    this.deleteFeatures(featureIds);
    return featureIds;
  }

  queryFeatureIds(filters: {
    setId?: string;
    categories?: Set<string> | null;
    category?: string;
    tag?: string;
    includeDeleted?: boolean;
  } = {}): number[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (!filters.includeDeleted) {
      clauses.push("deleted = 0");
    }
    if (filters.setId !== undefined) {
      clauses.push("set_id = ?");
      values.push(filters.setId);
    }
    if (filters.category !== undefined) {
      clauses.push("category = ?");
      values.push(filters.category);
    }
    if (filters.tag !== undefined) {
      clauses.push("tag = ?");
      values.push(filters.tag);
    }
    if (filters.categories !== undefined && filters.categories !== null) {
      const categoryValues = [...filters.categories];
      if (categoryValues.length === 0) {
        return [];
      }
      clauses.push(`category IN (${categoryValues.map(() => "?").join(", ")})`);
      values.push(...categoryValues);
    }
    return (this.database.connection
      .prepare(
        `
          SELECT id
          FROM semantic_features
          ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
          ORDER BY id
        `
      )
      .all(...values) as Array<{ id: number }>).map((row) => row.id);
  }

  getFeatureIdsByHistoryIds(historyIds: string[]): number[] {
    if (historyIds.length === 0) {
      return [];
    }
    const placeholders = historyIds.map(() => "?").join(", ");
    return (this.database.connection
      .prepare(
        `
          SELECT DISTINCT feature_id
          FROM semantic_citations
          WHERE episode_uid IN (${placeholders})
          ORDER BY feature_id
        `
      )
      .all(...historyIds) as Array<{ feature_id: number }>).map((row) => row.feature_id);
  }

  getOrphanFeatureIds(featureIds: number[]): number[] {
    if (featureIds.length === 0) {
      return [];
    }
    const placeholders = featureIds.map(() => "?").join(", ");
    return (this.database.connection
      .prepare(
        `
          SELECT f.id
          FROM semantic_features f
          LEFT JOIN semantic_citations c ON c.feature_id = f.id
          WHERE f.id IN (${placeholders})
          GROUP BY f.id
          HAVING COUNT(c.episode_uid) = 0
          ORDER BY f.id
        `
      )
      .all(...featureIds) as Array<{ id: number }>).map((row) => row.id);
  }

  getFeatureEmbedding(featureId: number): Uint8Array | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT embedding
          FROM semantic_feature_vectors
          WHERE feature_id = ?
        `
      )
      .get(featureId) as { embedding: Uint8Array } | undefined;
    return row?.embedding ?? null;
  }

  addCitations(featureId: number, historyIds: string[]): void {
    const insert = this.database.connection.prepare(
      `
        INSERT OR IGNORE INTO semantic_citations (feature_id, episode_uid)
        VALUES (?, ?)
      `
    );
    for (const historyId of historyIds) {
      insert.run(featureId, historyId);
    }
  }

  addHistoryToSet(setId: string, historyId: string): void {
    this.database.connection
      .prepare(
        `
          INSERT OR IGNORE INTO semantic_set_ingested_history (set_id, history_id, ingested, created_at)
          VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        `
      )
      .run(setId, historyId);
  }

  getHistoryMessages(input: {
    setIds?: string[];
    limit?: number;
    isIngested?: boolean;
  } = {}): string[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (input.setIds !== undefined && input.setIds.length > 0) {
      clauses.push(`set_id IN (${input.setIds.map(() => "?").join(", ")})`);
      values.push(...input.setIds);
    }
    if (input.isIngested !== undefined) {
      clauses.push("ingested = ?");
      values.push(input.isIngested ? 1 : 0);
    }
    let query = "SELECT history_id FROM semantic_set_ingested_history";
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }
    query += " ORDER BY created_at, history_id";
    if (input.limit !== undefined) {
      query += " LIMIT ?";
      values.push(input.limit);
    }
    return (this.database.connection.prepare(query).all(...values) as Array<{ history_id: string }>).map(
      (row) => row.history_id
    );
  }

  markMessagesIngested(setId: string, historyIds: string[]): void {
    if (historyIds.length === 0) {
      return;
    }
    const placeholders = historyIds.map(() => "?").join(", ");
    this.database.connection
      .prepare(
        `
          UPDATE semantic_set_ingested_history
          SET ingested = 1
          WHERE set_id = ? AND history_id IN (${placeholders})
        `
      )
      .run(setId, ...historyIds);
  }

  getHistorySetIds(minUningestedMessages?: number): string[] {
    let query = `
      SELECT set_id
      FROM semantic_set_ingested_history
      WHERE ingested = 0
      GROUP BY set_id
    `;
    const values: number[] = [];
    if (minUningestedMessages !== undefined) {
      query += " HAVING COUNT(*) >= ?";
      values.push(minUningestedMessages);
    }
    query += " ORDER BY set_id";
    return (this.database.connection.prepare(query).all(...values) as Array<{ set_id: string }>).map(
      (row) => row.set_id
    );
  }

  deleteHistory(historyIds: string[]): void {
    if (historyIds.length === 0) {
      return;
    }
    const placeholders = historyIds.map(() => "?").join(", ");
    this.database.connection
      .prepare(`DELETE FROM semantic_set_ingested_history WHERE history_id IN (${placeholders})`)
      .run(...historyIds);
    this.database.connection
      .prepare(`DELETE FROM semantic_citations WHERE episode_uid IN (${placeholders})`)
      .run(...historyIds);
  }

  private findExistingFeatureId(input: {
    setId: string;
    category: string;
    tag: string;
    featureName: string;
    value: string;
    metadataJson?: string | null;
  }): number | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT id
          FROM semantic_features
          WHERE set_id = ?
            AND category = ?
            AND tag = ?
            AND feature_name = ?
            AND value = ?
            AND COALESCE(metadata_json, '') = COALESCE(?, '')
            AND deleted = 0
          ORDER BY id
          LIMIT 1
        `
      )
      .get(
        input.setId,
        input.category,
        input.tag,
        input.featureName,
        input.value,
        input.metadataJson ?? null
      ) as { id: number } | undefined;
    return row?.id ?? null;
  }

  private upsertFeatureEmbedding(featureId: number, embedding: number[]): void {
    this.database.connection
      .prepare(
        `
          INSERT INTO semantic_feature_vectors (feature_id, embedding)
          VALUES (?, ?)
          ON CONFLICT(feature_id)
          DO UPDATE SET embedding = excluded.embedding
        `
      )
      .run(featureId, encodeFloat32Embedding(embedding));
  }
}
