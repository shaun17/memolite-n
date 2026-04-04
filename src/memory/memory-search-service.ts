import { type EpisodicSearchResponse, EpisodicSearchService, type SearchMode } from "../episodic/search-service.js";
import { EpisodeStore } from "../storage/episode-store.js";
import { SessionStore } from "../storage/session-store.js";
import { MemoryConfigService } from "./config-service.js";
import { ShortTermMemory } from "./short-term-memory.js";
import { SemanticService } from "../semantic/service.js";

export type MemorySearchResponse = {
  mode: "episodic" | "semantic" | "mixed";
  rewritten_query: string;
  subqueries: string[];
  episodic_matches: EpisodicSearchResponse["episodic_matches"];
  semantic_features: Awaited<
    ReturnType<SemanticService["search"]>
  >["features"][number]["feature"][];
  combined: Array<{
    source: "episodic" | "semantic";
    content: string;
    identifier: string;
    score: number;
  }>;
  expanded_context: EpisodicSearchResponse["expanded_context"];
  short_term_context: string;
};

export class MemorySearchService {
  constructor(
    private readonly episodicSearch: EpisodicSearchService,
    private readonly semanticService: SemanticService,
    private readonly memoryConfig: MemoryConfigService,
    private readonly sessionStore: SessionStore,
    private readonly episodeStore: EpisodeStore
  ) {}

  async search(input: {
    query: string;
    sessionKey?: string;
    sessionId?: string;
    semanticSetId?: string;
    mode?: SearchMode;
    limit?: number;
    contextWindow?: number;
    minScore?: number;
    producerRole?: string;
    episodeType?: string;
  }): Promise<MemorySearchResponse> {
    const requestedMode = input.mode ?? "auto";
    const episodicConfig = this.memoryConfig.getEpisodic();
    const resolvedScope = this.resolveScope({
      sessionKey: input.sessionKey,
      sessionId: input.sessionId,
      semanticSetId: input.semanticSetId
    });
    const resolvedMode = this.resolveSearchMode({
      requestedMode: this.resolveConfiguredMode(requestedMode),
      sessionId: resolvedScope.sessionId,
      semanticSetId: resolvedScope.semanticSetId
    });

    const episodic =
      resolvedMode === "episodic" || resolvedMode === "mixed"
        ? await this.episodicSearch.search({
            query: input.query,
            sessionKey: resolvedScope.sessionKey,
            sessionId: resolvedScope.sessionId,
            mode: input.mode,
            limit: input.limit ?? episodicConfig.top_k,
            contextWindow: input.contextWindow ?? episodicConfig.context_window,
            minScore: input.minScore ?? episodicConfig.min_score,
            producerRole: input.producerRole,
            episodeType: input.episodeType
          })
        : null;

    const semantic =
      resolvedMode === "semantic" || resolvedMode === "mixed"
        ? await this.semanticService.search({
            query: input.query,
            setId: resolvedScope.semanticSetId,
            limit: input.limit
          })
        : null;

    return {
      mode: resolvedMode,
      rewritten_query: input.query,
      subqueries: [input.query],
      episodic_matches: episodic?.episodic_matches ?? [],
      semantic_features: semantic?.features.map((item) => item.feature) ?? [],
      combined: this.mergeCombinedResults(episodic, semantic),
      expanded_context: episodic?.expanded_context ?? [],
      short_term_context: this.buildShortTermContext(resolvedScope.sessionKey)
    };
  }

  async agent(input: Parameters<MemorySearchService["search"]>[0]): Promise<{
    search: MemorySearchResponse;
    context_text: string;
  }> {
    const search = await this.search(input);
    const sections: string[] = [];
    if (search.short_term_context.length > 0) {
      sections.push(search.short_term_context);
    }
    for (const item of search.combined) {
      sections.push(`[${item.source}] ${item.content}`);
    }
    return {
      search,
      context_text: sections.join("\n")
    };
  }

  private resolveConfiguredMode(requestedMode: SearchMode): SearchMode {
    const longTerm = this.memoryConfig.getLongTerm();
    if (requestedMode === "auto") {
      if (longTerm.episodic_enabled && longTerm.semantic_enabled) {
        return "auto";
      }
      if (longTerm.episodic_enabled) {
        return "episodic";
      }
      if (longTerm.semantic_enabled) {
        return "semantic";
      }
      return "episodic";
    }
    if (requestedMode === "mixed") {
      if (longTerm.episodic_enabled && longTerm.semantic_enabled) {
        return "mixed";
      }
      if (longTerm.episodic_enabled) {
        return "episodic";
      }
      if (longTerm.semantic_enabled) {
        return "semantic";
      }
      return "episodic";
    }
    if (requestedMode === "episodic" && !longTerm.episodic_enabled) {
      return longTerm.semantic_enabled ? "semantic" : "episodic";
    }
    if (requestedMode === "semantic" && !longTerm.semantic_enabled) {
      return longTerm.episodic_enabled ? "episodic" : "semantic";
    }
    return requestedMode;
  }

  private resolveSearchMode(input: {
    requestedMode: SearchMode;
    sessionId?: string;
    semanticSetId?: string;
  }): "episodic" | "semantic" | "mixed" {
    if (input.requestedMode !== "auto") {
      return input.requestedMode;
    }
    if (input.sessionId !== undefined && input.semanticSetId !== undefined) {
      return "mixed";
    }
    if (input.sessionId !== undefined) {
      return "episodic";
    }
    if (input.semanticSetId !== undefined) {
      return "semantic";
    }
    return "mixed";
  }

  private resolveScope(input: {
    sessionKey?: string;
    sessionId?: string;
    semanticSetId?: string;
  }): {
    sessionKey?: string;
    sessionId?: string;
    semanticSetId?: string;
  } {
    if (input.sessionKey === undefined) {
      return {
        sessionKey: input.sessionKey,
        sessionId: input.sessionId,
        semanticSetId: input.semanticSetId
      };
    }

    const session = this.sessionStore.getSession(input.sessionKey);
    return {
      sessionKey: input.sessionKey,
      sessionId: input.sessionId ?? session?.session_id ?? input.sessionKey,
      semanticSetId: input.semanticSetId ?? session?.session_key ?? input.sessionKey
    };
  }

  private buildShortTermContext(sessionKey?: string): string {
    if (sessionKey === undefined) {
      return "";
    }
    const session = this.sessionStore.getSession(sessionKey);
    if (session === null) {
      return "";
    }
    const memory = ShortTermMemory.create({
      sessionKey,
      sessionStore: this.sessionStore,
      messageCapacity: this.memoryConfig.getShortTerm().message_capacity
    });
    const recentEpisodes = this.episodeStore
      .listEpisodes({
        sessionKey,
        includeDeleted: false
      })
      .slice(-5)
      .map((episode) => ({
        uid: episode.uid,
        content: episode.content,
        producer_id: episode.producer_id,
        producer_role: episode.producer_role,
        created_at: episode.created_at
      }));
    const restored = new ShortTermMemory({
      summary: session.summary,
      messages: recentEpisodes,
      messageCapacity: this.memoryConfig.getShortTerm().message_capacity
    });
    return recentEpisodes.length > 0 ? restored.getContext() : memory.getContext();
  }

  private mergeCombinedResults(
    episodic: EpisodicSearchResponse | null,
    semantic: Awaited<ReturnType<SemanticService["search"]>> | null
  ): MemorySearchResponse["combined"] {
    return [
      ...(episodic?.combined ?? []),
      ...((semantic?.features ?? []).map((item) => ({
        source: "semantic" as const,
        content: item.feature.value,
        identifier: String(item.feature.id),
        score: item.score
      })))
    ].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.source !== right.source) {
        return left.source.localeCompare(right.source);
      }
      return left.identifier.localeCompare(right.identifier);
    });
  }
}
