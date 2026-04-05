import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { buildDerivativesForEpisode } from "../derivatives/pipeline.js";
import type { EpisodeRecord } from "../storage/episode-store.js";

export type GraphEpisodeNode = {
  uid: string;
  session_id: string;
  content: string;
  content_type: string;
  created_at: string;
  metadata_json: string | null;
};

export type GraphDerivativeNode = {
  uid: string;
  episode_uid: string;
  session_id: string;
  content: string;
  content_type: string;
  sequence_num: number;
  metadata_json: string | null;
};

export type GraphMirrorSnapshot = {
  episodes: GraphEpisodeNode[];
  derivatives: GraphDerivativeNode[];
};

const emptySnapshot = (): GraphMirrorSnapshot => ({
  episodes: [],
  derivatives: []
});

export class GraphMirrorStore {
  private readonly snapshotPath: string;

  constructor(private readonly kuzuPath: string) {
    this.snapshotPath = `${kuzuPath}.graph-mirror.json`;
  }

  readSnapshot(): GraphMirrorSnapshot {
    if (!existsSync(this.snapshotPath)) {
      return emptySnapshot();
    }
    return JSON.parse(readFileSync(this.snapshotPath, "utf8")) as GraphMirrorSnapshot;
  }

  writeSnapshot(snapshot: GraphMirrorSnapshot): void {
    mkdirSync(dirname(this.snapshotPath), { recursive: true });
    writeFileSync(this.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  clear(): void {
    if (existsSync(this.snapshotPath)) {
      rmSync(this.snapshotPath, { force: true });
    }
  }

  upsertEpisodes(episodes: EpisodeRecord[]): void {
    if (episodes.length === 0) return;
    const existing = this.readSnapshot();
    const existingEpisodeUids = new Set(existing.episodes.map((e) => e.uid));
    const existingDerivativeUids = new Set(existing.derivatives.map((d) => d.uid));
    for (const episode of episodes) {
      if (!existingEpisodeUids.has(episode.uid)) {
        existing.episodes.push({
          uid: episode.uid,
          session_id: episode.session_id,
          content: episode.content,
          content_type: episode.content_type,
          created_at: episode.created_at,
          metadata_json: episode.metadata_json
        });
      }
      for (const derivative of buildDerivativesForEpisode(episode)) {
        if (!existingDerivativeUids.has(derivative.uid)) {
          existing.derivatives.push({
            uid: derivative.uid,
            episode_uid: derivative.episode_uid,
            session_id: derivative.session_id,
            content: derivative.content,
            content_type: derivative.content_type,
            sequence_num: derivative.sequence_num,
            metadata_json: derivative.metadata_json
          });
        }
      }
    }
    this.writeSnapshot(existing);
  }

  rebuildFromEpisodes(episodes: EpisodeRecord[]): void {
    this.writeSnapshot({
      episodes: episodes.map((episode) => ({
        uid: episode.uid,
        session_id: episode.session_id,
        content: episode.content,
        content_type: episode.content_type,
        created_at: episode.created_at,
        metadata_json: episode.metadata_json
      })),
      derivatives: episodes.flatMap((episode) =>
        buildDerivativesForEpisode(episode).map((derivative) => ({
          uid: derivative.uid,
          episode_uid: derivative.episode_uid,
          session_id: derivative.session_id,
          content: derivative.content,
          content_type: derivative.content_type,
          sequence_num: derivative.sequence_num,
          metadata_json: derivative.metadata_json
        }))
      )
    });
  }
}
