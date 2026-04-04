import type { FastifyInstance } from "fastify";

import type { AppResources } from "../app/resources.js";

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return Number(value);
};

export const registerSemanticConfigRoutes = (
  app: FastifyInstance,
  resources: AppResources
): void => {
  app.post("/semantic/config/set-types", async (request) => {
    const payload = request.body as {
      org_id: string;
      metadata_tags_sig: string;
      org_level_set?: boolean;
      name?: string | null;
      description?: string | null;
    };
    return {
      id: resources.semanticSessionManager.createSetType({
        orgId: payload.org_id,
        metadataTagsSig: payload.metadata_tags_sig,
        orgLevelSet: payload.org_level_set,
        name: payload.name,
        description: payload.description
      })
    };
  });

  app.get("/semantic/config/set-types", async (request) => {
    const query = request.query as { org_id?: string };
    return resources.semanticSessionManager.listSetTypes(query.org_id);
  });

  app.delete("/semantic/config/set-types/:setTypeId", async (request) => {
    const params = request.params as { setTypeId: string };
    resources.semanticSessionManager.deleteSetType(Number(params.setTypeId));
    return { status: "ok" };
  });

  app.post("/semantic/config/sets", async (request, reply) => {
    const payload = request.body as {
      set_id: string;
      set_type_id?: number | null;
      set_name?: string | null;
      set_description?: string | null;
      embedder_name?: string | null;
      language_model_name?: string | null;
    };
    const config = resources.semanticSessionManager.bindSet({
      setId: payload.set_id,
      setTypeId: payload.set_type_id,
      setName: payload.set_name,
      setDescription: payload.set_description,
      embedderName: payload.embedder_name,
      languageModelName: payload.language_model_name
    });
    if (config === null) {
      reply.code(500);
      return { detail: "failed to configure set" };
    }
    return config;
  });

  app.get("/semantic/config/sets/:setId", async (request, reply) => {
    const params = request.params as { setId: string };
    const config = resources.semanticSessionManager.getSetConfig(params.setId);
    if (config === null) {
      reply.code(404);
      return { detail: "set config not found" };
    }
    return config;
  });

  app.get("/semantic/config/sets", async () => resources.semanticSessionManager.listSetIds());

  app.post("/semantic/config/categories", async (request) => {
    const payload = request.body as {
      name: string;
      prompt: string;
      description?: string | null;
      set_id?: string | null;
      set_type_id?: number | null;
    };
    return {
      id: resources.semanticSessionManager.createCategory({
        name: payload.name,
        prompt: payload.prompt,
        description: payload.description,
        setId: payload.set_id,
        setTypeId: payload.set_type_id
      })
    };
  });

  app.get("/semantic/config/categories/:categoryId", async (request, reply) => {
    const params = request.params as { categoryId: string };
    const category = resources.semanticSessionManager.getCategory(Number(params.categoryId));
    if (category === null) {
      reply.code(404);
      return { detail: "category not found" };
    }
    return category;
  });

  app.get("/semantic/config/categories", async (request) => {
    const query = request.query as { set_id: string };
    return resources.semanticSessionManager.listCategories(query.set_id);
  });

  app.get("/semantic/config/categories/:name/set-ids", async (request) => {
    const params = request.params as { name: string };
    return resources.semanticSessionManager.getCategorySetIds(params.name);
  });

  app.delete("/semantic/config/categories/:categoryId", async (request) => {
    const params = request.params as { categoryId: string };
    resources.semanticSessionManager.deleteCategory(Number(params.categoryId));
    return { status: "ok" };
  });

  app.post("/semantic/config/category-templates", async (request) => {
    const payload = request.body as {
      set_type_id?: number | null;
      name: string;
      category_name: string;
      prompt: string;
      description?: string | null;
    };
    return {
      id: resources.semanticSessionManager.createCategoryTemplate({
        setTypeId: payload.set_type_id,
        name: payload.name,
        categoryName: payload.category_name,
        prompt: payload.prompt,
        description: payload.description
      })
    };
  });

  app.get("/semantic/config/category-templates", async (request) => {
    const query = request.query as { set_type_id?: string | number };
    return resources.semanticSessionManager.listCategoryTemplates(
      toOptionalNumber(query.set_type_id)
    );
  });

  app.post("/semantic/config/disabled-categories", async (request) => {
    const payload = request.body as { set_id: string; category_name: string };
    resources.semanticSessionManager.disableCategory({
      setId: payload.set_id,
      categoryName: payload.category_name
    });
    return { status: "ok" };
  });

  app.get("/semantic/config/disabled-categories/:setId", async (request) => {
    const params = request.params as { setId: string };
    return resources.semanticSessionManager.listDisabledCategories(params.setId);
  });

  app.post("/semantic/config/tags", async (request) => {
    const payload = request.body as {
      category_id: number;
      name: string;
      description: string;
    };
    return {
      id: resources.semanticSessionManager.createTag({
        categoryId: payload.category_id,
        name: payload.name,
        description: payload.description
      })
    };
  });

  app.get("/semantic/config/tags", async (request) => {
    const query = request.query as { category_id?: string | number };
    return resources.semanticSessionManager.listTags(Number(query.category_id));
  });

  app.delete("/semantic/config/tags/:tagId", async (request) => {
    const params = request.params as { tagId: string };
    resources.semanticSessionManager.deleteTag(Number(params.tagId));
    return { status: "ok" };
  });
};
