import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = githubPages
  ? {
      output: 'export',
      basePath: '/phonics-word-workbench',
      assetPrefix: '/phonics-word-workbench',
      trailingSlash: true,
    }
  : {};

export default nextConfig;
