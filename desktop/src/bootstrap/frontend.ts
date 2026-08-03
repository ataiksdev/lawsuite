import { spawn, ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { nodeExe, frontendServerJs, frontendCwd, logsDir } from "./paths";
import { ports } from "./ports";

let frontendProcess: ChildProcess | null = null;

export function startFrontend(): ChildProcess {
  const logStream = createWriteStream(path.join(logsDir, "frontend.log"), { flags: "a" });
  const child = spawn(nodeExe, [frontendServerJs], {
    cwd: frontendCwd,
    env: {
      ...process.env,
      PORT: String(ports.frontend),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
  });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  frontendProcess = child;
  return child;
}

export function stopFrontend(): Promise<void> {
  return new Promise((resolve) => {
    if (!frontendProcess || frontendProcess.exitCode !== null) {
      resolve();
      return;
    }
    frontendProcess.once("exit", () => resolve());
    frontendProcess.kill();
    setTimeout(resolve, 5000);
  });
}
