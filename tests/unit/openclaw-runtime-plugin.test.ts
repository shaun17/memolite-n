import { describe, expect, it, vi } from "vitest";

import plugin from "../../src/openclaw/runtime-plugin.js";

type RegisteredTool = {
  name?: string;
  execute?: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
};

const createApi = (config: Record<string, unknown> = {}) => {
  const tools: RegisteredTool[] = [];
  const hooks = new Map<string, (event: any, ctx: { sessionKey?: string }) => Promise<unknown>>();
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  const api = {
    pluginConfig: config,
    logger,
    registerTool(factory: (ctx: { sessionKey?: string }) => RegisteredTool) {
      tools.push(factory({ sessionKey: "session-a" }));
    },
    registerService: vi.fn(),
    on(event: string, handler: (event: any, ctx: { sessionKey?: string }) => Promise<unknown>) {
      hooks.set(event, handler);
    }
  };
  plugin.register(api as never);
  return { tools, hooks, logger };
};

describe("openclaw runtime plugin", () => {
  it("registers generic and memolite-prefixed tools", () => {
    const { tools } = createApi({
      baseUrl: "http://memolite.local",
      orgId: "org-a",
      projectId: "project-a",
      userId: "user-1"
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "memory_search",
      "memolite_search",
      "memory_store",
      "memolite_store",
      "memory_get",
      "memolite_get",
      "memory_list",
      "memolite_list",
      "memory_forget",
      "memolite_forget",
      "memolite_status"
    ]);
  });

  it("auto-recalls and auto-captures through hooks", async () => {
    global.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            episodic_matches: [
              {
                episode: {
                  uid: "ep-1",
                  session_key: "session-a",
                  session_id: "session-a",
                  content: "User likes ramen.",
                  producer_role: "user",
                  sequence_num: 1
                },
                score: 0.93
              }
            ],
            semantic_features: []
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "missing" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "missing" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ uid: "session-a-1" }]), { status: 200 }));

    const { hooks, logger } = createApi({
      baseUrl: "http://memolite.local",
      orgId: "org-a",
      projectId: "project-a",
      userId: "user-1",
      autoRecall: true,
      autoCapture: true
    });

    const recall = await hooks.get("before_agent_start")?.(
      { prompt: "What food do I like?" },
      { sessionKey: "session-a" }
    );
    await hooks.get("agent_end")?.(
      {
        success: true,
        messages: [{ role: "user", content: "Remember I like ramen." }]
      },
      { sessionKey: "session-a" }
    );

    expect((recall as { prependContext: string }).prependContext).toContain("User likes ramen.");
    expect(logger.info).toHaveBeenCalledWith("openclaw-memolite-n: auto-capture completed");
  });

  it("switches search scope to all when the query asks for all memories", async () => {
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ episodic_matches: [], semantic_features: [] }), {
        status: 200
      })
    );

    const { tools } = createApi({
      baseUrl: "http://memolite.local",
      orgId: "org-a",
      projectId: "project-a",
      userId: "user-1"
    });

    await tools[0].execute?.("tool-1", { query: "查询全部信息：我喜欢什么" });

    const call = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.session_id).toBeNull();
    expect(body.semantic_set_id).toBe("user-1");
    expect(body.mode).toBe("mixed");
  });

  it("returns readable errors and exposes memolite_status", async () => {
    global.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "boom" }), { status: 500 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 })
      );

    const { tools } = createApi({
      baseUrl: "http://memolite.local",
      orgId: "org-a",
      projectId: "project-a",
      userId: "user-1",
      autoRecall: true,
      autoCapture: true
    });
    const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

    const failed = await toolByName.get("memory_search")?.execute?.("tool-1", {
      query: "food"
    });
    const status = await toolByName.get("memolite_status")?.execute?.("tool-2", {});

    expect(failed).toEqual({ error: '500: {"detail":"boom"}' });
    expect(status).toEqual({
      provider: "memolite",
      pluginId: "openclaw-memolite-n",
      tool: "memolite_status",
      executed: true,
      sessionKey: "session-a",
      data: {
        health: { status: "ok" },
        config: {
          baseUrl: "http://memolite.local",
          orgId: "org-a",
          projectId: "project-a",
          userId: "user-1",
          autoCapture: true,
          autoRecall: true,
          searchThreshold: 0.5,
          topK: 5
        },
        toolAliases: [
          "memory_search",
          "memolite_search",
          "memory_store",
          "memolite_store",
          "memory_get",
          "memolite_get",
          "memory_list",
          "memolite_list",
          "memory_forget",
          "memolite_forget",
          "memolite_status"
        ]
      }
    });
  });
});
