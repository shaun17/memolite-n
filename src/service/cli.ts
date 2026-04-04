import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getSettings } from "../common/config/runtime-settings.js";
import {
  createServicePaths,
  renderLaunchAgentPlist,
  renderSystemdUserUnit
} from "./manager.js";

type ServiceCliOptions = {
  memoliteBin?: string;
  platform?: NodeJS.Platform;
  xdgConfigHome?: string;
  homeDir?: string;
  write?: (text: string) => void;
};

const writeJson = (write: (text: string) => void, payload: unknown): void => {
  write(`${JSON.stringify(payload, null, 2)}\n`);
};

const run = (command: string, args: string[]): void => {
  execFileSync(command, args, { stdio: "ignore" });
};

const isEnabledMacos = (label: string): boolean => {
  try {
    run("launchctl", ["print", `gui/${process.getuid?.() ?? 0}/${label}`]);
    return true;
  } catch {
    return false;
  }
};

const isEnabledLinux = (label: string): boolean => {
  try {
    run("systemctl", ["--user", "list-unit-files", `${label}.service`]);
    return true;
  } catch {
    return false;
  }
};

const spawnDetachedServe = (memoliteBin: string, env: NodeJS.ProcessEnv): void => {
  const child = spawn(memoliteBin, ["serve"], {
    detached: true,
    stdio: "ignore",
    env
  });
  child.unref();
};

const checkHealth = async (
  host: string,
  port: number
): Promise<{ healthOk: boolean; healthDetail: string }> => {
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(2500)
    });
    return {
      healthOk: response.ok,
      healthDetail: await response.text()
    };
  } catch (error) {
    return {
      healthOk: false,
      healthDetail: error instanceof Error ? error.message : String(error)
    };
  }
};

export const executeServiceCommand = async (
  argv: string[],
  options: ServiceCliOptions = {}
): Promise<number> => {
  const [action, ...rest] = argv;
  const platform = options.platform ?? process.platform;
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const settings = getSettings();
  const paths = createServicePaths({
    homeDir: options.homeDir,
    xdgConfigHome: options.xdgConfigHome
  });
  const memoliteBin = options.memoliteBin ?? process.argv[1] ?? "memolite";
  const env = {
    ...process.env,
    MEMOLITE_HOST: settings.host,
    MEMOLITE_PORT: String(settings.port),
    MEMOLITE_SQLITE_PATH: settings.sqlitePath,
    MEMOLITE_KUZU_PATH: settings.kuzuPath
  };

  const descriptor = {
    label: paths.label,
    memoliteBin,
    host: settings.host,
    port: settings.port,
    sqlitePath: settings.sqlitePath,
    kuzuPath: settings.kuzuPath,
    outLog: paths.outLog,
    errLog: paths.errLog
  };

  try {
    mkdirSync(paths.logDir, { recursive: true });
    mkdirSync(dirname(settings.sqlitePath), { recursive: true });

    if (platform === "darwin") {
      if (action === "install") {
        mkdirSync(dirname(paths.plistPath), { recursive: true });
        writeFileSync(paths.plistPath, renderLaunchAgentPlist(descriptor), "utf8");
        if (rest.includes("--enable")) {
          run("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 0}`, paths.plistPath]);
          run("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        }
        writeJson(write, { status: "ok", action, path: paths.plistPath });
        return 0;
      }
      if (action === "uninstall") {
        try {
          run("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        } catch {}
        if (existsSync(paths.plistPath)) {
          rmSync(paths.plistPath, { force: true });
        }
        writeJson(write, { status: "ok", action, path: paths.plistPath });
        return 0;
      }
      if (action === "enable") {
        if (!existsSync(paths.plistPath)) {
          mkdirSync(dirname(paths.plistPath), { recursive: true });
          writeFileSync(paths.plistPath, renderLaunchAgentPlist(descriptor), "utf8");
        }
        run("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 0}`, paths.plistPath]);
        run("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        writeJson(write, { status: "ok", action, path: paths.plistPath });
        return 0;
      }
      if (action === "disable") {
        try {
          run("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        } catch {}
        writeJson(write, { status: "ok", action, loaded: false });
        return 0;
      }
      if (action === "start") {
        if (isEnabledMacos(paths.label)) {
          run("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        } else {
          spawnDetachedServe(memoliteBin, env);
        }
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "stop") {
        try {
          run("launchctl", ["kill", "SIGTERM", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        } catch {}
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "restart") {
        try {
          run("launchctl", ["kill", "SIGTERM", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        } catch {}
        if (isEnabledMacos(paths.label)) {
          run("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 0}/${paths.label}`]);
        } else {
          spawnDetachedServe(memoliteBin, env);
        }
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "status") {
        const health = await checkHealth(settings.host, settings.port);
        writeJson(write, {
          platform,
          path: paths.plistPath,
          loaded: isEnabledMacos(paths.label),
          endpoint: `http://${settings.host}:${settings.port}`,
          healthOk: health.healthOk,
          healthDetail: health.healthDetail
        });
        return health.healthOk ? 0 : 1;
      }
    }

    if (platform === "linux") {
      if (action === "install") {
        mkdirSync(dirname(paths.unitPath), { recursive: true });
        writeFileSync(paths.unitPath, renderSystemdUserUnit(descriptor), "utf8");
        run("systemctl", ["--user", "daemon-reload"]);
        if (rest.includes("--enable")) {
          run("systemctl", ["--user", "enable", `${paths.label}.service`]);
          run("systemctl", ["--user", "start", `${paths.label}.service`]);
        }
        writeJson(write, { status: "ok", action, path: paths.unitPath });
        return 0;
      }
      if (action === "uninstall") {
        try {
          run("systemctl", ["--user", "disable", `${paths.label}.service`]);
        } catch {}
        try {
          run("systemctl", ["--user", "stop", `${paths.label}.service`]);
        } catch {}
        if (existsSync(paths.unitPath)) {
          rmSync(paths.unitPath, { force: true });
        }
        try {
          run("systemctl", ["--user", "daemon-reload"]);
        } catch {}
        writeJson(write, { status: "ok", action, path: paths.unitPath });
        return 0;
      }
      if (action === "enable") {
        if (!existsSync(paths.unitPath)) {
          mkdirSync(dirname(paths.unitPath), { recursive: true });
          writeFileSync(paths.unitPath, renderSystemdUserUnit(descriptor), "utf8");
          run("systemctl", ["--user", "daemon-reload"]);
        }
        run("systemctl", ["--user", "enable", `${paths.label}.service`]);
        run("systemctl", ["--user", "start", `${paths.label}.service`]);
        writeJson(write, { status: "ok", action, path: paths.unitPath });
        return 0;
      }
      if (action === "disable") {
        try {
          run("systemctl", ["--user", "disable", `${paths.label}.service`]);
        } catch {}
        try {
          run("systemctl", ["--user", "stop", `${paths.label}.service`]);
        } catch {}
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "start") {
        if (isEnabledLinux(paths.label)) {
          run("systemctl", ["--user", "start", `${paths.label}.service`]);
        } else {
          spawnDetachedServe(memoliteBin, env);
        }
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "stop") {
        try {
          run("systemctl", ["--user", "stop", `${paths.label}.service`]);
        } catch {}
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "restart") {
        try {
          run("systemctl", ["--user", "stop", `${paths.label}.service`]);
        } catch {}
        if (isEnabledLinux(paths.label)) {
          run("systemctl", ["--user", "start", `${paths.label}.service`]);
        } else {
          spawnDetachedServe(memoliteBin, env);
        }
        writeJson(write, { status: "ok", action });
        return 0;
      }
      if (action === "status") {
        const health = await checkHealth(settings.host, settings.port);
        writeJson(write, {
          platform,
          path: paths.unitPath,
          installed: isEnabledLinux(paths.label),
          endpoint: `http://${settings.host}:${settings.port}`,
          healthOk: health.healthOk,
          healthDetail: health.healthDetail
        });
        return health.healthOk ? 0 : 1;
      }
    }
  } catch (error) {
    writeJson(write, {
      error: error instanceof Error ? error.message : String(error)
    });
    return 1;
  }

  writeJson(write, {
    error: `unsupported platform or action: ${platform}:${action ?? "unknown"}`
  });
  return 1;
};
