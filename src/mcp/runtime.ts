import { createResources } from "../app/resources.js";
import { getSettings } from "../common/config/runtime-settings.js";
import { createMcpHttpApp } from "./http-app.js";
import { createMcpServer } from "./server.js";

export const startMcpHttpServer = async (): Promise<void> => {
  const settings = getSettings();
  const resources = createResources();
  await resources.embedderProvider.warmUp();
  if (resources.rerankerProvider !== null) {
    await resources.rerankerProvider.warmUp();
  }
  const app = createMcpHttpApp(resources);
  app.addHook("onClose", async () => {
    resources.close();
  });
  await app.listen({
    host: settings.host,
    port: settings.port
  });
};

export const startMcpStdioServer = async (): Promise<void> => {
  const resources = createResources();
  await resources.embedderProvider.warmUp();
  if (resources.rerankerProvider !== null) {
    await resources.rerankerProvider.warmUp();
  }
  const server = createMcpServer(resources);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk: string) => {
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const output = await handleMcpStdioLine(server, trimmed);
      process.stdout.write(`${output}\n`);
    }
  });
  process.stdin.resume();
};

export const handleMcpStdioLine = async (
  server: ReturnType<typeof createMcpServer>,
  line: string
): Promise<string> => {
  const payload = JSON.parse(line) as {
    name: string;
    input?: Record<string, unknown>;
  };
  const result = await server.callTool(payload.name, payload.input ?? {});
  return JSON.stringify(result);
};
