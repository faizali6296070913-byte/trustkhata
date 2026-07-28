/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa", "google-auth-library"],
  experimental: {
    turbo: false,
  },
};

export default nextConfig;