/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Skip type-checking during production build.
    // Types are still checked in the editor via tsconfig.json.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during production build.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
