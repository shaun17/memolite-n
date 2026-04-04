import { reconcileSnapshot } from "../tools/migration.js";
import type { RuntimeSettings } from "../common/config/runtime-settings.js";
import type { CompatibilitySyncService } from "../compatibility/sync-service.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import type { EpisodeStore } from "../storage/episode-store.js";
import type { SemanticFeatureStore } from "../storage/semantic-feature-store.js";

const NAME_PATTERN = /(?:my name is|i am)\s+([A-Za-z][\w-]{1,30})/i;
const FAVORITE_PATTERN =
  /(?:my favorite\s+(food|drink|language|editor|framework)?\s*is|i (?:like|love|prefer))\s+([^.!?\n]{1,80})/gi;
const ZH_NAME_PATTERN = /(?:我叫|我的名字是)\s*([^\s，。！？；,!.?;]{1,30})/u;
const ZH_FAVORITE_PATTERN =
  /(?:我(?:最?喜欢|爱吃|喜欢吃|常吃))(?:的)?(?:(食物|饮料|语言|编辑器|框架))?(?:是|有)?\s*([^\n，。！？；,!.?;]{1,80})/gu;
const CJK_DETECT = /[\u4e00-\u9fff]/u;

const ZH_PREFERENCE_OBJECT_TYPES: Record<string, string> = {
  食物: "food",
  饮料: "drink",
  语言: "language",
  编辑器: "editor",
  框架: "framework"
};

export type ExtractedFeature = {
  category: string;
  tag: string;
  feature_name: string;
  value: string;
  embed_text: string;
};

export type BackgroundTaskResources = {
  settings: RuntimeSettings;
  metrics: MetricsRegistry;
  episodeStore: EpisodeStore;
  semanticFeatureStore: SemanticFeatureStore;
  compatibilitySync: CompatibilitySyncService;
};

const makeEmbedText = (
  featureName: string,
  value: string,
  useCjkPrefixHack: boolean
): string => {
  if (useCjkPrefixHack && CJK_DETECT.test(value)) {
    if (featureName.includes("name")) {
      return `叫 ${value}`;
    }
    return `喜欢 ${value}`;
  }
  return `${featureName} ${value}`;
};

export const extractFeatures = (
  content: string,
  useCjkPrefixHack = true
): ExtractedFeature[] => {
  const features: ExtractedFeature[] = [];

  const nameMatch = NAME_PATTERN.exec(content);
  if (nameMatch !== null) {
    const value = nameMatch[1].trim();
    features.push({
      category: "profile",
      tag: "identity",
      feature_name: "name",
      value,
      embed_text: makeEmbedText("name", value, useCjkPrefixHack)
    });
  }

  const zhNameMatch = ZH_NAME_PATTERN.exec(content);
  if (zhNameMatch !== null) {
    const value = zhNameMatch[1].trim();
    features.push({
      category: "profile",
      tag: "identity",
      feature_name: "name",
      value,
      embed_text: makeEmbedText("name", value, useCjkPrefixHack)
    });
  }

  for (const match of content.matchAll(FAVORITE_PATTERN)) {
    const objectType = (match[1] ?? "preference").trim().toLowerCase();
    const value = (match[2] ?? "").trim().replace(/[ .,!?:;\t\n\r]+$/u, "");
    if (value.length === 0) {
      continue;
    }
    const featureName = `favorite_${objectType}`;
    features.push({
      category: "profile",
      tag: "preference",
      feature_name: featureName,
      value,
      embed_text: makeEmbedText(featureName, value, useCjkPrefixHack)
    });
  }

  for (const match of content.matchAll(ZH_FAVORITE_PATTERN)) {
    const objectType = ZH_PREFERENCE_OBJECT_TYPES[(match[1] ?? "").trim()] ?? "food";
    const value = (match[2] ?? "")
      .trim()
      .replace(/^[吃喝用是]\s*/u, "")
      .replace(/[ ，。！？；,!.?;\t\n\r]+$/u, "");
    if (value.length === 0) {
      continue;
    }
    const featureName = `favorite_${objectType}`;
    features.push({
      category: "profile",
      tag: "preference",
      feature_name: featureName,
      value,
      embed_text: makeEmbedText(featureName, value, useCjkPrefixHack)
    });
  }

  return features;
};

export class BackgroundTaskRunner {
  constructor(private readonly resources: BackgroundTaskResources) {}

  async runStartupRecovery(): Promise<{
    ingestion_backlog: number;
    repair_queue_size: number;
  }> {
    const pendingSetIds = this.resources.semanticFeatureStore.getHistorySetIds();
    this.resources.metrics.setGauge("ingestion_backlog", pendingSetIds.length);
    const report = reconcileSnapshot({
      sqlitePath: this.resources.settings.sqlitePath,
      kuzuPath: this.resources.settings.kuzuPath
    });
    const repairQueueSize = Object.values(report).reduce((total, value) => {
      return total + (Array.isArray(value) ? value.length : 0);
    }, 0);
    this.resources.metrics.setGauge("repair_queue_size", repairQueueSize);
    this.resources.metrics.increment("startup_recovery_runs_total");
    return {
      ingestion_backlog: pendingSetIds.length,
      repair_queue_size: repairQueueSize
    };
  }

  async runCompensationPass(): Promise<number> {
    const pendingSetIds = this.resources.semanticFeatureStore.getHistorySetIds();
    let processed = 0;

    for (const setId of pendingSetIds) {
      const historyIds = this.resources.semanticFeatureStore.getHistoryMessages({
        setIds: [setId],
        isIngested: false
      });
      if (historyIds.length === 0) {
        continue;
      }
      processed += await this.processHistory(setId, historyIds);
      this.resources.semanticFeatureStore.markMessagesIngested(setId, historyIds);
    }

    this.resources.metrics.setGauge(
      "ingestion_backlog",
      this.resources.semanticFeatureStore.getHistorySetIds().length
    );
    this.resources.metrics.increment("compensation_pass_runs_total");
    this.resources.metrics.increment("compensation_items_processed_total", processed);
    return processed;
  }

  private async processHistory(setId: string, historyIds: string[]): Promise<number> {
    const episodes = this.resources.episodeStore.getEpisodes(historyIds);
    const useCjkPrefixHack = this.resources.settings.embedderProvider === "hash";

    for (const episode of episodes) {
      for (const feature of extractFeatures(episode.content, useCjkPrefixHack)) {
        const featureId = this.resources.semanticFeatureStore.createFeature({
          setId,
          category: feature.category,
          tag: feature.tag,
          featureName: feature.feature_name,
          value: feature.value,
          metadataJson: JSON.stringify({ source: "background_compensation" })
        });
        this.resources.semanticFeatureStore.addCitations(featureId, [episode.uid]);
        await this.resources.compatibilitySync.syncSemanticFeature(featureId);
      }
    }

    return historyIds.length;
  }
}
