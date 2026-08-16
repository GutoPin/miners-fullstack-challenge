import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
  // Servidor autocontenido para la imagen de Docker. Vercel no lo usa, pero tenerlo activo
  // no le estorba y evita que el Dockerfile dependa de una configuración distinta.
  output: 'standalone',
};

export default nextConfig;
