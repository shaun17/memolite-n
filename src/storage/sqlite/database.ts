import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

export type BetterSqlite3Connection = import("better-sqlite3").Database;

export type SqliteDatabase = {
  sqlitePath: string;
  connection: BetterSqlite3Connection;
  close: () => void;
};

export type CreateSqliteDatabaseInput = {
  sqlitePath: string;
  sqliteVecExtensionPath?: string | null;
};

export const createSqliteDatabase = ({
  sqlitePath,
  sqliteVecExtensionPath
}: CreateSqliteDatabaseInput): SqliteDatabase => {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const connection = new Database(sqlitePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("synchronous = NORMAL");
  connection.pragma("temp_store = MEMORY");
  if (
    sqliteVecExtensionPath !== undefined &&
    sqliteVecExtensionPath !== null &&
    typeof connection.loadExtension === "function"
  ) {
    try {
      connection.loadExtension(sqliteVecExtensionPath);
    } catch {
      // Keep startup compatible with environments that do not ship sqlite-vec.
    }
  }

  return {
    sqlitePath,
    connection,
    close: () => {
      connection.close();
    }
  };
};
