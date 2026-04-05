import {
  type EmbedderProvider,
  type RerankerProvider
} from "../common/models/provider-factory.js";
import { KuzuCompatStore } from "../graph/kuzu-compat-store.js";
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
  graphStore: KuzuCompatStore;
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
    const sessionEpisodes = this.episodeStore
      .listEpisodes({
        sessionKey: input.sessionKey,
        includeDeleted: false
      })
      .filter((episode) => input.sessionId === undefined || episode.session_id === input.sessionId);

    const allowedEpisodeUids =
      input.producerRole === undefined && input.episodeType === undefined
        ? null
        : new Set(
            sessionEpisodes
              .filter(
                (episode) =>
                  input.producerRole === undefined ||
                  episode.producer_role === input.producerRole
              )
              .filter(
                (episode) =>
                  input.episodeType === undefined || episode.episode_type === input.episodeType
              )
              .map((episode) => episode.uid)
          );
    if (allowedEpisodeUids !== null && allowedEpisodeUids.size === 0) {
      return emptyResult(input.query);
    }

    const derivativeNodes = await this.options.graphStore.searchMatchingNodes({
      nodeTable: "Derivative",
      matchFilters: input.sessionId === undefined ? undefined : { session_id: input.sessionId }
    });
    const eligibleDerivativeNodes =
      allowedEpisodeUids === null
        ? derivativeNodes
        : derivativeNodes.filter((node) =>
            allowedEpisodeUids.has(String(node.properties.episode_uid ?? ""))
          );
    if (eligibleDerivativeNodes.length === 0) {
      return emptyResult(input.query);
    }
    const episodeUidByDerivativeUid = await this.lookupEpisodeUids(
      eligibleDerivativeNodes.map((node) => String(node.properties.uid ?? ""))
    );
    const derivatives = this.lookupDerivativeEmbeddings(
      Object.keys(episodeUidByDerivativeUid)
    );
    this.options.metrics?.increment("vec_queries_total");
    this.options.metrics?.increment("graph_queries_total");
    const episodesByUid = new Map(sessionEpisodes.map((episode) => [episode.uid, episode] as const));

    const matches = derivatives
      .map((derivative) => {
        const episodeUid = episodeUidByDerivativeUid[derivative.derivative_uid];
        const episode = episodeUid === undefined ? undefined : episodesByUid.get(episodeUid);
        if (episode === undefined) {
          return null;
        }
        return {
          episode,
          derivative_uid: derivative.derivative_uid,
          score: cosineSimilarity(queryVector, derivative.embedding)
        };
      })
      .filter((match): match is EpisodicSearchMatch => match !== null)
      .sort(compareMatches)
      .filter((match, index, items) => {
        return items.findIndex((candidate) => candidate.episode.uid === match.episode.uid) === index;
      })
      .filter((match) => match.score >= (input.minScore ?? 0.0001));

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

  private async lookupEpisodeUids(
    derivativeUids: string[]
  ): Promise<Record<string, string>> {
    const related = await this.options.graphStore.searchRelatedNodesBatch({
      sourceTable: "Derivative",
      sourceUids: derivativeUids,
      relationTable: "DERIVED_FROM",
      targetTable: "Episode"
    });
    const episodeUidByDerivativeUid: Record<string, string> = {};
    for (const [derivativeUid, targets] of Object.entries(related)) {
      const episode = targets[0];
      if (episode !== undefined) {
        episodeUidByDerivativeUid[derivativeUid] = String(episode.properties.uid ?? "");
      }
    }
    return episodeUidByDerivativeUid;
  }

  private lookupDerivativeEmbeddings(derivativeUids: string[]): Array<{
    derivative_uid: string;
    embedding: number[];
  }> {
    if (derivativeUids.length === 0) {
      return [];
    }
    const placeholders = derivativeUids.map(() => "?").join(", ");
    const rows = this.database.connection
      .prepare(
        `
          SELECT derivative_uid, embedding
          FROM derivative_feature_vectors
          WHERE derivative_uid IN (${placeholders})
          ORDER BY derivative_uid
        `
      )
      .all(...derivativeUids) as Array<{
      derivative_uid: string;
      embedding: Uint8Array;
    }>;
    return rows.map((row) => ({
      derivative_uid: row.derivative_uid,
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

const emptyResult = (query: string): EpisodicSearchResponse => ({
  mode: "episodic",
  rewritten_query: query,
  subqueries: [query],
  episodic_matches: [],
  semantic_features: [],
  combined: [],
  expanded_context: [],
  short_term_context: ""
});

const compareMatches = (left: EpisodicSearchMatch, right: EpisodicSearchMatch): number => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (left.episode.sequence_num !== right.episode.sequence_num) {
    return left.episode.sequence_num - right.episode.sequence_num;
  }
  return left.episode.uid.localeCompare(right.episode.uid);
};

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
