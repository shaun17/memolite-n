import { performance } from "node:perf_hooks";

import { getSettings } from "../common/config/runtime-settings.js";
import { createEmbedderProvider } from "../common/models/provider-factory.js";
import { CompatibilitySyncService } from "../compatibility/sync-service.js";
import { GraphMirrorStore } from "../graph/mirror-store.js";
import { KuzuCompatStore } from "../graph/kuzu-compat-store.js";
import { EpisodicSearchService } from "../episodic/search-service.js";
import { MemoryConfigService } from "../memory/config-service.js";
import { SemanticSearchService } from "../semantic/search-service.js";
import { EpisodeStore } from "../storage/episode-store.js";
import { ProjectStore } from "../storage/project-store.js";
import { SemanticFeatureStore } from "../storage/semantic-feature-store.js";
import { SessionStore } from "../storage/session-store.js";
import { createSqliteDatabase } from "../storage/sqlite/database.js";
import { initializeSqliteSchema } from "../storage/sqlite/schema.js";

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(Math.max(Math.ceil(ordered.length * ratio) - 1, 0), ordered.length - 1);
  return ordered[index] ?? 0;
};

export const benchmarkSearchWorkload = async ({
  sqlitePath,
  kuzuPath: _kuzuPath,
  episodeCount = 25,
  queryIterations = 10
}: {
  sqlitePath: string;
  kuzuPath: string;
  episodeCount?: number;
  queryIterations?: number;
}): Promise<{
  episode_count: number;
  query_iterations: number;
  episodic_avg_latency_ms: number;
  episodic_p95_latency_ms: number;
  semantic_avg_latency_ms: number;
  semantic_p95_latency_ms: number;
}> => {
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    const settings = getSettings();
    const embedderProvider = createEmbedderProvider({
      embedderProvider: settings.embedderProvider,
      embedderModel: settings.embedderModel,
      modelBasePath: settings.modelBasePath,
      modelCacheDir: settings.modelCacheDir,
      allowRemoteModels: settings.allowRemoteModels
    });
    const memoryConfig = new MemoryConfigService();
    const projectStore = new ProjectStore(database);
    const sessionStore = new SessionStore(database);
    const episodeStore = new EpisodeStore(database);
    const featureStore = new SemanticFeatureStore(database);
    const compatibilitySync = new CompatibilitySyncService(
      database,
      episodeStore,
      featureStore,
      new GraphMirrorStore(_kuzuPath),
      embedderProvider,
      new KuzuCompatStore(_kuzuPath)
    );
    const episodicSearch = new EpisodicSearchService(database, episodeStore, {
      embedder: embedderProvider,
      graphStore: new KuzuCompatStore(_kuzuPath),
      rerankEnabledGetter: () => memoryConfig.getEpisodic().rerank_enabled,
      candidateMultiplier: settings.episodicSearchCandidateMultiplier,
      maxCandidates: settings.episodicSearchMaxCandidates
    });
    const semanticSearch = new SemanticSearchService(database, featureStore, {
      embedder: embedderProvider,
      candidateMultiplier: settings.semanticSearchCandidateMultiplier,
      maxCandidates: settings.semanticSearchMaxCandidates
    });

    projectStore.createProject("bench-org", "bench-project", "benchmark");
    sessionStore.createSession({
      sessionKey: "bench-session",
      orgId: "bench-org",
      projectId: "bench-project",
      sessionId: "bench-session",
      userId: "bench-user"
    });
    episodeStore.addEpisodes(
      Array.from({ length: episodeCount }, (_, index) => ({
        uid: `bench-episode-${index}`,
        sessionKey: "bench-session",
        sessionId: "bench-session",
        producerId: "bench-user",
        producerRole: "user",
        sequenceNum: index,
        content: `Travel preference note ${index}. Seat preference is aisle for long flight trips.`,
        contentType: "text",
        episodeType: "message",
        metadataJson: "{\"source\":\"benchmark\"}"
      }))
    );
    featureStore.createFeature({
      setId: "bench-set",
      category: "profile",
      tag: "travel",
      featureName: "seat_preference",
      value: "aisle"
    });
    await compatibilitySync.syncAllEpisodes();
    await compatibilitySync.syncSemanticFeature(1);

    const episodicTimings: number[] = [];
    const semanticTimings: number[] = [];
    for (let index = 0; index < queryIterations; index += 1) {
      let started = performance.now();
      await episodicSearch.search({
        query: "travel seat preference",
        sessionId: "bench-session",
        limit: 5
      });
      episodicTimings.push(performance.now() - started);

      started = performance.now();
      await semanticSearch.search({
        query: "travel seat preference",
        setId: "bench-set",
        limit: 5
      });
      semanticTimings.push(performance.now() - started);
    }

    const episodicAverage =
      episodicTimings.reduce((sum, value) => sum + value, 0) / Math.max(episodicTimings.length, 1);
    const semanticAverage =
      semanticTimings.reduce((sum, value) => sum + value, 0) / Math.max(semanticTimings.length, 1);

    return {
      episode_count: episodeCount,
      query_iterations: queryIterations,
      episodic_avg_latency_ms: Number(episodicAverage.toFixed(3)),
      episodic_p95_latency_ms: Number(percentile(episodicTimings, 0.95).toFixed(3)),
      semantic_avg_latency_ms: Number(semanticAverage.toFixed(3)),
      semantic_p95_latency_ms: Number(percentile(semanticTimings, 0.95).toFixed(3))
    };
  } finally {
    database.close();
  }
};
