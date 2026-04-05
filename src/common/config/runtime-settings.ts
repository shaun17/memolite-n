import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveDefaultSqlitePath,
  DEFAULT_KUZU_PATH
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

const loadDotEnv = (): Record<string, string> => {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .flatMap((line) => {
        const separator = line.indexOf("=");
        if (separator <= 0) {
          return [];
        }
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        const value =
          rawValue.startsWith("\"") && rawValue.endsWith("\"")
            ? rawValue.slice(1, -1)
            : rawValue.startsWith("'") && rawValue.endsWith("'")
              ? rawValue.slice(1, -1)
              : rawValue;
        return [[key, value] as const];
      })
  );
};

const readString = (
  env: Record<string, string | undefined>,
  key: string,
  fallback: string
): string => {
  return env[key] ?? fallback;
};

const readOptionalString = (
  env: Record<string, string | undefined>,
  key: string
): string | null => {
  return env[key] ?? null;
};

const readBoolean = (
  env: Record<string, string | undefined>,
  key: string,
  fallback: boolean
): boolean => {
  const raw = env[key];
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

const readNumber = (
  env: Record<string, string | undefined>,
  key: string,
  fallback: number
): number => {
  const raw = env[key];
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

  const env = {
    ...loadDotEnv(),
    ...process.env
  };

  cachedSettings = {
    appName: readString(env, "MEMOLITE_APP_NAME", "MemoLite"),
    environment: readString(env, "MEMOLITE_ENVIRONMENT", "development"),
    logLevel: readString(env, "MEMOLITE_LOG_LEVEL", "INFO"),
    host: readString(env, "MEMOLITE_HOST", "127.0.0.1"),
    port: readNumber(env, "MEMOLITE_PORT", 18731),
    sqlitePath: readString(
      env,
      "MEMOLITE_SQLITE_PATH",
      resolveDefaultSqlitePath({ exists: existsSync })
    ),
    kuzuPath: readString(env, "MEMOLITE_KUZU_PATH", DEFAULT_KUZU_PATH),
    sqliteVecExtensionPath: readOptionalString(env, "MEMOLITE_SQLITE_VEC_EXTENSION_PATH"),
    mcpApiKey: readOptionalString(env, "MEMOLITE_MCP_API_KEY"),
    embedderProvider: readString(env, "MEMOLITE_EMBEDDER_PROVIDER", "hash"),
    embedderModel: readOptionalString(env, "MEMOLITE_EMBEDDER_MODEL"),
    embedderCacheEnabled: readBoolean(env, "MEMOLITE_EMBEDDER_CACHE_ENABLED", true),
    embedderCacheSize: readNumber(env, "MEMOLITE_EMBEDDER_CACHE_SIZE", 1000),
    rerankerProvider: readString(env, "MEMOLITE_RERANKER_PROVIDER", "none"),
    rerankerModel: readOptionalString(env, "MEMOLITE_RERANKER_MODEL"),
    modelBasePath: readOptionalString(env, "MEMOLITE_MODEL_BASE_PATH"),
    modelCacheDir: readOptionalString(env, "MEMOLITE_MODEL_CACHE_DIR"),
    allowRemoteModels: readBoolean(env, "MEMOLITE_ALLOW_REMOTE_MODELS", true),
    semanticSearchCandidateMultiplier: readNumber(
      env,
      "MEMOLITE_SEMANTIC_SEARCH_CANDIDATE_MULTIPLIER",
      3
    ),
    semanticSearchMaxCandidates: readNumber(
      env,
      "MEMOLITE_SEMANTIC_SEARCH_MAX_CANDIDATES",
      100
    ),
    episodicSearchCandidateMultiplier: readNumber(
      env,
      "MEMOLITE_EPISODIC_SEARCH_CANDIDATE_MULTIPLIER",
      4
    ),
    episodicSearchMaxCandidates: readNumber(
      env,
      "MEMOLITE_EPISODIC_SEARCH_MAX_CANDIDATES",
      100
    )
  };

  return cachedSettings;
};

export const clearSettingsCache = (): void => {
  cachedSettings = null;
};
