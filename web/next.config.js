/** @type {import('next').NextConfig} */

// URL de Cloud Run del backend Go (sin barra final). Se lee en tiempo de BUILD:
// con output "standalone" las rewrites quedan fijadas en la imagen, así que
// en Docker se pasa como --build-arg BACKEND_URL=https://...run.app
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,

  // Proxy same-origin: el navegador solo ve el dominio del frontend, de modo que
  // las cookies refresh_token y csrf_token (SameSite=Strict) se envían con cada petición.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
