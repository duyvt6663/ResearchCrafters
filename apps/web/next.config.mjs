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
    "@researchcrafters/worker",
  ],
  // Workspace packages compile under NodeNext, which mandates .js extensions
  // on relative imports. Webpack (via Next) doesn't resolve those out of the
  // box for transpiled-from-source packages — alias .js to .ts/.tsx so the
  // worker's `import './redis.js'` resolves to `./redis.ts` at bundle time.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
