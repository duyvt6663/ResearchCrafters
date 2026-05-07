/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@researchcrafters/ui",
    "@researchcrafters/db",
    "@researchcrafters/erp-schema",
    "@researchcrafters/content-sdk",
  ],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
