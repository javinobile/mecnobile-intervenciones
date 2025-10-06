import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
      allowedOrigins: ['*']
    }
  },
  eslint: {
    // Deshabilita el linting durante el build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Deshabilita la verificación de tipos durante el build
    ignoreBuildErrors: true,
  },
  output: 'standalone'
};

export default nextConfig;
