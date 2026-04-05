import { homedir } from "node:os";
import { join } from "node:path";

export const SERVICE_LABEL = "ai.memolite-n.server";

export type ServiceRenderInput = {
  label: string;
  memoliteBin: string;
  nodeBin?: string;
  host: string;
  port: number;
  sqlitePath: string;
  kuzuPath: string;
  outLog: string;
  errLog: string;
  execPath?: string;
};

export type ServicePaths = {
  label: string;
  logDir: string;
  outLog: string;
  errLog: string;
  plistPath: string;
  unitPath: string;
};

export const createServicePaths = (
  input: { homeDir?: string; xdgConfigHome?: string } = {}
): ServicePaths => {
  const homeDir = input.homeDir ?? homedir();
  const xdgConfigHome = input.xdgConfigHome ?? join(homeDir, ".config");
  const label = SERVICE_LABEL;
  const logDir = "/tmp/memolite";

  return {
    label,
    logDir,
    outLog: join(logDir, "memolite.out.log"),
    errLog: join(logDir, "memolite.err.log"),
    plistPath: join(homeDir, "Library", "LaunchAgents", `${label}.plist`),
    unitPath: join(xdgConfigHome, "systemd", "user", `${label}.service`)
  };
};

export const renderLaunchAgentPlist = ({
  label,
  memoliteBin,
  nodeBin,
  host,
  port,
  sqlitePath,
  kuzuPath,
  outLog,
  errLog,
  execPath
}: ServiceRenderInput): string => {
  // When nodeBin is provided, bypass shebang by calling node directly.
  // macOS launchd EnvironmentVariables PATH is not visible to /usr/bin/env
  // when resolving shebang interpreters, causing "env: node: No such file".
  const programArgs = nodeBin
    ? `    <string>${nodeBin}</string>\n    <string>${memoliteBin}</string>`
    : `    <string>${memoliteBin}</string>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
    <string>serve</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${execPath ?? "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"}</string>
    <key>MEMOLITE_HOST</key>
    <string>${host}</string>
    <key>MEMOLITE_PORT</key>
    <string>${port}</string>
    <key>MEMOLITE_SQLITE_PATH</key>
    <string>${sqlitePath}</string>
    <key>MEMOLITE_KUZU_PATH</key>
    <string>${kuzuPath}</string>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${outLog}</string>
  <key>StandardErrorPath</key>
  <string>${errLog}</string>
</dict>
</plist>
`;
};

export const renderSystemdUserUnit = ({
  memoliteBin,
  host,
  port,
  sqlitePath,
  kuzuPath,
  outLog,
  errLog
}: ServiceRenderInput): string => `[Unit]
Description=memoLite server
After=network.target

[Service]
Type=simple
ExecStart=${memoliteBin} serve
Restart=always
RestartSec=2
Environment=MEMOLITE_HOST=${host}
Environment=MEMOLITE_PORT=${port}
Environment=MEMOLITE_SQLITE_PATH=${sqlitePath}
Environment=MEMOLITE_KUZU_PATH=${kuzuPath}
StandardOutput=append:${outLog}
StandardError=append:${errLog}

[Install]
WantedBy=default.target
`;
