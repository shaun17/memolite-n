import { existsSync } from "node:fs";

import type { SqliteDatabase } from "./sqlite/database.js";
import { decodeFloat32Embedding, encodeFloat32Embedding } from "../vector/blob.js";

export type VectorSearchResult = {
  itemId: number;
  score: number;
};

export class SqliteVecExtensionLoader {
  constructor(private readonly extensionPath: string | null | undefined) {}

  detectExtension(): string | null {
    if (this.extensionPath === undefined || this.extensionPath === null) {
      return null;
    }
    return existsSync(this.extensionPath) ? this.extensionPath : null;
  }

  isAvailable(): boolean {
    return this.detectExtension() !== null;
  }
}

type SqliteVecIndexOptions = {
  idColumn?: string;
  embeddingColumn?: string;
  embeddingJsonColumn?: string;
};

export class SqliteVecIndex {
  private readonly idColumn: string;
  private readonly embeddingColumn: string;
  private readonly embeddingJsonColumn: string;

  constructor(
    private readonly database: SqliteDatabase,
    private readonly tableName: string,
    options: SqliteVecIndexOptions = {}
  ) {
    this.idColumn = options.idColumn ?? "feature_id";
    this.embeddingColumn = options.embeddingColumn ?? "embedding";
    this.embeddingJsonColumn = options.embeddingJsonColumn ?? "embedding_json";
  }

  async initialize(): Promise<void> {
    if (!this.hasColumn(this.embeddingColumn)) {
      if (this.hasColumn(this.embeddingJsonColumn)) {
        this.migrateJsonToBlob();
        return;
      }
      this.database.connection
        .prepare(
          `
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
              ${this.idColumn} INTEGER PRIMARY KEY,
              ${this.embeddingColumn} BLOB NOT NULL
            )
          `
        )
        .run();
      return;
    }

    this.database.connection
      .prepare(
        `
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            ${this.idColumn} INTEGER PRIMARY KEY,
            ${this.embeddingColumn} BLOB NOT NULL
          )
        `
      )
      .run();
  }

  async upsert(itemId: number, embedding: number[]): Promise<void> {
    await this.batchUpsert([[itemId, embedding]]);
  }

  async batchUpsert(items: Array<[number, number[]]>): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const statement = this.database.connection.prepare(
      `
        INSERT INTO ${this.tableName} (${this.idColumn}, ${this.embeddingColumn})
        VALUES (?, ?)
        ON CONFLICT(${this.idColumn})
        DO UPDATE SET ${this.embeddingColumn} = excluded.${this.embeddingColumn}
      `
    );
    const transaction = this.database.connection.transaction((entries: Array<[number, number[]]>) => {
      for (const [itemId, embedding] of entries) {
        statement.run(itemId, encodeFloat32Embedding(embedding));
      }
    });
    transaction(items);
  }

  async searchTopK(
    queryEmbedding: number[],
    options: {
      limit?: number;
      allowedItemIds?: Set<number>;
    } = {}
  ): Promise<VectorSearchResult[]> {
    if (options.allowedItemIds !== undefined && options.allowedItemIds.size === 0) {
      return [];
    }
    const rows =
      options.allowedItemIds === undefined
        ? (this.database.connection
            .prepare(`SELECT ${this.idColumn} AS item_id, ${this.embeddingColumn} AS embedding FROM ${this.tableName}`)
            .all() as Array<{ item_id: number; embedding: Uint8Array }>)
        : (this.database.connection
            .prepare(
              `
                SELECT ${this.idColumn} AS item_id, ${this.embeddingColumn} AS embedding
                FROM ${this.tableName}
                WHERE ${this.idColumn} IN (${[...options.allowedItemIds].map(() => "?").join(", ")})
              `
            )
            .all(...options.allowedItemIds) as Array<{ item_id: number; embedding: Uint8Array }>);

    const ranked = rows
      .map((row) => ({
        itemId: row.item_id,
        score: cosineSimilarity(queryEmbedding, decodeFloat32Embedding(row.embedding))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? 10);
    return ranked;
  }

  async delete(itemId: number): Promise<void> {
    await this.deleteMany([itemId]);
  }

  async deleteMany(itemIds: number[]): Promise<void> {
    if (itemIds.length === 0) {
      return;
    }
    this.database.connection
      .prepare(
        `DELETE FROM ${this.tableName} WHERE ${this.idColumn} IN (${itemIds.map(() => "?").join(", ")})`
      )
      .run(...itemIds);
  }

  private hasColumn(column: string): boolean {
    const rows = this.database.connection.prepare(`PRAGMA table_info(${this.tableName})`).all() as Array<{
      name: string;
    }>;
    return rows.some((row) => row.name === column);
  }

  private migrateJsonToBlob(): void {
    const rows = this.database.connection
      .prepare(
        `SELECT ${this.idColumn} AS item_id, ${this.embeddingJsonColumn} AS embedding_json FROM ${this.tableName}`
      )
      .all() as Array<{ item_id: number; embedding_json: string }>;

    this.database.connection
      .prepare(
        `ALTER TABLE ${this.tableName} ADD COLUMN ${this.embeddingColumn} BLOB`
      )
      .run();
    const update = this.database.connection.prepare(
      `UPDATE ${this.tableName} SET ${this.embeddingColumn} = ? WHERE ${this.idColumn} = ?`
    );
    for (const row of rows) {
      update.run(
        encodeFloat32Embedding(JSON.parse(row.embedding_json) as number[]),
        row.item_id
      );
    }

    this.database.connection.prepare(`DROP TABLE IF EXISTS ${this.tableName}__new`).run();
    this.database.connection
      .prepare(
        `
          CREATE TABLE ${this.tableName}__new (
            ${this.idColumn} INTEGER PRIMARY KEY,
            ${this.embeddingColumn} BLOB NOT NULL
          )
        `
      )
      .run();
    this.database.connection
      .prepare(
        `
          INSERT INTO ${this.tableName}__new (${this.idColumn}, ${this.embeddingColumn})
          SELECT ${this.idColumn}, ${this.embeddingColumn}
          FROM ${this.tableName}
        `
      )
      .run();
    this.database.connection.prepare(`DROP TABLE ${this.tableName}`).run();
    this.database.connection
      .prepare(`ALTER TABLE ${this.tableName}__new RENAME TO ${this.tableName}`)
      .run();
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
