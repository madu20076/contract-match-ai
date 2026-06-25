import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling these Node.js-only packages
  serverExternalPackages: ['pdf-parse', 'mammoth'],
};

export default nextConfig;
