import { Command } from "commander";

import {
  executeConfigureCommand
} from "./configure-tools.js";
import { startHttpServer } from "../http/server.js";
import { startMcpHttpServer, startMcpStdioServer } from "../mcp/runtime.js";
import { executeOpenClawCommand } from "../openclaw/cli.js";
import { executeServiceCommand } from "../service/cli.js";

export type CliExecutionDependencies = {
  startServer?: () => Promise<void>;
  startMcpStdio?: () => Promise<void>;
  startMcpHttp?: () => Promise<void>;
  runServiceCommand?: (argv: string[]) => Promise<number>;
  runOpenClawCommand?: (argv: string[]) => Promise<number>;
};

export const buildRootCli = (): Command => {
  const program = new Command();
  program.name("memolite");

  program.command("serve").description("Run memolite API server in foreground");
  const configure = program.command("configure").description("Run configure subcommands");
  configure.command("init").description("Initialize local MemLite data stores");
  configure.command("configure").description("Generate a runtime .env file");
  configure.command("sample-config").description("Write a sample MemLite environment file");
  configure.command("detect-sqlite-vec").description("Check whether sqlite-vec is available");
  configure.command("export").description("Export a MemLite snapshot to JSON");
  configure.command("import").description("Import a MemLite snapshot from JSON");
  configure.command("reconcile").description("Reconcile SQLite, vector, and graph mirror state");
  configure.command("repair").description("Repair vector and graph mirror state");
  configure.command("rebuild-vectors").description("Rebuild semantic and derivative vectors");
  configure.command("benchmark-search").description("Run a local search benchmark");
  configure.command("load-test").description("Run concurrent HTTP load against the memory API");
  const service = program.command("service").description("Manage memolite service");
  service.command("install").description("Install service definition");
  service.command("uninstall").description("Remove service definition");
  service.command("enable").description("Enable automatic service startup");
  service.command("disable").description("Disable automatic service startup");
  service.command("start").description("Start the managed service");
  service.command("stop").description("Stop the managed service");
  service.command("restart").description("Restart the managed service");
  service.command("status").description("Show managed service status");

  const mcp = program.command("mcp").description("Run MemLite MCP servers");
  mcp.command("stdio").description("Run MCP stdio server");
  mcp.command("http").description("Run MCP HTTP server");

  const openclaw = program.command("openclaw").description("Manage OpenClaw integration");
  openclaw.command("setup").description("One-shot OpenClaw and MemLite setup");
  openclaw.command("status").description("Check OpenClaw MemLite integration status");
  openclaw.command("doctor").description("Diagnose OpenClaw MemLite integration");
  openclaw.command("uninstall").description("Remove OpenClaw MemLite integration");
  const openclawConfigure = openclaw.command("configure").description("Show or update plugin config");
  openclawConfigure.command("show").description("Show current MemLite OpenClaw config");
  openclawConfigure.command("set").description("Set MemLite OpenClaw config fields");
  openclawConfigure.command("reset").description("Reset MemLite OpenClaw config fields");

  return program;
};

export const executeCli = async (
  argv: string[],
  dependencies: CliExecutionDependencies = {}
): Promise<number> => {
  const [command, subcommand, ...rest] = argv;

  if (command === "serve") {
    const startServer = dependencies.startServer ?? startHttpServer;
    await startServer();
    return 0;
  }

  if (command === "mcp") {
    if (subcommand === "stdio") {
      const startMcpStdio =
        dependencies.startMcpStdio ?? startMcpStdioServer;
      await startMcpStdio();
      return 0;
    }
    if (subcommand === "http") {
      const startMcpHttp =
        dependencies.startMcpHttp ?? startMcpHttpServer;
      await startMcpHttp();
      return 0;
    }
  }

  if (command === "service") {
    const action = subcommand;
    if (action !== undefined) {
      const runServiceCommand =
        dependencies.runServiceCommand ?? executeServiceCommand;
      return runServiceCommand(argv.slice(1));
    }
  }

  if (command === "openclaw") {
    const runOpenClawCommand =
      dependencies.runOpenClawCommand ?? executeOpenClawCommand;
    return runOpenClawCommand(argv.slice(1));
  }

  if (command === "configure") {
    return executeConfigureCommand(argv.slice(1));
  }

  return 1;
};
