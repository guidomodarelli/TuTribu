import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
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

initOpenNextCloudflareForDev();

export default nextConfig;
