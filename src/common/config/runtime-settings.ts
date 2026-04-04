import { existsSync } from "node:fs";

import {
  resolveDefaultSqlitePath,
  DEFAULT_KUZU_PATH,
  ENV_PREFIX,
  LEGACY_ENV_PREFIX
} from "./settings.js";

export type RuntimeSettings = {
  appName: string;
  environment: string;
  logLevel: string;
  host: string;
  port: number;
  sqlitePath: string;
  kuzuPath: string;
  sqliteVecExtensionPath: string | null;
  mcpApiKey: string | null;
  embedderProvider: string;
  embedderModel: string | null;
  embedderCacheEnabled: boolean;
  embedderCacheSize: number;
  rerankerProvider: string;
  rerankerModel: string | null;
  modelBasePath: string | null;
  modelCacheDir: string | null;
  allowRemoteModels: boolean;
  semanticSearchCandidateMultiplier: number;
  semanticSearchMaxCandidates: number;
  episodicSearchCandidateMultiplier: number;
  episodicSearchMaxCandidates: number;
};

let cachedSettings: RuntimeSettings | null = null;

const backfillLegacyEnvironment = (): void => {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(LEGACY_ENV_PREFIX) || value === undefined) {
      continue;
    }
    const modernKey = `${ENV_PREFIX}${key.slice(LEGACY_ENV_PREFIX.length)}`;
    if (process.env[modernKey] === undefined) {
      process.env[modernKey] = value;
    }
  }
};

const readString = (key: string, fallback: string): string => {
  return process.env[key] ?? fallback;
};

const readOptionalString = (key: string): string | null => {
  return process.env[key] ?? null;
};

const readBoolean = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const readNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

export const getSettings = (): RuntimeSettings => {
  if (cachedSettings !== null) {
    return cachedSettings;
  }

  backfillLegacyEnvironment();

  cachedSettings = {
    appName: readString("MEMOLITE_APP_NAME", "MemoLite"),
    environment: readString("MEMOLITE_ENVIRONMENT", "development"),
    logLevel: readString("MEMOLITE_LOG_LEVEL", "INFO"),
    host: readString("MEMOLITE_HOST", "127.0.0.1"),
    port: readNumber("MEMOLITE_PORT", 18731),
    sqlitePath: readString(
      "MEMOLITE_SQLITE_PATH",
      resolveDefaultSqlitePath({ exists: existsSync })
    ),
    kuzuPath: readString("MEMOLITE_KUZU_PATH", DEFAULT_KUZU_PATH),
    sqliteVecExtensionPath: readOptionalString("MEMOLITE_SQLITE_VEC_EXTENSION_PATH"),
    mcpApiKey: readOptionalString("MEMOLITE_MCP_API_KEY"),
    embedderProvider: readString("MEMOLITE_EMBEDDER_PROVIDER", "hash"),
    embedderModel: readOptionalString("MEMOLITE_EMBEDDER_MODEL"),
    embedderCacheEnabled: readBoolean("MEMOLITE_EMBEDDER_CACHE_ENABLED", true),
    embedderCacheSize: readNumber("MEMOLITE_EMBEDDER_CACHE_SIZE", 1000),
    rerankerProvider: readString("MEMOLITE_RERANKER_PROVIDER", "none"),
    rerankerModel: readOptionalString("MEMOLITE_RERANKER_MODEL"),
    modelBasePath: readOptionalString("MEMOLITE_MODEL_BASE_PATH"),
    modelCacheDir: readOptionalString("MEMOLITE_MODEL_CACHE_DIR"),
    allowRemoteModels: readBoolean("MEMOLITE_ALLOW_REMOTE_MODELS", true),
    semanticSearchCandidateMultiplier: readNumber(
      "MEMOLITE_SEMANTIC_SEARCH_CANDIDATE_MULTIPLIER",
      3
    ),
    semanticSearchMaxCandidates: readNumber("MEMOLITE_SEMANTIC_SEARCH_MAX_CANDIDATES", 100),
    episodicSearchCandidateMultiplier: readNumber(
      "MEMOLITE_EPISODIC_SEARCH_CANDIDATE_MULTIPLIER",
      4
    ),
    episodicSearchMaxCandidates: readNumber("MEMOLITE_EPISODIC_SEARCH_MAX_CANDIDATES", 100)
  };

  return cachedSettings;
};

export const clearSettingsCache = (): void => {
  cachedSettings = null;
};
