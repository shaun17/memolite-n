import { readFileSync } from "node:fs";

let cachedVersion: string | null = null;

export const getPackageVersion = (): string => {
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as { version?: string };
    cachedVersion = packageJson.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }

  return cachedVersion;
};
