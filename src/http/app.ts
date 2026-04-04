import Fastify, { type FastifyInstance } from "fastify";

import { getSettings } from "../common/config/runtime-settings.js";
import { createResources } from "../app/resources.js";
import { registerSemanticConfigRoutes } from "./semantic-config-routes.js";
import { ShortTermMemory } from "../memory/short-term-memory.js";

const replyValidationError = (
  reply: {
    code: (statusCode: number) => void;
  },
  fields: string[]
): { detail: string } => {
  reply.code(422);
  return {
    detail: `missing required fields: ${fields.join(", ")}`
  };
};

const missingFields = (
  payload: Record<string, unknown>,
  required: string[]
): string[] =>
  required.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || value === "";
  });

const buildOpenApiDocument = (): { openapi: string; info: { title: string; version: string }; paths: Record<string, object> } => ({
  openapi: "3.1.0",
  info: {
    title: "memolite-n",
    version: "0.1.0"
  },
  paths: {
    "/health": {},
    "/version": {},
    "/metrics": {},
    "/projects": {},
    "/sessions": {},
    "/memories": {},
    "/memories/search": {},
    "/memories/agent": {},
    "/memories/episodes": {},
    "/memories/semantic": {},
    "/semantic/features": {},
    "/semantic/config/set-types": {},
    "/memory-config/episodic": {},
    "/memory-config/short-term": {},
    "/memory-config/long-term": {}
  }
});

export const createHttpApp = (): FastifyInstance => {
  const app = Fastify();
  const resources = createResources();
  (app as unknown as { memoliteResources: typeof resources }).memoliteResources = resources;

  app.addHook("onClose", async () => {
    resources.close();
  });

  app.addHook("onReady", async () => {
    await resources.embedderProvider.warmUp();
    if (resources.rerankerProvider !== null) {
      await resources.rerankerProvider.warmUp();
    }
    await resources.backgroundTasks.runStartupRecovery();
  });

  app.addHook("onRequest", async () => {
    resources.metrics.increment("http_requests_total");
  });

  app.get("/health", async () => {
    const settings = getSettings();
    return {
      status: "ok",
      service: settings.appName,
      environment: settings.environment
    };
  });

  app.get("/version", async () => {
    const settings = getSettings();
    return {
      service: settings.appName,
      version: "0.1.0"
    };
  });

  app.get("/openapi.json", async () => buildOpenApiDocument());

  app.get("/metrics", async () => ({
    service: resources.settings.appName,
    ...resources.metrics.snapshot()
  }));

  app.post("/projects", async (request, reply) => {
    const payload = (request.body ?? {}) as {
      org_id: string;
      project_id: string;
      description?: string | null;
    };
    const required = missingFields(payload as Record<string, unknown>, [
      "org_id",
      "project_id"
    ]);
    if (required.length > 0) {
      return replyValidationError(reply, required);
    }
    resources.projectStore.createProject(
      payload.org_id,
      payload.project_id,
      payload.description ?? null
    );
    return { status: "ok" };
  });

  app.get("/projects", async (request) => {
    const query = request.query as {
      org_id?: string;
    };
    return resources.projectStore.listProjects(query.org_id);
  });

  app.get("/projects/:orgId/:projectId", async (request, reply) => {
    const params = request.params as {
      orgId: string;
      projectId: string;
    };
    const project = resources.projectStore.getProject(params.orgId, params.projectId);
    if (project === null) {
      reply.code(404);
      return { detail: "project not found" };
    }
    return project;
  });

  app.get("/projects/:orgId/:projectId/episodes/count", async (request) => {
    const params = request.params as {
      orgId: string;
      projectId: string;
    };
    return {
      count: resources.projectStore.getEpisodeCount(params.orgId, params.projectId)
    };
  });

  app.post("/sessions", async (request, reply) => {
    const payload = (request.body ?? {}) as {
      session_key: string;
      org_id: string;
      project_id: string;
      session_id: string;
      user_id?: string | null;
      agent_id?: string | null;
      group_id?: string | null;
    };
    const required = missingFields(payload as Record<string, unknown>, [
      "session_key",
      "org_id",
      "project_id",
      "session_id"
    ]);
    if (required.length > 0) {
      return replyValidationError(reply, required);
    }
    resources.sessionStore.createSession({
      sessionKey: payload.session_key,
      orgId: payload.org_id,
      projectId: payload.project_id,
      sessionId: payload.session_id,
      userId: payload.user_id ?? null,
      agentId: payload.agent_id ?? null,
      groupId: payload.group_id ?? null
    });
    return { status: "ok" };
  });

  app.get("/sessions", async (request) => {
    const query = request.query as {
      org_id?: string;
      project_id?: string;
      user_id?: string;
      agent_id?: string;
      group_id?: string;
    };
    return resources.sessionStore.searchSessions({
      orgId: query.org_id,
      projectId: query.project_id,
      userId: query.user_id,
      agentId: query.agent_id,
      groupId: query.group_id
    });
  });

  app.get("/sessions/:sessionKey", async (request, reply) => {
    const params = request.params as {
      sessionKey: string;
    };
    const session = resources.sessionStore.getSession(params.sessionKey);
    if (session === null) {
      reply.code(404);
      return { detail: "session not found" };
    }
    return session;
  });

  app.delete("/sessions/:sessionKey", async (request) => {
    const params = request.params as {
      sessionKey: string;
    };
    await resources.memoryLifecycle.deleteSession({
      sessionKey: params.sessionKey
    });
    return { status: "ok" };
  });

  app.post("/memories", async (request, reply) => {
    const payload = (request.body ?? {}) as {
      session_key: string;
      semantic_set_id?: string;
      episodes: Array<{
        uid: string;
        session_key: string;
        session_id: string;
        producer_id: string;
        producer_role: string;
        produced_for_id?: string | null;
        sequence_num?: number;
        content: string;
        content_type?: string;
        episode_type?: string;
        metadata_json?: string | null;
        filterable_metadata_json?: string | null;
      }>;
    };
    const required = missingFields(payload as Record<string, unknown>, [
      "session_key",
      "episodes"
    ]);
    if (required.length > 0 || !Array.isArray(payload.episodes)) {
      return replyValidationError(reply, required.length > 0 ? required : ["episodes"]);
    }
    resources.episodeStore.addEpisodes(
      payload.episodes.map((episode) => ({
        uid: episode.uid,
        sessionKey: episode.session_key,
        sessionId: episode.session_id,
        producerId: episode.producer_id,
        producerRole: episode.producer_role,
        producedForId: episode.produced_for_id ?? null,
        sequenceNum: episode.sequence_num ?? 0,
        content: episode.content,
        contentType: episode.content_type ?? "string",
        episodeType: episode.episode_type ?? "message",
        metadataJson: episode.metadata_json ?? null,
        filterableMetadataJson: episode.filterable_metadata_json ?? null
      }))
    );
    const shortTerm = ShortTermMemory.create({
      sessionKey: payload.session_key,
      sessionStore: resources.sessionStore,
      messageCapacity: resources.memoryConfig.getShortTerm().message_capacity
    });
    shortTerm.addMessages(
      payload.episodes.map((episode) => ({
        uid: episode.uid,
        content: episode.content,
        producer_id: episode.producer_id,
        producer_role: episode.producer_role
      }))
    );
    shortTerm.persistSummary(payload.session_key, resources.sessionStore);
    if (payload.semantic_set_id !== undefined) {
      for (const episode of payload.episodes) {
        resources.semanticFeatureStore.addHistoryToSet(payload.semantic_set_id, episode.uid);
      }
    }
    await resources.compatibilitySync.syncEpisodeUids(
      payload.episodes.map((episode) => episode.uid)
    );
    return payload.episodes.map((episode) => ({ uid: episode.uid }));
  });

  app.get("/memories", async (request) => {
    const query = request.query as {
      session_key?: string;
    };
    return resources.episodeStore.listEpisodes({
      sessionKey: query.session_key
    });
  });

  app.get("/memories/:uid", async (request, reply) => {
    const params = request.params as {
      uid: string;
    };
    const episode = resources.episodeStore.getEpisodes([params.uid])[0] ?? null;
    if (episode === null) {
      reply.code(404);
      return null;
    }
    return episode;
  });

  app.post("/memories/search", async (request, reply) => {
    const payload = (request.body ?? {}) as {
      query: string;
      session_key?: string;
      session_id?: string;
      semantic_set_id?: string;
      mode?: "auto" | "episodic" | "semantic" | "mixed";
      limit?: number;
      context_window?: number;
      min_score?: number;
      producer_role?: string;
      episode_type?: string;
    };
    const required = missingFields(payload as Record<string, unknown>, ["query"]);
    if (required.length > 0) {
      return replyValidationError(reply, required);
    }
    const startedAt = performance.now();
    const result = await resources.memorySearch.search({
      query: payload.query,
      sessionKey: payload.session_key,
      sessionId: payload.session_id,
      semanticSetId: payload.semantic_set_id,
      mode: payload.mode,
      limit: payload.limit,
      contextWindow: payload.context_window,
      minScore: payload.min_score,
      producerRole: payload.producer_role,
      episodeType: payload.episode_type
    });
    resources.metrics.observeTiming("search_latency_ms", performance.now() - startedAt);
    return result;
  });

  app.post("/memories/agent", async (request, reply) => {
    const payload = (request.body ?? {}) as {
      query: string;
      session_key?: string;
      session_id?: string;
      semantic_set_id?: string;
      mode?: "auto" | "episodic" | "semantic" | "mixed";
      limit?: number;
      context_window?: number;
      min_score?: number;
      producer_role?: string;
      episode_type?: string;
    };
    const required = missingFields(payload as Record<string, unknown>, ["query"]);
    if (required.length > 0) {
      return replyValidationError(reply, required);
    }
    return resources.memorySearch.agent({
      query: payload.query,
      sessionKey: payload.session_key,
      sessionId: payload.session_id,
      semanticSetId: payload.semantic_set_id,
      mode: payload.mode,
      limit: payload.limit,
      contextWindow: payload.context_window,
      minScore: payload.min_score,
      producerRole: payload.producer_role,
      episodeType: payload.episode_type
    });
  });

  app.delete("/memories/episodes", async (request) => {
    const payload = request.body as {
      episode_uids: string[];
      semantic_set_id?: string;
    };
    await resources.memoryLifecycle.deleteEpisodes({
      episodeUids: payload.episode_uids,
      semanticSetId: payload.semantic_set_id
    });
    return { status: "ok" };
  });

  app.delete("/memories/semantic", async (request) => {
    const payload = (request.body ?? {}) as {
      feature_ids?: number[];
      set_id?: string;
      category?: string;
      tag?: string;
    };
    const featureIds =
      payload.feature_ids?.map((featureId) => Number(featureId)) ?? [];
    const deletedFeatureIds = await resources.semanticService.delete({
      featureIds,
      setId: payload.set_id,
      category: payload.category,
      tag: payload.tag
    });
    await resources.compatibilitySync.syncSemanticFeatures(deletedFeatureIds);
    return { status: "ok" };
  });

  app.delete("/projects/:orgId/:projectId", async (request) => {
    const params = request.params as {
      orgId: string;
      projectId: string;
    };
    await resources.memoryLifecycle.deleteProject({
      orgId: params.orgId,
      projectId: params.projectId
    });
    return { status: "ok" };
  });

  app.post("/semantic/features", async (request, reply) => {
    const payload = (request.body ?? {}) as {
      set_id: string;
      category: string;
      tag: string;
      feature_name: string;
      value: string;
      metadata_json?: string | null;
      embedding?: number[];
    };
    const required = missingFields(payload as Record<string, unknown>, [
      "set_id",
      "category",
      "tag",
      "feature_name",
      "value"
    ]);
    if (required.length > 0) {
      return replyValidationError(reply, required);
    }
    const featureId = resources.semanticFeatureStore.createFeature({
        setId: payload.set_id,
        category: payload.category,
        tag: payload.tag,
        featureName: payload.feature_name,
        value: payload.value,
        metadataJson: payload.metadata_json ?? null,
        embedding: payload.embedding
      });
    if (payload.embedding === undefined) {
      await resources.compatibilitySync.syncSemanticFeature(featureId);
    }
    return {
      id: featureId
    };
  });

  app.get("/semantic/features/:featureId", async (request, reply) => {
    const params = request.params as {
      featureId: string;
    };
    const feature = resources.semanticFeatureStore.getFeature(Number(params.featureId));
    if (feature === null) {
      reply.code(404);
      return { detail: "feature not found" };
    }
    return feature;
  });

  app.patch("/semantic/features/:featureId", async (request) => {
    const params = request.params as {
      featureId: string;
    };
    const payload = request.body as {
      set_id?: string;
      category?: string;
      tag?: string;
      feature_name?: string;
      value?: string;
      metadata_json?: string | null;
      embedding?: number[];
    };
    resources.semanticFeatureStore.updateFeature(Number(params.featureId), {
      setId: payload.set_id,
      category: payload.category,
      tag: payload.tag,
      featureName: payload.feature_name,
      value: payload.value,
      metadataJson: payload.metadata_json,
      embedding: payload.embedding
    });
    if (payload.embedding === undefined) {
      await resources.compatibilitySync.syncSemanticFeature(Number(params.featureId));
    }
    return { status: "ok" };
  });

  app.get("/memory-config/episodic", async () => {
    return resources.memoryConfig.getEpisodic();
  });

  app.patch("/memory-config/episodic", async (request) => {
    const payload = request.body as {
      top_k?: number;
      min_score?: number;
      context_window?: number;
      rerank_enabled?: boolean;
    };
    return resources.memoryConfig.updateEpisodic({
      top_k: payload.top_k,
      min_score: payload.min_score,
      context_window: payload.context_window,
      rerank_enabled: payload.rerank_enabled
    });
  });

  app.get("/memory-config/short-term", async () => {
    return resources.memoryConfig.getShortTerm();
  });

  app.patch("/memory-config/short-term", async (request) => {
    const payload = request.body as {
      message_capacity?: number;
      summary_enabled?: boolean;
    };
    return resources.memoryConfig.updateShortTerm({
      message_capacity: payload.message_capacity,
      summary_enabled: payload.summary_enabled
    });
  });

  app.get("/memory-config/long-term", async () => {
    return resources.memoryConfig.getLongTerm();
  });

  app.patch("/memory-config/long-term", async (request) => {
    const payload = request.body as {
      semantic_enabled?: boolean;
      episodic_enabled?: boolean;
    };
    return resources.memoryConfig.updateLongTerm({
      semantic_enabled: payload.semantic_enabled,
      episodic_enabled: payload.episodic_enabled
    });
  });

  registerSemanticConfigRoutes(app, resources);

  return app;
};
