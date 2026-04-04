import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { clearSettingsCache } from "../../src/common/config/runtime-settings.js";
import { createHttpApp } from "../../src/http/app.js";
import { MemoliteClient } from "../../src/sdk/index.js";

describe("sdk config roundtrip", () => {
  afterEach(() => {
    clearSettingsCache();
    delete process.env.MEMOLITE_SQLITE_PATH;
    delete process.env.MEMOLITE_KUZU_PATH;
  });

  it("supports semantic config and memory config operations through the sdk", async () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-sdk-config-"));
    process.env.MEMOLITE_SQLITE_PATH = join(root, "memolite.sqlite3");
    process.env.MEMOLITE_KUZU_PATH = join(root, "kuzu");

    const app = createHttpApp();
    await app.ready();
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const baseUrl = String(address);

    const client = new MemoliteClient({
      baseUrl
    });

    const setTypeId = await client.config.createSetType({
      orgId: "org-a",
      metadataTagsSig: "user",
      name: "default"
    });
    const configured = await client.config.configureSet({
      setId: "session-a",
      setTypeId,
      setName: "session config"
    });
    const categoryId = await client.config.addCategory({
      name: "profile",
      prompt: "extract preferences",
      setId: "session-a"
    });
    const tagId = await client.config.addTag({
      categoryId,
      name: "likes",
      description: "liked items"
    });
    await client.config.disableCategory({
      setId: "session-a",
      categoryName: "profile"
    });
    const episodic = await client.config.updateEpisodicMemoryConfig({ topK: 7 });
    const shortTerm = await client.config.getShortTermMemoryConfig();
    const longTerm = await client.config.updateLongTermMemoryConfig({
      semanticEnabled: false
    });

    expect(configured.set_id).toBe("session-a");
    expect((await client.config.listSetTypes({ orgId: "org-a" }))[0]?.id).toBe(setTypeId);
    expect(await client.config.listSetIds()).toEqual(["session-a"]);
    expect((await client.config.listCategories({ setId: "session-a" }))[0]?.id).toBe(categoryId);
    expect((await client.config.listTags({ categoryId }))[0]?.id).toBe(tagId);
    expect(episodic.top_k).toBe(7);
    expect(shortTerm.message_capacity).toBeGreaterThan(0);
    expect(longTerm.semantic_enabled).toBe(false);

    await client.close();
    await app.close();
  });
});
