import type { EmbedderProvider } from "../common/models/provider-factory.js";
import { buildDerivativesForEpisode, vectorItemId } from "../derivatives/pipeline.js";
import { KuzuCompatStore } from "../graph/kuzu-compat-store.js";
import { GraphMirrorStore } from "../graph/mirror-store.js";
import type { EpisodeRecord, EpisodeStore } from "../storage/episode-store.js";
import type { SemanticFeatureStore } from "../storage/semantic-feature-store.js";
import type { SqliteDatabase } from "../storage/sqlite/database.js";
import { encodeFloat32Embedding } from "../vector/blob.js";

export class CompatibilitySyncService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly episodeStore: EpisodeStore,
    private readonly semanticFeatureStore: SemanticFeatureStore,
    private readonly graphMirror: GraphMirrorStore,
    private readonly embedder: EmbedderProvider,
    private readonly kuzuStore?: KuzuCompatStore
  ) {}

  async syncSemanticFeature(featureId: number): Promise<void> {
    const feature = this.semanticFeatureStore.getFeature(featureId);
    if (feature === null || feature.deleted === 1) {
      this.database.connection
        .prepare("DELETE FROM semantic_feature_vectors WHERE feature_id = ?")
        .run(featureId);
      return;
    }
    const embedding = await this.embedder.encode(`${feature.feature_name} ${feature.value}`);
    this.database.connection
      .prepare(
        `
          INSERT INTO semantic_feature_vectors (feature_id, embedding)
          VALUES (?, ?)
          ON CONFLICT(feature_id)
          DO UPDATE SET embedding = excluded.embedding
        `
      )
      .run(
        featureId,
        encodeFloat32Embedding(embedding)
      );
  }

  async syncSemanticFeatures(featureIds: number[]): Promise<void> {
    for (const featureId of featureIds) {
      await this.syncSemanticFeature(featureId);
    }
  }

  async syncAllSemanticFeatures(): Promise<void> {
    const allFeatures = this.semanticFeatureStore.queryFeatures({
      includeDeleted: true
    });
    const allFeatureIds = new Set(allFeatures.map((feature) => feature.id));
    const existingRows = this.database.connection
      .prepare("SELECT feature_id FROM semantic_feature_vectors ORDER BY feature_id")
      .all() as Array<{ feature_id: number }>;
    for (const row of existingRows) {
      if (!allFeatureIds.has(row.feature_id)) {
        this.database.connection
          .prepare("DELETE FROM semantic_feature_vectors WHERE feature_id = ?")
          .run(row.feature_id);
      }
    }
    await this.syncSemanticFeatures([...allFeatureIds]);
  }

  async syncEpisodeUids(uids: string[]): Promise<void> {
    if (uids.length === 0) {
      await this.syncAllEpisodes();
      return;
    }

    const activeEpisodes = this.episodeStore
      .getEpisodes(uids)
      .filter((episode) => episode.deleted === 0);
    const activeIds = new Set(activeEpisodes.map((episode) => episode.uid));

    for (const uid of uids) {
      if (!activeIds.has(uid)) {
        const deletedEpisodes = this.episodeStore.getEpisodes([uid]);
        for (const episode of deletedEpisodes) {
          const derivatives = buildDerivativesForEpisode(episode);
          for (const derivative of derivatives) {
            this.database.connection
              .prepare("DELETE FROM derivative_feature_vectors WHERE feature_id = ?")
              .run(vectorItemId(derivative.uid));
          }
        }
      }
    }

    const upsert = this.database.connection.prepare(
      `
        INSERT INTO derivative_feature_vectors (feature_id, embedding)
        VALUES (?, ?)
        ON CONFLICT(feature_id)
        DO UPDATE SET embedding = excluded.embedding
      `
    );
    for (const episode of activeEpisodes) {
      const derivatives = buildDerivativesForEpisode(episode);
      for (const derivative of derivatives) {
        const embedding = await this.embedder.encode(derivative.content);
        upsert.run(
          vectorItemId(derivative.uid),
          encodeFloat32Embedding(embedding)
        );
      }
    }

    await this.upsertGraphMirror(activeEpisodes);
  }

  async syncAllEpisodes(): Promise<void> {
    this.database.connection.prepare("DELETE FROM derivative_feature_vectors").run();
    const insert = this.database.connection.prepare(
      `
        INSERT INTO derivative_feature_vectors (feature_id, embedding)
        VALUES (?, ?)
      `
    );
    for (const episode of this.listActiveEpisodes()) {
      const derivatives = buildDerivativesForEpisode(episode);
      for (const derivative of derivatives) {
        insert.run(
          vectorItemId(derivative.uid),
          encodeFloat32Embedding(await this.embedder.encode(derivative.content))
        );
      }
    }
    await this.rebuildGraphMirror();
  }

  private async upsertGraphMirror(episodes: EpisodeRecord[]): Promise<void> {
    if (this.kuzuStore !== undefined) {
      await this.kuzuStore.upsertEpisodes(episodes);
    }
    this.graphMirror.upsertEpisodes(episodes);
  }

  private async rebuildGraphMirror(): Promise<void> {
    const episodes = this.listActiveEpisodes();
    if (this.kuzuStore !== undefined) {
      await this.kuzuStore.rebuildFromEpisodes(episodes);
    }
    this.graphMirror.rebuildFromEpisodes(episodes);
  }

  private listActiveEpisodes(): EpisodeRecord[] {
    return this.episodeStore.listEpisodes({ includeDeleted: false });
  }
}
