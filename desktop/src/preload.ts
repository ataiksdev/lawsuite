// Intentionally minimal — the renderer just loads a normal HTTP page from
// the bundled Next.js server. Auth is plain JWTs in localStorage sent as
// Authorization headers (frontend/src/lib/api-client.ts), not cookies or
// anything requiring main<->renderer IPC, so there's nothing to bridge here.
