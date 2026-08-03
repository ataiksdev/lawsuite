import { logBootstrap } from "./logger";

export async function waitForHttpOk(url: string, timeoutMs = 30000, intervalMs = 500): Promise<void> {
  logBootstrap(`health: waiting for ${url}`);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        logBootstrap(`health: ${url} is responding`);
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${url} to respond (last error: ${String(lastError)})`);
}
