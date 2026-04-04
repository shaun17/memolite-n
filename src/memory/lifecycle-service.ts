import { ProjectStore } from "../storage/project-store.js";
import { SemanticFeatureStore } from "../storage/semantic-feature-store.js";
import { SessionStore } from "../storage/session-store.js";
import { EpisodeStore } from "../storage/episode-store.js";
import { CompatibilitySyncService } from "../compatibility/sync-service.js";
import { SemanticService } from "../semantic/service.js";

export class MemoryLifecycleService {
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly sessionStore: SessionStore,
    private readonly episodeStore: EpisodeStore,
    private readonly semanticFeatureStore: SemanticFeatureStore,
    private readonly semanticService: SemanticService,
    private readonly compatibilitySync: CompatibilitySyncService
  ) {}

  async deleteEpisodes(input: {
    episodeUids: string[];
    semanticSetId?: string;
  }): Promise<void> {
    this.episodeStore.deleteEpisodes(input.episodeUids);
    const deletedFeatureIds = await this.cleanupSemanticHistory({
      semanticSetId: input.semanticSetId,
      historyIds: input.episodeUids
    });
    await this.compatibilitySync.syncEpisodeUids(input.episodeUids);
    await this.compatibilitySync.syncSemanticFeatures(deletedFeatureIds);
  }

  async deleteSession(input: {
    sessionKey: string;
    semanticSetId?: string;
  }): Promise<void> {
    const session = this.sessionStore.getSession(input.sessionKey);
    if (session === null) {
      return;
    }
    const resolvedSetId = input.semanticSetId ?? session.session_key;
    await this.cleanupSemanticSet(resolvedSetId);
    this.episodeStore.purgeSessionEpisodes(input.sessionKey);
    this.sessionStore.deleteSession(input.sessionKey);
    await this.compatibilitySync.syncAllEpisodes();
    await this.compatibilitySync.syncAllSemanticFeatures();
  }

  async deleteProject(input: {
    orgId: string;
    projectId: string;
  }): Promise<void> {
    const sessions = this.sessionStore.searchSessions({
      orgId: input.orgId,
      projectId: input.projectId
    });
    for (const session of sessions) {
      await this.deleteSession({
        sessionKey: session.session_key,
        semanticSetId: session.session_key
      });
    }
    this.projectStore.deleteProject(input.orgId, input.projectId);
  }

  private async cleanupSemanticHistory(input: {
    semanticSetId?: string;
    historyIds: string[];
  }): Promise<number[]> {
    const featureIds = this.semanticFeatureStore.getFeatureIdsByHistoryIds(input.historyIds);
    this.semanticFeatureStore.deleteHistory(input.historyIds);
    const orphanFeatureIds = this.semanticFeatureStore.getOrphanFeatureIds(featureIds);
    this.semanticFeatureStore.deleteFeatures(orphanFeatureIds);
    return orphanFeatureIds;
  }

  private async cleanupSemanticSet(setId: string): Promise<void> {
    const historyIds = this.semanticFeatureStore.getHistoryMessages({
      setIds: [setId]
    });
    if (historyIds.length > 0) {
      const deletedFeatureIds = await this.cleanupSemanticHistory({
        semanticSetId: setId,
        historyIds
      });
      await this.compatibilitySync.syncSemanticFeatures(deletedFeatureIds);
    }
    const deletedFeatureIds = await this.semanticService.delete({ setId });
    await this.compatibilitySync.syncSemanticFeatures(deletedFeatureIds);
  }
}
