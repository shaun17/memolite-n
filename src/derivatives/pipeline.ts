import { createHash } from "node:crypto";

import type { EpisodeRecord } from "../storage/episode-store.js";

const SENTENCE_SPLIT_PATTERN = /(?<=[.!?。！？])\s+|\n+/u;

export type DerivativeRecord = {
  uid: string;
  episode_uid: string;
  session_id: string;
  content: string;
  content_type: string;
  sequence_num: number;
  metadata_json: string;
};

export const chunkEpisodeContent = (content: string): string[] => {
  const normalized = content
    .split(SENTENCE_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (normalized.length > 0) {
    return normalized;
  }
  const fallback = content.trim();
  return fallback.length > 0 ? [fallback] : [content];
};

export const vectorItemId = (uid: string): number => {
  const digest = createHash("sha256").update(uid, "utf8").digest();
  return Number(
    digest.readBigUInt64BE(0) & BigInt("0x7FFFFFFFFFFFFFFF")
  );
};

export const buildDerivativeMetadata = (
  episode: EpisodeRecord,
  chunkIndex: number,
  chunkCount: number
): Record<string, unknown> => ({
  episode_uid: episode.uid,
  session_id: episode.session_id,
  producer_id: episode.producer_id,
  producer_role: episode.producer_role,
  episode_type: episode.episode_type,
  content_type: episode.content_type,
  sequence_num: episode.sequence_num,
  chunk_index: chunkIndex,
  chunk_count: chunkCount,
  source_metadata: parseMetadataJson(episode.metadata_json)
});

export const buildDerivativesForEpisode = (
  episode: EpisodeRecord
): DerivativeRecord[] => {
  const chunks = chunkEpisodeContent(episode.content);
  return chunks.map((chunk, index) => ({
    uid: `${episode.uid}:d:${index + 1}`,
    episode_uid: episode.uid,
    session_id: episode.session_id,
    content: chunk,
    content_type: episode.content_type,
    sequence_num: index + 1,
    metadata_json: JSON.stringify(
      buildDerivativeMetadata(episode, index + 1, chunks.length)
    )
  }));
};

const parseMetadataJson = (metadataJson: string | null): Record<string, unknown> => {
  if (metadataJson === null) {
    return {};
  }
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};
