import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/:path*", has: [{ type: "host", value: "www.politik-kompass-schweiz.info" }], destination: "https://politik-kompass-schweiz.info/:path*", permanent: true }];
  },
};

export default nextConfig;
