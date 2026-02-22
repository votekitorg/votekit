/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/plebiscite',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3');
    }
    return config;
  }
};

module.exports = nextConfig;