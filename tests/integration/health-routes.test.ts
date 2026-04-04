import { afterEach, describe, expect, it } from "vitest";

import { createHttpApp } from "../../src/http/app.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";

describe("health routes", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_APP_NAME;
  });

  it("returns ok from /health", async () => {
    process.env.MEMOLITE_APP_NAME = "MemLite Node";
    const app = createHttpApp();

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "MemLite Node",
      environment: "development"
    });

    await app.close();
  });

  it("returns service and version from /version", async () => {
    process.env.MEMOLITE_APP_NAME = "MemLite Node";
    const app = createHttpApp();

    const response = await app.inject({
      method: "GET",
      url: "/version"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "MemLite Node",
      version: "0.1.0"
    });

    await app.close();
  });

  it("exposes a minimal openapi document and validates required project fields", async () => {
    const app = createHttpApp();

    const openapi = await app.inject({
      method: "GET",
      url: "/openapi.json"
    });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().paths).toHaveProperty("/projects");

    const invalidProject = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        org_id: "org-a"
      }
    });
    expect(invalidProject.statusCode).toBe(422);

    await app.close();
  });
});
