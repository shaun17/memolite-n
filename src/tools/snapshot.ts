import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { KuzuCompatStore } from "../graph/kuzu-compat-store.js";
import { GraphMirrorStore } from "../graph/mirror-store.js";
import { EpisodeStore } from "../storage/episode-store.js";
import { createSqliteDatabase } from "../storage/sqlite/database.js";
import { initializeSqliteSchema } from "../storage/sqlite/schema.js";

export const EXPORT_TABLES = [
  "projects",
  "sessions",
  "episodes",
  "semantic_config_set_type",
  "semantic_config_set_id_resources",
  "semantic_config_set_id_set_type",
  "semantic_config_category",
  "semantic_config_category_template",
  "semantic_config_tag",
  "semantic_config_disabled_category",
  "semantic_features",
  "semantic_feature_vectors",
  "derivative_feature_vectors",
  "semantic_citations",
  "semantic_set_ingested_history"
] as const;

type SnapshotRow = Record<string, unknown>;
type SnapshotDocument = {
  tables: Record<string, SnapshotRow[]>;
};

const jsonSafeRow = (row: Record<string, unknown>): SnapshotRow =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Uint8Array) {
        return [
          key,
          {
            __memolite_encoding__: "base64",
            data: Buffer.from(value).toString("base64")
          }
        ];
      }
      return [key, value];
    })
  );

const restoreRow = (row: SnapshotRow): SnapshotRow =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const encoded =
        value !== null && typeof value === "object"
          ? (value as { __memolite_encoding__?: unknown; data?: unknown })
          : null;
      if (
        encoded !== null &&
        encoded.__memolite_encoding__ === "base64" &&
        typeof encoded.data === "string"
      ) {
        return [key, Buffer.from(encoded.data, "base64")];
      }
      return [key, value];
    })
  );

export const exportSnapshot = (sqlitePath: string, outputPath: string): string => {
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    const snapshot: SnapshotDocument = { tables: {} };
    for (const table of EXPORT_TABLES) {
      const rows = database.connection.prepare(`SELECT * FROM ${table}`).all() as Array<
        Record<string, unknown>
      >;
      snapshot.tables[table] = rows.map(jsonSafeRow);
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return outputPath;
  } finally {
    database.close();
  }
};

export const importSnapshot = async (
  sqlitePath: string,
  sourcePath: string,
  kuzuPath?: string
): Promise<void> => {
  const snapshot = JSON.parse(readFileSync(sourcePath, "utf8")) as SnapshotDocument;
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    const truncate = database.connection.transaction(() => {
      for (const table of [...EXPORT_TABLES].reverse()) {
        database.connection.prepare(`DELETE FROM ${table}`).run();
      }
    });
    truncate();

    const insert = database.connection.transaction(() => {
      for (const table of EXPORT_TABLES) {
        for (const row of snapshot.tables[table] ?? []) {
          const restored = restoreRow(row);
          const columns = Object.keys(restored);
          if (columns.length === 0) {
            continue;
          }
          const placeholders = columns.map((column) => `@${column}`).join(", ");
          database.connection
            .prepare(
              `
                INSERT OR REPLACE INTO ${table} (${columns.join(", ")})
                VALUES (${placeholders})
              `
            )
            .run(restored);
        }
      }
    });
    insert();

    if (kuzuPath !== undefined) {
      const episodes = new EpisodeStore(database).listEpisodes({ includeDeleted: false });
      new GraphMirrorStore(kuzuPath).rebuildFromEpisodes(episodes);
      await new KuzuCompatStore(kuzuPath).rebuildFromEpisodes(episodes);
    }
  } finally {
    database.close();
  }
};
