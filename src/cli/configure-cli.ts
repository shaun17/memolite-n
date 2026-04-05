import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_DATA_DIR } from "../common/config/settings.js";
import { SqliteVecExtensionLoader } from "../storage/sqlite-vec.js";

export type CliSettings = {
  host: string;
  port: number;
  sqlitePath: string;
  kuzuPath: string;
  sqliteVecExtensionPath: string | null;
};

export type BuildCliSettingsInput = {
  dataDir?: string;
  sqliteVecExtensionPath?: string | null;
  host?: string;
  port?: number;
};

export type WriteEnvFileInput = {
  output: string;
  settings: CliSettings;
  overwrite: boolean;
};

export type ConfigureEnvironmentInput = {
  output: string;
  dataDir?: string;
  sqliteVecExtensionPath?: string | null;
  host: string;
  port: number;
  overwrite: boolean;
};

export type DetectSqliteVecInput = {
  extensionPath?: string | null;
};

export const buildCliSettings = (
  input: BuildCliSettingsInput = {}
): CliSettings => {
  const dataDir = input.dataDir ?? DEFAULT_DATA_DIR;
  return {
    host: input.host ?? "127.0.0.1",
    port: input.port ?? 18732,
    sqlitePath: join(dataDir, "memolite.sqlite3"),
    kuzuPath: join(dataDir, "kuzu"),
    sqliteVecExtensionPath: input.sqliteVecExtensionPath ?? null
  };
};

export const renderEnv = (settings: CliSettings): string => {
  const lines = [
    `MEMOLITE_HOST=${settings.host}`,
    `MEMOLITE_PORT=${settings.port}`,
    `MEMOLITE_SQLITE_PATH=${settings.sqlitePath}`,
    `MEMOLITE_KUZU_PATH=${settings.kuzuPath}`
  ];
  if (settings.sqliteVecExtensionPath !== null) {
    lines.push(`MEMOLITE_SQLITE_VEC_EXTENSION_PATH=${settings.sqliteVecExtensionPath}`);
  }
  return `${lines.join("\n")}\n`;
};

export const writeEnvFile = ({ output, settings, overwrite }: WriteEnvFileInput): void => {
  if (existsSync(output) && !overwrite) {
    throw new Error(`file already exists: ${output}`);
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, renderEnv(settings), "utf8");
};

export const configureEnvironment = ({
  output,
  dataDir,
  sqliteVecExtensionPath,
  host,
  port,
  overwrite
}: ConfigureEnvironmentInput): void => {
  const settings = buildCliSettings({
    dataDir,
    sqliteVecExtensionPath,
    host,
    port
  });
  mkdirSync(dirname(settings.sqlitePath), { recursive: true });
  writeEnvFile({ output, settings, overwrite });
};

export const initializeLocalEnvironment = (settings: CliSettings): void => {
  mkdirSync(dirname(settings.sqlitePath), { recursive: true });
  const fileDescriptor = openSync(settings.sqlitePath, "a");
  closeSync(fileDescriptor);
};

export const detectSqliteVec = ({ extensionPath }: DetectSqliteVecInput): number => {
  return new SqliteVecExtensionLoader(extensionPath).isAvailable() ? 0 : 1;
};
