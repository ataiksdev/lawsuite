import { logBootstrap } from "./logger";

// 30s was too tight in practice — antivirus real-time scanning of a
// freshly-installed python.exe (and the ~150MB of dependencies it loads)
// can legitimately take well over a minute on first launch. Confirmed via
// a real timeout: the backend was reported as failed, but was actually up
// and responding correctly just moments later — it was just slow, not
// broken. 120s comfortably covers that without masking a genuine hang.
export async function waitForHttpOk(url: string, timeoutMs = 120000, intervalMs = 500): Promise<void> {
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
