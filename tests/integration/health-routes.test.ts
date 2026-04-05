import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createHttpApp } from "../../src/http/app.js";
import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";

describe("health routes", () => {
  const packageVersion = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf8")
  ).version as string;

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
      version: packageVersion
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
    expect(openapi.json().info.version).toBe(packageVersion);
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
