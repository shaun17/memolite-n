import { describe, expect, it, vi } from "vitest";

import { MemoliteApiError, MemoliteClient, MemoliteClientError } from "../../src/sdk/index.js";

describe("memolite sdk client", () => {
  it("retries 5xx responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "retry" }), { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 })
      );

    const client = new MemoliteClient({
      baseUrl: "http://testserver",
      retries: 1,
      retryBackoffMs: 0,
      fetchImpl
    });

    const result = await client.request<{ status: string }>("GET", "/health");

    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("raises api errors for 4xx responses", async () => {
    const client = new MemoliteClient({
      baseUrl: "http://testserver",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ detail: "missing" }), { status: 404 })
      )
    });

    await expect(client.request("GET", "/projects/x/y")).rejects.toMatchObject({
      statusCode: 404,
      responseBody: { detail: "missing" }
    });
  });

  it("raises client errors after fetch failures", async () => {
    const client = new MemoliteClient({
      baseUrl: "http://testserver",
      retries: 1,
      retryBackoffMs: 0,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("boom"))
    });

    await expect(client.request("GET", "/health")).rejects.toBeInstanceOf(
      MemoliteClientError
    );
    expect(MemoliteApiError).toBeDefined();
  });
});
