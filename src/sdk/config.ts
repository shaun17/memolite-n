import type { MemoliteClient } from "./client.js";
import type {
  CategoryResponse,
  EpisodicMemoryConfigResponse,
  LongTermMemoryConfigResponse,
  SetConfigResponse,
  SetTypeResponse,
  ShortTermMemoryConfigResponse,
  TagResponse
} from "./types.js";

export class MemoliteConfigApi {
  constructor(private readonly client: MemoliteClient) {}

  async createSetType(input: {
    orgId: string;
    metadataTagsSig: string;
    orgLevelSet?: boolean;
    name?: string | null;
    description?: string | null;
  }): Promise<number> {
    const response = await this.client.request<{ id: number }>(
      "POST",
      "/semantic/config/set-types",
      {
        body: {
          org_id: input.orgId,
          metadata_tags_sig: input.metadataTagsSig,
          org_level_set: input.orgLevelSet ?? false,
          name: input.name ?? null,
          description: input.description ?? null
        }
      }
    );
    return response.id;
  }

  async listSetTypes(input: { orgId?: string } = {}): Promise<SetTypeResponse[]> {
    return this.client.request<SetTypeResponse[]>("GET", "/semantic/config/set-types", {
      query: {
        org_id: input.orgId
      }
    });
  }

  async configureSet(input: {
    setId: string;
    setTypeId?: number | null;
    setName?: string | null;
    setDescription?: string | null;
    embedderName?: string | null;
    languageModelName?: string | null;
  }): Promise<SetConfigResponse> {
    return this.client.request<SetConfigResponse>("POST", "/semantic/config/sets", {
      body: {
        set_id: input.setId,
        set_type_id: input.setTypeId ?? null,
        set_name: input.setName ?? null,
        set_description: input.setDescription ?? null,
        embedder_name: input.embedderName ?? null,
        language_model_name: input.languageModelName ?? null
      }
    });
  }

  async getSetConfig(input: { setId: string }): Promise<SetConfigResponse> {
    return this.client.request<SetConfigResponse>(
      "GET",
      `/semantic/config/sets/${input.setId}`
    );
  }

  async listSetIds(): Promise<string[]> {
    return this.client.request<string[]>("GET", "/semantic/config/sets");
  }

  async addCategory(input: {
    name: string;
    prompt: string;
    description?: string | null;
    setId?: string | null;
    setTypeId?: number | null;
  }): Promise<number> {
    const response = await this.client.request<{ id: number }>(
      "POST",
      "/semantic/config/categories",
      {
        body: {
          name: input.name,
          prompt: input.prompt,
          description: input.description ?? null,
          set_id: input.setId ?? null,
          set_type_id: input.setTypeId ?? null
        }
      }
    );
    return response.id;
  }

  async listCategories(input: { setId: string }): Promise<CategoryResponse[]> {
    return this.client.request<CategoryResponse[]>("GET", "/semantic/config/categories", {
      query: {
        set_id: input.setId
      }
    });
  }

  async addTag(input: {
    categoryId: number;
    name: string;
    description: string;
  }): Promise<number> {
    const response = await this.client.request<{ id: number }>(
      "POST",
      "/semantic/config/tags",
      {
        body: {
          category_id: input.categoryId,
          name: input.name,
          description: input.description
        }
      }
    );
    return response.id;
  }

  async listTags(input: { categoryId: number }): Promise<TagResponse[]> {
    return this.client.request<TagResponse[]>("GET", "/semantic/config/tags", {
      query: {
        category_id: input.categoryId
      }
    });
  }

  async disableCategory(input: {
    setId: string;
    categoryName: string;
  }): Promise<void> {
    await this.client.request("POST", "/semantic/config/disabled-categories", {
      body: {
        set_id: input.setId,
        category_name: input.categoryName
      }
    });
  }

  async getEpisodicMemoryConfig(): Promise<EpisodicMemoryConfigResponse> {
    return this.client.request<EpisodicMemoryConfigResponse>("GET", "/memory-config/episodic");
  }

  async updateEpisodicMemoryConfig(input: {
    topK?: number;
    minScore?: number;
    contextWindow?: number;
    rerankEnabled?: boolean;
  }): Promise<EpisodicMemoryConfigResponse> {
    return this.client.request<EpisodicMemoryConfigResponse>("PATCH", "/memory-config/episodic", {
      body: {
        top_k: input.topK,
        min_score: input.minScore,
        context_window: input.contextWindow,
        rerank_enabled: input.rerankEnabled
      }
    });
  }

  async getShortTermMemoryConfig(): Promise<ShortTermMemoryConfigResponse> {
    return this.client.request<ShortTermMemoryConfigResponse>("GET", "/memory-config/short-term");
  }

  async updateShortTermMemoryConfig(input: {
    messageCapacity?: number;
    summaryEnabled?: boolean;
  }): Promise<ShortTermMemoryConfigResponse> {
    return this.client.request<ShortTermMemoryConfigResponse>("PATCH", "/memory-config/short-term", {
      body: {
        message_capacity: input.messageCapacity,
        summary_enabled: input.summaryEnabled
      }
    });
  }

  async getLongTermMemoryConfig(): Promise<LongTermMemoryConfigResponse> {
    return this.client.request<LongTermMemoryConfigResponse>("GET", "/memory-config/long-term");
  }

  async updateLongTermMemoryConfig(input: {
    semanticEnabled?: boolean;
    episodicEnabled?: boolean;
  }): Promise<LongTermMemoryConfigResponse> {
    return this.client.request<LongTermMemoryConfigResponse>("PATCH", "/memory-config/long-term", {
      body: {
        semantic_enabled: input.semanticEnabled,
        episodic_enabled: input.episodicEnabled
      }
    });
  }
}
