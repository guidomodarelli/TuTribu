import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "dev-tutribu.com"],
  cacheComponents: true,
};

export default nextConfig;
