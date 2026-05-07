/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 15 promoted typedRoutes out of `experimental`; keep it disabled for
  // now until the route map stabilises (see TODOS/10 quality gates).
  typedRoutes: false,
  transpilePackages: [
    "@researchcrafters/ui",
    "@researchcrafters/db",
    "@researchcrafters/erp-schema",
    "@researchcrafters/content-sdk",
  ],
};

export default nextConfig;
