import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  allowedDevOrigins: ['192.168.18.5', 'https://sphinxian-shu-untraveled.ngrok-free.dev'],
};

export default nextConfig;
