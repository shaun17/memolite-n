#!/usr/bin/env node

import { executeCli } from "../dist/cli/root-cli.js";

const exitCode = await executeCli(process.argv.slice(2));
if (exitCode !== 0) {
  process.exitCode = exitCode;
}
