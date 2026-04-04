import Fastify, { type FastifyInstance } from "fastify";

import type { AppResources } from "../app/resources.js";
import { createMcpServer } from "./server.js";

export const createMcpHttpApp = (resources: AppResources): FastifyInstance => {
  const app = Fastify();
  const server = createMcpServer(resources);

  app.get("/tools", async () => {
    return {
      tools: await server.listTools()
    };
  });

  app.post("/call-tool", async (request) => {
    const payload = request.body as {
      name: string;
      input?: Record<string, unknown>;
    };
    return server.callTool(payload.name, payload.input ?? {});
  });

  return app;
};
