import { createHash } from "node:crypto";

import type { SqliteDatabase } from "./database.js";

const TABLE_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS projects (
      org_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      description TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (org_id, project_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS sessions (
      session_key TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT NULL,
      agent_id TEXT NULL,
      group_id TEXT NULL,
      summary TEXT NOT NULL DEFAULT '',
      summary_updated_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS episodes (
      uid TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      session_id TEXT NOT NULL,
      producer_id TEXT NOT NULL,
      producer_role TEXT NOT NULL,
      produced_for_id TEXT NULL,
      sequence_num INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL,
      episode_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NULL,
      filterable_metadata_json TEXT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(session_key) REFERENCES sessions(session_key)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id TEXT NOT NULL,
      category TEXT NOT NULL,
      tag TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      value TEXT NOT NULL,
      metadata_json TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted INTEGER NOT NULL DEFAULT 0
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_feature_vectors (
      feature_id INTEGER PRIMARY KEY,
      embedding BLOB NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS derivative_feature_vectors (
      derivative_uid TEXT PRIMARY KEY,
      item_id INTEGER NOT NULL UNIQUE,
      episode_uid TEXT NULL,
      embedding BLOB NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_citations (
      feature_id INTEGER NOT NULL,
      episode_uid TEXT NOT NULL,
      PRIMARY KEY (feature_id, episode_uid)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_set_ingested_history (
      set_id TEXT NOT NULL,
      history_id TEXT NOT NULL,
      ingested INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (set_id, history_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_set_type (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL,
      org_level_set INTEGER NOT NULL DEFAULT 0,
      metadata_tags_sig TEXT NOT NULL,
      name TEXT NULL,
      description TEXT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_set_id_resources (
      set_id TEXT PRIMARY KEY,
      set_name TEXT NULL,
      set_description TEXT NULL,
      embedder_name TEXT NULL,
      language_model_name TEXT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_set_id_set_type (
      set_id TEXT PRIMARY KEY,
      set_type_id INTEGER NOT NULL,
      FOREIGN KEY(set_type_id) REFERENCES semantic_config_set_type(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id TEXT NULL,
      set_type_id INTEGER NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      description TEXT NULL,
      FOREIGN KEY(set_type_id) REFERENCES semantic_config_set_type(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_category_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_type_id INTEGER NULL,
      name TEXT NOT NULL,
      category_name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      description TEXT NULL,
      FOREIGN KEY(set_type_id) REFERENCES semantic_config_set_type(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY(category_id) REFERENCES semantic_config_category(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS semantic_config_disabled_category (
      set_id TEXT NOT NULL,
      disabled_category TEXT NOT NULL,
      PRIMARY KEY (set_id, disabled_category)
    )
  `,
] as const;

const INDEX_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS idx_sessions_org_project ON sessions (org_id, project_id)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_group_id ON sessions (group_id)",
  "CREATE INDEX IF NOT EXISTS idx_episodes_session_deleted_sequence ON episodes (session_key, deleted, sequence_num)",
  "CREATE INDEX IF NOT EXISTS idx_episodes_session_id_deleted ON episodes (session_id, deleted)",
  "CREATE INDEX IF NOT EXISTS idx_episodes_role_type_deleted ON episodes (producer_role, episode_type, deleted)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_features_lookup ON semantic_features (set_id, category, tag, feature_name, deleted)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_citations_episode ON semantic_citations (episode_uid, feature_id)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_history_pending ON semantic_set_ingested_history (ingested, set_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_history_set_created ON semantic_set_ingested_history (set_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_config_category_set_id ON semantic_config_category (set_id, id)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_config_category_set_type ON semantic_config_category (set_type_id, id)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_config_template_set_type ON semantic_config_category_template (set_type_id, id)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_config_tag_category ON semantic_config_tag (category_id, id)",
  "CREATE INDEX IF NOT EXISTS idx_semantic_config_disabled_set_id ON semantic_config_disabled_category (set_id, disabled_category)"
] as const;

const hasColumn = (database: SqliteDatabase, table: string, column: string): boolean => {
  const rows = database.connection.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === column);
};

const ensureColumn = (
  database: SqliteDatabase,
  table: string,
  column: string,
  definition: string
): void => {
  if (!hasColumn(database, table, column)) {
    database.connection.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
};

const tableColumns = (database: SqliteDatabase, table: string): string[] => {
  return (database.connection.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  );
};

const migrateDerivativeVectorTable = (database: SqliteDatabase): void => {
  const columns = tableColumns(database, "derivative_feature_vectors");
  const hasModernShape =
    columns.includes("derivative_uid") &&
    columns.includes("item_id") &&
    columns.includes("embedding");
  if (hasModernShape) {
    return;
  }

  database.connection.prepare("DROP TABLE IF EXISTS derivative_feature_vectors__new").run();
  database.connection
    .prepare(
      `
        CREATE TABLE derivative_feature_vectors__new (
          derivative_uid TEXT PRIMARY KEY,
          item_id INTEGER NOT NULL UNIQUE,
          episode_uid TEXT NULL,
          embedding BLOB NOT NULL
        )
      `
    )
    .run();

  if (columns.includes("feature_id") && columns.includes("embedding")) {
    const rows = database.connection
      .prepare("SELECT feature_id, episode_uid, embedding FROM derivative_feature_vectors")
      .all() as Array<{ feature_id: number; episode_uid?: string | null; embedding: Uint8Array }>;
    const insert = database.connection.prepare(
      `
        INSERT INTO derivative_feature_vectors__new (derivative_uid, item_id, episode_uid, embedding)
        VALUES (?, ?, ?, ?)
      `
    );
    for (const row of rows) {
      const derivativeUid = `legacy:${row.feature_id}`;
      insert.run(derivativeUid, row.feature_id, row.episode_uid ?? null, row.embedding);
    }
  } else if (columns.includes("episode_uid") && columns.includes("embedding")) {
    const rows = database.connection
      .prepare("SELECT episode_uid, embedding FROM derivative_feature_vectors")
      .all() as Array<{ episode_uid: string | null; embedding: Uint8Array }>;
    const insert = database.connection.prepare(
      `
        INSERT INTO derivative_feature_vectors__new (derivative_uid, item_id, episode_uid, embedding)
        VALUES (?, ?, ?, ?)
      `
    );
    for (const row of rows) {
      const episodeUid = row.episode_uid ?? "";
      const derivativeUid = episodeUid.length > 0 ? `${episodeUid}:d:1` : "legacy:unknown";
      const itemId = stableVectorItemId(derivativeUid);
      insert.run(derivativeUid, itemId, row.episode_uid, row.embedding);
    }
  }

  database.connection.prepare("DROP TABLE derivative_feature_vectors").run();
  database.connection
    .prepare("ALTER TABLE derivative_feature_vectors__new RENAME TO derivative_feature_vectors")
    .run();
};

const migrateSemanticHistoryTable = (database: SqliteDatabase): void => {
  const columns = tableColumns(database, "semantic_set_ingested_history");
  const hasModernShape =
    columns.includes("set_id") &&
    columns.includes("history_id") &&
    columns.includes("ingested") &&
    columns.includes("created_at");
  if (hasModernShape) {
    return;
  }

  database.connection.prepare("DROP TABLE IF EXISTS semantic_set_ingested_history__new").run();
  database.connection
    .prepare(
      `
        CREATE TABLE semantic_set_ingested_history__new (
          set_id TEXT NOT NULL,
          history_id TEXT NOT NULL,
          ingested INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          PRIMARY KEY (set_id, history_id)
        )
      `
    )
    .run();

  if (columns.includes("set_id")) {
    const rows = database.connection
      .prepare("SELECT set_id FROM semantic_set_ingested_history")
      .all() as Array<{ set_id: string }>;
    const insert = database.connection.prepare(
      `
        INSERT OR IGNORE INTO semantic_set_ingested_history__new (set_id, history_id, ingested, created_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
      `
    );
    for (const row of rows) {
      insert.run(row.set_id, row.set_id);
    }
  }

  database.connection.prepare("DROP TABLE semantic_set_ingested_history").run();
  database.connection
    .prepare("ALTER TABLE semantic_set_ingested_history__new RENAME TO semantic_set_ingested_history")
    .run();
};

const stableVectorItemId = (uid: string): number => {
  const digest = createHash("sha256").update(uid, "utf8").digest();
  return Number(digest.readBigUInt64BE(0) & BigInt("0x7FFFFFFFFFFFFFFF"));
};

export const initializeSqliteSchema = (database: SqliteDatabase): void => {
  for (const statement of TABLE_STATEMENTS) {
    database.connection.prepare(statement).run();
  }

  migrateDerivativeVectorTable(database);
  migrateSemanticHistoryTable(database);
  ensureColumn(database, "derivative_feature_vectors", "episode_uid", "TEXT NULL");
  ensureColumn(database, "semantic_citations", "episode_uid", "TEXT NULL");

  for (const statement of INDEX_STATEMENTS) {
    database.connection.prepare(statement).run();
  }
};
