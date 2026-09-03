import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    localPatterns: [
      { pathname: '/uploads/**' },
      { pathname: '/covers/**' },
      { pathname: '/brand/**' },
      { pathname: '/icons/**' },
      { pathname: '/media/**' },
    ],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Avoid hard 400s on odd query strings / newly uploaded files
    minimumCacheTTL: 60,
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      { source: '/about', destination: '/p/about', permanent: true },
      // Live catalogs (programs) — CMS intros redirect to them
      { source: '/p/grants', destination: '/grants', permanent: true },
      { source: '/p/dobro', destination: '/dobro', permanent: true },
      { source: '/p/self-gov', destination: '/self-gov', permanent: true },
      // /documents is the file library + viewer (not CMS)
      { source: '/p/documents', destination: '/documents', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Align with nginx: allow same-origin camera for scanner + avatar capture
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          ],
      },
    ];
  },
};

export default nextConfig;
