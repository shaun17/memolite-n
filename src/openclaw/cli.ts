import { executeServiceCommand } from "../service/cli.js";
import {
  createOpenClawPaths,
  DEFAULT_BASE_URL,
  doctorOpenClawPlugin,
  getOpenClawStatus,
  readOpenClawPluginConfig,
  resetOpenClawPluginConfig,
  setOpenClawBaseUrl,
  setupOpenClawPlugin,
  type OpenClawPaths,
  uninstallOpenClawPlugin
} from "./config-manager.js";

type OpenClawCliOptions = {
  paths?: OpenClawPaths;
  write?: (text: string) => void;
  memoliteBin?: string;
  platform?: NodeJS.Platform;
};

const pollHealth = async (baseUrl: string, timeoutMs = 5000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(1000)
      });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

const readOption = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
};

const writeJson = (write: (text: string) => void, payload: unknown): void => {
  write(`${JSON.stringify(payload, null, 2)}\n`);
};

export const executeOpenClawCommand = async (
  argv: string[],
  options: OpenClawCliOptions = {}
): Promise<number> => {
  const [action, mode] = argv;
  const paths = options.paths ?? createOpenClawPaths();
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const memoliteBin = options.memoliteBin ?? process.argv[1] ?? "memolite-n";
  const platform = options.platform ?? process.platform;

  try {
    if (action === "setup") {
      const baseUrl = readOption(argv, "--base-url") ?? DEFAULT_BASE_URL;
      const config = setupOpenClawPlugin(paths, {
        baseUrl,
        orgId: readOption(argv, "--org-id") ?? "openclaw",
        projectId: readOption(argv, "--project-id") ?? "openclaw",
        userId: readOption(argv, "--user-id") ?? "openclaw",
        autoCapture: (readOption(argv, "--auto-capture") ?? "true") === "true",
        autoRecall: (readOption(argv, "--auto-recall") ?? "true") === "true",
        searchThreshold: Number(readOption(argv, "--search-threshold") ?? "0.5"),
        topK: Number(readOption(argv, "--top-k") ?? "5")
      });

      // Ensure the service is running after plugin registration
      let serviceResult: Record<string, unknown> = { skipped: true };
      try {
        const alreadyUp = await pollHealth(baseUrl, 1000);
        if (alreadyUp) {
          serviceResult = { action: "none", reason: "already running", healthOk: true };
        } else {
          const serviceOutput: string[] = [];
          const installCode = await executeServiceCommand(["install", "--enable"], {
            memoliteBin,
            platform,
            write: (text) => serviceOutput.push(text)
          });
          const healthOk = installCode === 0 ? await pollHealth(baseUrl, 5000) : false;
          serviceResult = {
            action: "install",
            output: serviceOutput.join("").trim(),
            healthOk
          };
        }
      } catch (serviceError) {
        serviceResult = {
          action: "install",
          error: serviceError instanceof Error ? serviceError.message : String(serviceError),
          healthOk: false
        };
      }

      writeJson(write, { setup: config, service: serviceResult });
      return 0;
    }

    if (action === "status") {
      const status = await getOpenClawStatus(paths);
      writeJson(write, status);
      return status.pluginDirExists && status.pluginEntryEnabled && status.healthOk ? 0 : 1;
    }

    if (action === "doctor") {
      const diagnosis = await doctorOpenClawPlugin(paths);
      writeJson(write, diagnosis);
      return diagnosis.issues.length === 0 ? 0 : 1;
    }

    if (action === "uninstall") {
      writeJson(write, uninstallOpenClawPlugin(paths, { dryRun: argv.includes("--dry-run") }));
      return 0;
    }

    if (action === "configure" && mode === "show") {
      const config = readOpenClawPluginConfig(paths);
      if (config === null) {
        writeJson(write, { error: `openclaw config missing: ${paths.configPath}` });
        return 1;
      }
      writeJson(write, config);
      return 0;
    }

    if (action === "configure" && mode === "set") {
      const baseUrl = readOption(argv, "--base-url");
      if (baseUrl === undefined) {
        writeJson(write, { error: "missing --base-url" });
        return 1;
      }
      writeJson(write, setOpenClawBaseUrl(paths, baseUrl));
      return 0;
    }

    if (action === "configure" && mode === "reset") {
      writeJson(write, resetOpenClawPluginConfig(paths));
      return 0;
    }
  } catch (error) {
    writeJson(write, {
      error: error instanceof Error ? error.message : String(error)
    });
    return 1;
  }

  return 1;
};
