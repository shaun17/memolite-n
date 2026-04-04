import { describe, expect, it } from "vitest";

import { buildRootCli } from "../../src/cli/root-cli.js";

describe("root cli contract", () => {
  it("keeps a unified memolite command", () => {
    const program = buildRootCli();

    expect(program.name()).toBe("memolite");
  });

  it("exposes core subcommands under the unified command", () => {
    const program = buildRootCli();
    const commandNames = program.commands.map((command: { name(): string }) => command.name());

    expect(commandNames).toEqual(
      expect.arrayContaining(["serve", "configure", "service", "mcp", "openclaw"])
    );
  });

  it("exposes stdio and http under memolite mcp", () => {
    const program = buildRootCli();
    const mcpCommand = program.commands.find(
      (command: { name(): string }) => command.name() === "mcp"
    );

    expect(mcpCommand).toBeDefined();
    expect(mcpCommand?.commands.map((command: { name(): string }) => command.name())).toEqual(
      expect.arrayContaining(["stdio", "http"])
    );
  });

  it("exposes the full configure tool surface under memolite configure", () => {
    const program = buildRootCli();
    const configureCommand = program.commands.find(
      (command: { name(): string }) => command.name() === "configure"
    );

    expect(configureCommand).toBeDefined();
    expect(
      configureCommand?.commands.map((command: { name(): string }) => command.name())
    ).toEqual(
      expect.arrayContaining([
        "init",
        "configure",
        "sample-config",
        "detect-sqlite-vec",
        "export",
        "import",
        "reconcile",
        "repair",
        "rebuild-vectors",
        "benchmark-search",
        "load-test"
      ])
    );
  });

  it("exposes openclaw workflow subcommands under memolite openclaw", () => {
    const program = buildRootCli();
    const openclawCommand = program.commands.find(
      (command: { name(): string }) => command.name() === "openclaw"
    );

    expect(openclawCommand).toBeDefined();
    expect(
      openclawCommand?.commands.map((command: { name(): string }) => command.name())
    ).toEqual(expect.arrayContaining(["setup", "status", "doctor", "uninstall", "configure"]));

    const configureCommand = openclawCommand?.commands.find(
      (command: { name(): string }) => command.name() === "configure"
    );

    expect(
      configureCommand?.commands.map((command: { name(): string }) => command.name())
    ).toEqual(expect.arrayContaining(["show", "set", "reset"]));
  });

  it("exposes service lifecycle subcommands under memolite service", () => {
    const program = buildRootCli();
    const serviceCommand = program.commands.find(
      (command: { name(): string }) => command.name() === "service"
    );

    expect(serviceCommand).toBeDefined();
    expect(
      serviceCommand?.commands.map((command: { name(): string }) => command.name())
    ).toEqual(
      expect.arrayContaining([
        "install",
        "uninstall",
        "enable",
        "disable",
        "start",
        "stop",
        "restart",
        "status"
      ])
    );
  });
});
