import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@wolleen/core', '@wolleen/db'],
  serverExternalPackages: ['@electric-sql/pglite'],
  images: { unoptimized: true },
};

export default nextConfig;
