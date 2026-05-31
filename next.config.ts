import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "dev-tutribu.app"],
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: "imagedelivery.net",
        pathname: "/**",
        port: "",
        protocol: "https",
        search: "",
      },
    ],
  },
};

export default nextConfig;
