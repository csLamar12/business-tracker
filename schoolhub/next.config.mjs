/** @type {import('next').NextConfig} */
const nextConfig = {
  // School logos / hero images can come from anywhere a school admin pastes a URL.
  // Keep optimization off so any remote URL renders without remotePatterns config.
  images: { unoptimized: true },
  // No eslint config ships with the scaffold; don't block production builds on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
