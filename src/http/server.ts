import { createHttpApp } from "./app.js";
import { getSettings } from "../common/config/runtime-settings.js";

export const startHttpServer = async (): Promise<void> => {
  const settings = getSettings();
  const app = createHttpApp();
  await app.listen({
    host: settings.host,
    port: settings.port
  });
};
