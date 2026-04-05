import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const OPENCLAW_PLUGIN_ID = "openclaw-memolite-n";
export const DEFAULT_BASE_URL = "http://127.0.0.1:18732";

export type OpenClawPluginConfig = {
  baseUrl: string;
  orgId: string;
  projectId: string;
  userId: string;
  autoCapture: boolean;
  autoRecall: boolean;
  searchThreshold: number;
  topK: number;
};

export type OpenClawPaths = {
  homeDir: string;
  configDir: string;
  configPath: string;
  pluginDir: string;
};

const DEFAULT_PLUGIN_CONFIG: OpenClawPluginConfig = {
  baseUrl: DEFAULT_BASE_URL,
  orgId: "openclaw",
  projectId: "openclaw",
  userId: "openclaw",
  autoCapture: true,
  autoRecall: true,
  searchThreshold: 0.5,
  topK: 5
};

const loadJson = (path: string): Record<string, any> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

const saveJson = (path: string, data: Record<string, any>): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const ensurePluginConfig = (
  document: Record<string, any>,
  overrides: Partial<OpenClawPluginConfig> = {}
): OpenClawPluginConfig => {
  const plugins = (document.plugins ??= {});
  const entries = (plugins.entries ??= {});
  const slots = (plugins.slots ??= {});

  slots.memory = OPENCLAW_PLUGIN_ID;
  const entry = (entries[OPENCLAW_PLUGIN_ID] ??= {});
  entry.enabled = true;
  entry.config = {
    ...DEFAULT_PLUGIN_CONFIG,
    ...(entry.config ?? {}),
    ...overrides
  };

  return entry.config as OpenClawPluginConfig;
};

const ensurePluginPackage = (paths: OpenClawPaths): void => {
  mkdirSync(paths.pluginDir, { recursive: true });
  mkdirSync(join(paths.pluginDir, "dist"), { recursive: true });
  const assetRoot = resolve(import.meta.dirname, "../../assets/openclaw-plugin");
  const builtRuntimeAsset = resolve(import.meta.dirname, "../../dist/openclaw/runtime-plugin.js");
  const runtimeAsset = existsSync(builtRuntimeAsset)
    ? builtRuntimeAsset
    : join(assetRoot, "dist", "index.mjs");
  const typeAsset = join(assetRoot, "dist", "index.d.ts");
  const manifestAsset = join(assetRoot, "openclaw.plugin.json");
  const packageJsonPath = join(paths.pluginDir, "package.json");
  const pluginManifestPath = join(paths.pluginDir, "openclaw.plugin.json");

  if (existsSync(runtimeAsset)) {
    copyFileSync(runtimeAsset, join(paths.pluginDir, "dist", "index.mjs"));
  }
  if (existsSync(typeAsset)) {
    copyFileSync(typeAsset, join(paths.pluginDir, "dist", "index.d.ts"));
  }
  if (existsSync(manifestAsset)) {
    copyFileSync(manifestAsset, pluginManifestPath);
  }
  if (!existsSync(packageJsonPath)) {
    saveJson(packageJsonPath, {
      name: OPENCLAW_PLUGIN_ID,
      type: "module",
      main: "dist/index.mjs",
      files: ["dist", "openclaw.plugin.json"],
      openclaw: {
        extensions: ["./dist/index.mjs"]
      }
    });
  }
};

const checkHealth = async (
  baseUrl: string
): Promise<{ healthOk: boolean; healthDetail: string }> => {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(2500)
    });
    const detail = await response.text();
    return {
      healthOk: response.ok,
      healthDetail: detail
    };
  } catch (error) {
    return {
      healthOk: false,
      healthDetail: error instanceof Error ? error.message : String(error)
    };
  }
};

export const createOpenClawPaths = (homeDir = homedir()): OpenClawPaths => ({
  homeDir,
  configDir: join(homeDir, ".openclaw"),
  configPath: join(homeDir, ".openclaw", "openclaw.json"),
  pluginDir: join(homeDir, ".openclaw", "extensions", OPENCLAW_PLUGIN_ID)
});

export const readOpenClawPluginConfig = (
  paths: OpenClawPaths
): OpenClawPluginConfig | null => {
  if (!existsSync(paths.configPath)) {
    return null;
  }
  const document = loadJson(paths.configPath);
  return (document.plugins?.entries?.[OPENCLAW_PLUGIN_ID]?.config ??
    null) as OpenClawPluginConfig | null;
};

export const setupOpenClawPlugin = (
  paths: OpenClawPaths,
  overrides: Partial<OpenClawPluginConfig> = {}
): OpenClawPluginConfig => {
  const document = existsSync(paths.configPath) ? loadJson(paths.configPath) : {};
  ensurePluginPackage(paths);
  const config = ensurePluginConfig(document, overrides);
  saveJson(paths.configPath, document);
  return config;
};

export const setOpenClawBaseUrl = (
  paths: OpenClawPaths,
  baseUrl: string
): OpenClawPluginConfig => {
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw new Error(`invalid base url: ${baseUrl}`);
  }
  if (!existsSync(paths.configPath)) {
    throw new Error(`openclaw config missing: ${paths.configPath}`);
  }
  const document = loadJson(paths.configPath);
  const config = ensurePluginConfig(document, { baseUrl });
  saveJson(paths.configPath, document);
  return config;
};

export const resetOpenClawPluginConfig = (
  paths: OpenClawPaths
): OpenClawPluginConfig => setOpenClawBaseUrl(paths, DEFAULT_BASE_URL);

export const uninstallOpenClawPlugin = (
  paths: OpenClawPaths,
  options: { dryRun?: boolean } = {}
): {
  dryRun: boolean;
  removedEntry: boolean;
  clearedMemorySlot: boolean;
  removedPluginDir: boolean;
} => {
  const dryRun = options.dryRun === true;
  let removedEntry = false;
  let clearedMemorySlot = false;

  if (existsSync(paths.configPath)) {
    const document = loadJson(paths.configPath);
    const plugins = (document.plugins ??= {});
    const entries = (plugins.entries ??= {});
    const slots = (plugins.slots ??= {});

    removedEntry = OPENCLAW_PLUGIN_ID in entries;
    if (removedEntry && !dryRun) {
      delete entries[OPENCLAW_PLUGIN_ID];
    }

    clearedMemorySlot = slots.memory === OPENCLAW_PLUGIN_ID;
    if (clearedMemorySlot && !dryRun) {
      delete slots.memory;
    }

    if (!dryRun) {
      saveJson(paths.configPath, document);
    }
  }

  const removedPluginDir = existsSync(paths.pluginDir);
  if (removedPluginDir && !dryRun) {
    rmSync(paths.pluginDir, { recursive: true, force: true });
  }

  return {
    dryRun,
    removedEntry,
    clearedMemorySlot,
    removedPluginDir
  };
};

export const getOpenClawStatus = async (
  paths: OpenClawPaths
): Promise<{
  configPath: string;
  pluginDirExists: boolean;
  pluginEntryEnabled: boolean;
  memorySlot: string | null;
  baseUrl: string;
  healthOk: boolean;
  healthDetail: string;
}> => {
  const document = existsSync(paths.configPath) ? loadJson(paths.configPath) : {};
  const entry = document.plugins?.entries?.[OPENCLAW_PLUGIN_ID] ?? {};
  const baseUrl = entry.config?.baseUrl ?? DEFAULT_BASE_URL;
  const health = await checkHealth(baseUrl);

  return {
    configPath: paths.configPath,
    pluginDirExists: existsSync(paths.pluginDir),
    pluginEntryEnabled: Boolean(entry.enabled),
    memorySlot: document.plugins?.slots?.memory ?? null,
    baseUrl,
    healthOk: health.healthOk,
    healthDetail: health.healthDetail
  };
};

export const doctorOpenClawPlugin = async (
  paths: OpenClawPaths
): Promise<{
  issues: string[];
  status: Awaited<ReturnType<typeof getOpenClawStatus>>;
}> => {
  const status = await getOpenClawStatus(paths);
  const issues: string[] = [];

  if (!existsSync(paths.configPath)) {
    issues.push(`missing config: ${paths.configPath}`);
  }
  if (!status.pluginDirExists) {
    issues.push(`plugin dir missing: ${paths.pluginDir}`);
  }
  if (status.memorySlot !== OPENCLAW_PLUGIN_ID) {
    issues.push("plugins.slots.memory is not openclaw-memolite-n");
  }
  if (!status.pluginEntryEnabled) {
    issues.push("plugins.entries.openclaw-memolite-n.enabled is false");
  }
  if (!status.healthOk) {
    issues.push(`memolite health check failed: ${status.healthDetail}`);
  }

  return { issues, status };
};
