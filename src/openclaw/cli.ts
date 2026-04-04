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

  try {
    if (action === "setup") {
      const config = setupOpenClawPlugin(paths, {
        baseUrl: readOption(argv, "--base-url") ?? DEFAULT_BASE_URL,
        orgId: readOption(argv, "--org-id") ?? "openclaw",
        projectId: readOption(argv, "--project-id") ?? "openclaw",
        userId: readOption(argv, "--user-id") ?? "openclaw",
        autoCapture: (readOption(argv, "--auto-capture") ?? "true") === "true",
        autoRecall: (readOption(argv, "--auto-recall") ?? "true") === "true",
        searchThreshold: Number(readOption(argv, "--search-threshold") ?? "0.5"),
        topK: Number(readOption(argv, "--top-k") ?? "5")
      });
      writeJson(write, config);
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
