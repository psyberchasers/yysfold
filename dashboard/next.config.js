/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.ts', '.mjs'],
    },
  },
};

module.exports = nextConfig;

