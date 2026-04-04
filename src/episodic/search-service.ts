import {
  type EmbedderProvider,
  type RerankerProvider
} from "../common/models/provider-factory.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import { type EpisodeRecord, EpisodeStore } from "../storage/episode-store.js";
import type { SqliteDatabase } from "../storage/sqlite/database.js";
import { decodeFloat32Embedding } from "../vector/blob.js";

export type SearchMode = "auto" | "episodic" | "semantic" | "mixed";

export type EpisodicSearchMatch = {
  episode: EpisodeRecord;
  derivative_uid: string;
  score: number;
};

export type EpisodicSearchResponse = {
  mode: "episodic";
  rewritten_query: string;
  subqueries: string[];
  episodic_matches: EpisodicSearchMatch[];
  semantic_features: unknown[];
  combined: Array<{
    source: "episodic";
    content: string;
    identifier: string;
    score: number;
  }>;
  expanded_context: EpisodeRecord[];
  short_term_context: string;
};

export type SearchEpisodesInput = {
  query: string;
  sessionKey?: string;
  sessionId?: string;
  mode?: SearchMode;
  limit?: number;
  contextWindow?: number;
  minScore?: number;
  producerRole?: string;
  episodeType?: string;
};

type EpisodicSearchServiceOptions = {
  embedder: EmbedderProvider;
  reranker?: RerankerProvider | null;
  rerankEnabledGetter?: () => boolean;
  candidateMultiplier?: number;
  maxCandidates?: number;
  metrics?: MetricsRegistry;
};

export class EpisodicSearchService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly episodeStore: EpisodeStore,
    private readonly options: EpisodicSearchServiceOptions
  ) {}

  async search(input: SearchEpisodesInput): Promise<EpisodicSearchResponse> {
    this.options.metrics?.increment("episodic_search_total");
    const queryVector = await this.options.embedder.encode(input.query);
    const candidateEpisodes = this.episodeStore
      .listEpisodes({
        sessionKey: input.sessionKey,
        includeDeleted: false
      })
      .filter((episode) => input.sessionId === undefined || episode.session_id === input.sessionId)
      .filter((episode) => input.producerRole === undefined || episode.producer_role === input.producerRole)
      .filter((episode) => input.episodeType === undefined || episode.episode_type === input.episodeType);

    const derivatives = this.lookupDerivativeEmbeddings(
      candidateEpisodes.map((episode) => episode.uid)
    );
    this.options.metrics?.increment("vec_queries_total");
    this.options.metrics?.increment("graph_queries_total");
    const bestDerivativeByEpisode = new Map<
      string,
      {
        derivative_uid: string;
        score: number;
      }
    >();
    for (const derivative of derivatives) {
      const score = cosineSimilarity(queryVector, derivative.embedding);
      const current = bestDerivativeByEpisode.get(derivative.episode_uid);
      if (current === undefined || score > current.score) {
        bestDerivativeByEpisode.set(derivative.episode_uid, {
          derivative_uid: derivative.derivative_uid,
          score
        });
      }
    }

    const matches = candidateEpisodes
      .map((episode) => {
        const best = bestDerivativeByEpisode.get(episode.uid);
        return {
          episode,
          derivative_uid: best?.derivative_uid ?? `${episode.uid}:d:1`,
          score: best?.score ?? 0
        };
      })
      .filter((match) => match.score >= (input.minScore ?? 0.0001))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.episode.sequence_num !== right.episode.sequence_num) {
          return left.episode.sequence_num - right.episode.sequence_num;
        }
        return left.episode.uid.localeCompare(right.episode.uid);
      });

    const rerankEnabled = this.options.rerankEnabledGetter?.() ?? true;
    const limited = matches.slice(
      0,
      candidateLimit(
        input.limit ?? 5,
        this.options.candidateMultiplier ?? 4,
        this.options.maxCandidates ?? 100
      )
    );
    const reranked =
      this.options.reranker !== undefined &&
      this.options.reranker !== null &&
      rerankEnabled
        ? await this.options.reranker.rerank(input.query, limited)
        : limited;
    const topMatches = reranked.slice(0, input.limit ?? 5);

    return {
      mode: "episodic",
      rewritten_query: input.query,
      subqueries: [input.query],
      episodic_matches: topMatches,
      semantic_features: [],
      combined: topMatches.map((match) => ({
        source: "episodic" as const,
        content: match.episode.content,
        identifier: match.episode.uid,
        score: match.score
      })),
      expanded_context: this.expandContext(topMatches, input.contextWindow ?? 1),
      short_term_context: ""
    };
  }

  private lookupDerivativeEmbeddings(episodeUids: string[]): Array<{
    derivative_uid: string;
    episode_uid: string;
    embedding: number[];
  }> {
    if (episodeUids.length === 0) {
      return [];
    }
    const placeholders = episodeUids.map(() => "?").join(", ");
    const rows = this.database.connection
      .prepare(
        `
          SELECT derivative_uid, episode_uid, embedding
          FROM derivative_feature_vectors
          WHERE episode_uid IN (${placeholders})
          ORDER BY derivative_uid
        `
      )
      .all(...episodeUids) as Array<{
      derivative_uid: string;
      episode_uid: string;
      embedding: Uint8Array;
    }>;
    return rows.map((row) => ({
      derivative_uid: row.derivative_uid,
      episode_uid: row.episode_uid,
      embedding: decodeFloat32Embedding(row.embedding)
    }));
  }

  private expandContext(matches: EpisodicSearchMatch[], contextWindow: number): EpisodeRecord[] {
    const byUid = new Map<string, EpisodeRecord>();
    for (const match of matches) {
      const sessionEpisodes = this.episodeStore.listEpisodes({
        sessionKey: match.episode.session_key,
        includeDeleted: false
      });
      const minSequence = Math.max(match.episode.sequence_num - contextWindow, 0);
      const maxSequence = match.episode.sequence_num + contextWindow;
      for (const candidate of sessionEpisodes) {
        if (candidate.sequence_num >= minSequence && candidate.sequence_num <= maxSequence) {
          byUid.set(candidate.uid, candidate);
        }
      }
    }
    return [...byUid.values()].sort((left, right) => {
      if (left.sequence_num !== right.sequence_num) {
        return left.sequence_num - right.sequence_num;
      }
      return left.uid.localeCompare(right.uid);
    });
  }
}

const candidateLimit = (
  limit: number,
  multiplier: number,
  maxCandidates: number
): number => {
  const requested = Math.max(limit, 1) * Math.max(multiplier, 1);
  return Math.min(Math.max(requested, limit), Math.max(maxCandidates, 1));
};

const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};
