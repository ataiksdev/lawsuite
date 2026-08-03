import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  allowedDevOrigins: ['192.168.18.5', 'https://sphinxian-shu-untraveled.ngrok-free.dev'],
  // Without this, Next.js infers the workspace root by walking up for the
  // nearest lockfile — an unrelated package-lock.json in the user's home
  // directory gets picked up, which makes `output: "standalone"` nest
  // server.js many directories deep instead of at .next/standalone/server.js.
  // Pinning it here keeps the build deterministic regardless of what else
  // happens to sit above this repo on disk.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
