import type { NextConfig } from "next";
import { initializeOpenNextCloudflareForDev } from "./config/cloudflare-dev-runtime";
import { cloudflareOutputFileTracingIncludes } from "./config/cloudflare-output-tracing";
import { getLegacyRedirects } from "./config/legacy-redirects";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "dev-tutribu.app"],
  cacheComponents: true,
  outputFileTracingIncludes: cloudflareOutputFileTracingIncludes,
  redirects: getLegacyRedirects,
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

void initializeOpenNextCloudflareForDev();

export default nextConfig;
