/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.ts', '.mjs'],
    };
    config.externals = [...(config.externals || []), 'better-sqlite3'];
    return config;
  },
};

module.exports = nextConfig;

