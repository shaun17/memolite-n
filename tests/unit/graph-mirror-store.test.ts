import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GraphMirrorStore } from "../../src/graph/mirror-store.js";

describe("graph mirror store", () => {
  it("stores mirror data adjacent to the kuzu database file", () => {
    const root = mkdtempSync(join(tmpdir(), "memolite-n-graph-mirror-"));
    const kuzuPath = join(root, "kuzu");
    const store = new GraphMirrorStore(kuzuPath);

    store.writeSnapshot({
      episodes: [
        {
          uid: "ep-1",
          session_id: "session-a",
          content: "ramen",
          content_type: "string",
          created_at: "2026-04-05T00:00:00Z",
          metadata_json: null
        }
      ],
      derivatives: []
    });

    expect(existsSync(`${kuzuPath}.graph-mirror.json`)).toBe(true);
    expect(existsSync(join(kuzuPath, "graph-mirror.json"))).toBe(false);
  });
});
