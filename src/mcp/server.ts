import type { AppResources } from "../app/resources.js";

export type McpToolResult = {
  structured_content: any;
};

export type McpToolDefinition = {
  name: string;
};

type RuntimeContext = {
  session_key?: string;
  session_id?: string;
  semantic_set_id?: string;
  mode?: "auto" | "episodic" | "semantic" | "mixed";
  limit?: number;
  context_window?: number;
};

export const createMcpServer = (resources: AppResources) => {
  const context: RuntimeContext = {};

  const assertAuthorized = (input: Record<string, unknown>): void => {
    if (resources.settings.mcpApiKey === null) {
      return;
    }
    const apiKey = input.api_key === undefined ? null : String(input.api_key);
    if (apiKey !== resources.settings.mcpApiKey) {
      throw new Error("unauthorized");
    }
  };

  return {
    async callTool(name: string, input: Record<string, unknown>): Promise<McpToolResult> {
      assertAuthorized(input);

      if (name === "set_context") {
        Object.assign(context, input);
        return { structured_content: { context: { ...context } } };
      }

      if (name === "get_context") {
        return { structured_content: { context: { ...context } } };
      }

      if (name === "add_memory") {
        const sessionKey = String(input.session_key ?? context.session_key ?? "");
        if (sessionKey.length === 0) {
          throw new Error("session_key is required");
        }
        if (resources.sessionStore.getSession(sessionKey) === null) {
          throw new Error(`session not found: ${sessionKey}`);
        }
        const semanticSetId =
          input.semantic_set_id === undefined && context.semantic_set_id === undefined
            ? undefined
            : String(input.semantic_set_id ?? context.semantic_set_id);
        const episodes = (input.episodes as Array<Record<string, unknown>>).map((episode) => ({
          uid: String(episode.uid),
          sessionKey: String(episode.session_key ?? sessionKey),
          sessionId: String(episode.session_id ?? context.session_id ?? sessionKey),
          producerId: String(episode.producer_id),
          producerRole: String(episode.producer_role),
          producedForId:
            episode.produced_for_id === undefined ? null : String(episode.produced_for_id),
          sequenceNum:
            episode.sequence_num === undefined ? 0 : Number(episode.sequence_num),
          content: String(episode.content),
          contentType:
            episode.content_type === undefined ? "string" : String(episode.content_type),
          episodeType:
            episode.episode_type === undefined ? "message" : String(episode.episode_type),
          metadataJson:
            episode.metadata_json === undefined ? null : String(episode.metadata_json),
          filterableMetadataJson:
            episode.filterable_metadata_json === undefined
              ? null
              : String(episode.filterable_metadata_json)
        }));
        resources.episodeStore.addEpisodes(episodes);
        if (semanticSetId !== undefined) {
          for (const episode of episodes) {
            resources.semanticFeatureStore.addHistoryToSet(semanticSetId, episode.uid);
          }
        }
        await resources.compatibilitySync.syncEpisodeUids(
          episodes.map((episode) => episode.uid)
        );
        return {
          structured_content: {
            uids: episodes.map((episode) => episode.uid)
          }
        };
      }

      if (name === "search_memory") {
        const search = await resources.memorySearch.search({
          query: String(input.query),
          sessionKey: String(input.session_key ?? context.session_key ?? ""),
          sessionId:
            input.session_id === undefined && context.session_id === undefined
              ? undefined
              : String(input.session_id ?? context.session_id),
          semanticSetId:
            input.semantic_set_id === undefined && context.semantic_set_id === undefined
              ? undefined
              : String(input.semantic_set_id ?? context.semantic_set_id),
          mode:
            (input.mode as RuntimeContext["mode"] | undefined) ?? context.mode,
          limit: Number(input.limit ?? context.limit ?? 5),
          contextWindow: Number(input.context_window ?? context.context_window ?? 1)
        });
        return {
          structured_content: search
        };
      }

      if (name === "list_memory") {
        const sessionKey =
          input.session_key === undefined ? context.session_key : String(input.session_key);
        return {
          structured_content: {
            episodes: resources.episodeStore.listEpisodes({
              sessionKey
            })
          }
        };
      }

      if (name === "get_memory") {
        const uid = String(input.uid);
        return {
          structured_content: {
            memory: resources.episodeStore.getEpisodes([uid])[0] ?? null
          }
        };
      }

      if (name === "delete_memory") {
        const episodeUids = (input.episode_uids as unknown[] | undefined)?.map((value) =>
          String(value)
        ) ?? [];
        await resources.memoryLifecycle.deleteEpisodes({
          episodeUids,
          semanticSetId:
            input.semantic_set_id === undefined && context.semantic_set_id === undefined
              ? undefined
              : String(input.semantic_set_id ?? context.semantic_set_id)
        });
        return {
          structured_content: {
            status: "ok"
          }
        };
      }

      throw new Error(`unknown tool: ${name}`);
    },

    async listTools(): Promise<McpToolDefinition[]> {
      return [
        { name: "set_context" },
        { name: "get_context" },
        { name: "add_memory" },
        { name: "search_memory" },
        { name: "list_memory" },
        { name: "get_memory" },
        { name: "delete_memory" }
      ];
    }
  };
};
