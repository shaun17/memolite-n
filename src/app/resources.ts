import Database from "better-sqlite3";

import { BackgroundTaskRunner } from "./background-tasks.js";
import { CompatibilitySyncService } from "../compatibility/sync-service.js";
import { EpisodicSearchService } from "../episodic/search-service.js";
import { getSettings, type RuntimeSettings } from "../common/config/runtime-settings.js";
import {
  createEmbedderProvider,
  createRerankerProvider,
  type EmbedderProvider,
  type RerankerProvider
} from "../common/models/provider-factory.js";
import { KuzuCompatStore } from "../graph/kuzu-compat-store.js";
import { GraphMirrorStore } from "../graph/mirror-store.js";
import { MemoryConfigService } from "../memory/config-service.js";
import { MemoryLifecycleService } from "../memory/lifecycle-service.js";
import { MemorySearchService } from "../memory/memory-search-service.js";
import { MetricsRegistry } from "../metrics/registry.js";
import { SemanticService } from "../semantic/service.js";
import { SemanticSearchService } from "../semantic/search-service.js";
import { SemanticSessionManager } from "../semantic-config/session-manager.js";
import { EpisodeStore } from "../storage/episode-store.js";
import { ProjectStore } from "../storage/project-store.js";
import { SemanticConfigStore } from "../storage/semantic-config-store.js";
import { SemanticFeatureStore } from "../storage/semantic-feature-store.js";
import { SessionStore } from "../storage/session-store.js";
import { createSqliteDatabase, type SqliteDatabase } from "../storage/sqlite/database.js";
import { initializeSqliteSchema } from "../storage/sqlite/schema.js";

export type AppResources = {
  settings: RuntimeSettings;
  sqlite: SqliteDatabase;
  metrics: MetricsRegistry;
  embedderProvider: EmbedderProvider;
  rerankerProvider: RerankerProvider | null;
  kuzuStore: KuzuCompatStore;
  graphMirror: GraphMirrorStore;
  projectStore: ProjectStore;
  sessionStore: SessionStore;
  episodeStore: EpisodeStore;
  episodicSearch: EpisodicSearchService;
  semanticConfigStore: SemanticConfigStore;
  semanticSessionManager: SemanticSessionManager;
  semanticFeatureStore: SemanticFeatureStore;
  compatibilitySync: CompatibilitySyncService;
  semanticSearch: SemanticSearchService;
  semanticService: SemanticService;
  memoryConfig: MemoryConfigService;
  memorySearch: MemorySearchService;
  memoryLifecycle: MemoryLifecycleService;
  backgroundTasks: BackgroundTaskRunner;
  close: () => void;
};

const resolveEmbedderProviderName = (settings: RuntimeSettings): string => {
  try {
    const database = new Database(settings.sqlitePath, { readonly: true });
    const table = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='semantic_config_set_id_resources'"
      )
      .get() as { name: string } | undefined;
    if (table === undefined) {
      database.close();
      return settings.embedderProvider;
    }
    const rows = database
      .prepare(
        `
          SELECT DISTINCT embedder_name
          FROM semantic_config_set_id_resources
          WHERE embedder_name IS NOT NULL AND TRIM(embedder_name) != ''
          ORDER BY embedder_name
        `
      )
      .all() as Array<{ embedder_name: string }>;
    database.close();
    return rows.length === 1 ? rows[0].embedder_name : settings.embedderProvider;
  } catch {
    return settings.embedderProvider;
  }
};

export const createResources = (): AppResources => {
  const settings = getSettings();
  const resolvedEmbedderProvider = resolveEmbedderProviderName(settings);
  const sqlite = createSqliteDatabase({
    sqlitePath: settings.sqlitePath,
    sqliteVecExtensionPath: settings.sqliteVecExtensionPath
  });
  initializeSqliteSchema(sqlite);

  const metrics = new MetricsRegistry();
  const embedderProvider = createEmbedderProvider({
    embedderProvider: resolvedEmbedderProvider,
    embedderModel: settings.embedderModel,
    modelBasePath: settings.modelBasePath,
    modelCacheDir: settings.modelCacheDir,
    allowRemoteModels: settings.allowRemoteModels
  });
  const rerankerProvider = createRerankerProvider({
    rerankerProvider: settings.rerankerProvider,
    rerankerModel: settings.rerankerModel,
    modelBasePath: settings.modelBasePath,
    modelCacheDir: settings.modelCacheDir,
    allowRemoteModels: settings.allowRemoteModels
  });
  const kuzuStore = new KuzuCompatStore(settings.kuzuPath);
  const graphMirror = new GraphMirrorStore(settings.kuzuPath);
  const projectStore = new ProjectStore(sqlite);
  const sessionStore = new SessionStore(sqlite);
  const episodeStore = new EpisodeStore(sqlite);
  const episodicSearch = new EpisodicSearchService(sqlite, episodeStore, {
    embedder: embedderProvider,
    graphStore: kuzuStore,
    reranker: rerankerProvider,
    rerankEnabledGetter: () => memoryConfig.getEpisodic().rerank_enabled,
    candidateMultiplier: settings.episodicSearchCandidateMultiplier,
    maxCandidates: settings.episodicSearchMaxCandidates,
    metrics
  });
  const semanticConfigStore = new SemanticConfigStore(sqlite);
  const semanticSessionManager = new SemanticSessionManager(semanticConfigStore);
  const semanticFeatureStore = new SemanticFeatureStore(sqlite);
  const memoryConfig = new MemoryConfigService();
  const compatibilitySync = new CompatibilitySyncService(
    sqlite,
    episodeStore,
    semanticFeatureStore,
    graphMirror,
    embedderProvider,
    kuzuStore
  );
  const semanticSearch = new SemanticSearchService(sqlite, semanticFeatureStore, {
    embedder: embedderProvider,
    candidateMultiplier: settings.semanticSearchCandidateMultiplier,
    maxCandidates: settings.semanticSearchMaxCandidates,
    metrics
  });
  const semanticService = new SemanticService({
    configStore: semanticConfigStore,
    featureStore: semanticFeatureStore,
    embedder: embedderProvider,
    defaultCategoryResolver: () => [],
    searchService: semanticSearch
  });
  const memorySearch = new MemorySearchService(
    episodicSearch,
    semanticService,
    memoryConfig,
    sessionStore,
    episodeStore
  );
  const memoryLifecycle = new MemoryLifecycleService(
    projectStore,
    sessionStore,
    episodeStore,
    semanticFeatureStore,
    semanticService,
    compatibilitySync
  );
  const backgroundTasks = new BackgroundTaskRunner({
    settings,
    metrics,
    episodeStore,
    semanticFeatureStore,
    compatibilitySync
  });

  return {
    settings,
    sqlite,
    metrics,
    embedderProvider,
    rerankerProvider,
    kuzuStore,
    graphMirror,
    projectStore,
    sessionStore,
    episodeStore,
    episodicSearch,
    semanticConfigStore,
    semanticSessionManager,
    semanticFeatureStore,
    compatibilitySync,
    semanticSearch,
    semanticService,
    memoryConfig,
    memorySearch,
    memoryLifecycle,
    backgroundTasks,
    close: () => {
      sqlite.close();
    }
  };
};
