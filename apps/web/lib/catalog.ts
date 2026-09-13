import { CatalogClient } from "@mishow/catalog-client";

/**
 * Construye el cliente de catálogo desde variables públicas del frontend.
 *
 * Solo se usan claves de LECTURA (publishable) que pueden llegar al navegador.
 * Nunca leer aquí SUPABASE_SECRET_KEY ni tokens privados.
 *
 * Variables (ver apps/web/.env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 */
export function catalogClient(): CatalogClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return new CatalogClient({ url, publishableKey });
}

export function catalogConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
