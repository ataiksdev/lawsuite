import { spawn, SpawnOptions } from "node:child_process";

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Non-blocking replacement for spawnSync. Bootstrap used to run entirely
// synchronously on Electron's main thread — back-to-back spawnSync calls
// with zero event-loop yields, on top of Windows Defender scanning each
// freshly-installed .exe on its first-ever execution, could keep the main
// process from pumping window messages long enough that Windows marked the
// app "Not Responding" even though it was working normally. Using spawn()
// and awaiting its exit event keeps the event loop free throughout.
export function runAsync(command: string, args: string[], options: SpawnOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
