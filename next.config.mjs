/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["mongoose", "bcryptjs", "xlsx"]
  }
};

export default nextConfig;
