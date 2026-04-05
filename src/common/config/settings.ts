import { homedir } from "node:os";
import { join } from "node:path";

export const ENV_PREFIX = "MEMOLITE_";

export const DEFAULT_DATA_DIR = join(homedir(), ".memolite");
export const LEGACY_SQLITE_PATH = join(DEFAULT_DATA_DIR, "memlite.sqlite3");
export const DEFAULT_KUZU_PATH = join(DEFAULT_DATA_DIR, "kuzu-n");

export type ResolveDefaultSqlitePathOptions = {
  preferredPath?: string;
  legacyPath?: string;
  exists?: (candidate: string) => boolean;
};

export const resolveDefaultSqlitePath = (
  options: ResolveDefaultSqlitePathOptions = {}
): string => {
  const preferredPath = options.preferredPath ?? join(DEFAULT_DATA_DIR, "memolite.sqlite3");
  const legacyPath = options.legacyPath ?? LEGACY_SQLITE_PATH;
  const exists = options.exists ?? (() => false);

  if (exists(preferredPath)) {
    return preferredPath;
  }
  if (exists(legacyPath)) {
    return legacyPath;
  }
  return preferredPath;
};
