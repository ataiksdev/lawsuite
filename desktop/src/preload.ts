// Bridges the renderer (the bundled Next.js frontend, loaded as a plain
// HTTP page — see main.ts's loadURL) to the sync IPC handlers registered in
// main.ts. Auth is otherwise plain JWTs in localStorage sent as
// Authorization headers (frontend/src/lib/api-client.ts); sync is the one
// feature that needs main<->renderer IPC, since cloud credentials and
// encryption must stay in the main process, not the renderer.
import { contextBridge, ipcRenderer } from "electron";

const ACCESS_TOKEN_KEY = "lawsuite_access_token";

function getLocalAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

contextBridge.exposeInMainWorld("desktopSync", {
  getStatus: () => ipcRenderer.invoke("sync:get-status"),

  connect: (cloudUrl: string, email: string, password: string) =>
    ipcRenderer.invoke("sync:connect", cloudUrl, email, password),

  disconnect: () => ipcRenderer.invoke("sync:disconnect"),

  syncNow: (options?: { forceThroughConflicts?: boolean }) => {
    const accessToken = getLocalAccessToken();
    if (!accessToken) {
      return Promise.resolve({ status: "error", message: "Not logged in." });
    }
    return ipcRenderer.invoke("sync:now", accessToken, options ?? {});
  },

  // Called from frontend/src/lib/auth-store.ts right after a successful
  // login. Reads the just-stored access token itself (localStorage is
  // available to preload scripts even under contextIsolation) so the
  // caller only needs to pass the user's role.
  notifyLoggedIn: (role: string) => {
    const accessToken = getLocalAccessToken();
    if (!accessToken) return;
    ipcRenderer.send("sync:notify-logged-in", role, accessToken);
  },
});
