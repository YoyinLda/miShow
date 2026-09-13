/**
 * Configuración de Next.js.
 *
 * MODO ACTUAL: export estático (SSG) para arranque a costo cero.
 *
 * MIGRACIÓN A HÍBRIDO (SSR/ISR) en el futuro:
 *   1. Eliminar `output: "export"`.
 *   2. Quitar `images.unoptimized` si se usa el optimizador de imágenes.
 *   3. Elegir un hosting con runtime Node (no solo estático).
 * La capa de datos (@mishow/catalog-client) NO cambia en esa migración: el
 * fetch del catálogo es idéntico en cliente, servidor o build.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true
  },
  transpilePackages: ["@mishow/catalog-client", "@mishow/domain"]
};

export default nextConfig;
