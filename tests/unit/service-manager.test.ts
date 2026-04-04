import { describe, expect, it } from "vitest";

import {
  renderLaunchAgentPlist,
  renderSystemdUserUnit
} from "../../src/service/manager.js";

describe("service manager", () => {
  it("renders a macOS launch agent that starts memolite serve", () => {
    const plist = renderLaunchAgentPlist({
      label: "ai.memolite.server",
      memoliteBin: "/usr/local/bin/memolite",
      host: "127.0.0.1",
      port: 18731,
      sqlitePath: "/Users/test/.memolite/memolite.sqlite3",
      kuzuPath: "/Users/test/.memolite/kuzu",
      outLog: "/tmp/memolite/memolite.out.log",
      errLog: "/tmp/memolite/memolite.err.log"
    });

    expect(plist).toContain("<string>/usr/local/bin/memolite</string>");
    expect(plist).toContain("<string>serve</string>");
    expect(plist).toContain("<key>MEMOLITE_SQLITE_PATH</key>");
    expect(plist).toContain("<string>/Users/test/.memolite/kuzu</string>");
  });

  it("renders a linux user unit that starts memolite serve", () => {
    const unit = renderSystemdUserUnit({
      label: "ai.memolite.server",
      memoliteBin: "/usr/local/bin/memolite",
      host: "127.0.0.1",
      port: 18731,
      sqlitePath: "/home/test/.memolite/memolite.sqlite3",
      kuzuPath: "/home/test/.memolite/kuzu",
      outLog: "/tmp/memolite/memolite.out.log",
      errLog: "/tmp/memolite/memolite.err.log"
    });

    expect(unit).toContain("ExecStart=/usr/local/bin/memolite serve");
    expect(unit).toContain("Environment=MEMOLITE_SQLITE_PATH=/home/test/.memolite/memolite.sqlite3");
    expect(unit).toContain("Environment=MEMOLITE_KUZU_PATH=/home/test/.memolite/kuzu");
  });
});
