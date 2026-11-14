import type { AcquisitionStage } from "@mishow/scraper-core";
import { hasEncodedPathSeparator } from "@mishow/domain";

// Módulo compartido (adapter.ts y extraction/venue.ts) para evitar import circular.

export function isListingPath(pathname: string): boolean {
  return pathname === "/musica" || pathname === "/musica/";
}

/**
 * Listados de categorías no musicales que se leen solo para clasificar eventos
 * descubiertos por venue (brief 007). La política del core además exige que la
 * solicitud venga marcada como `categoryListing` y que la ruta esté declarada en
 * `discovery.categoryListings`.
 */
export const CATEGORY_LISTINGS = [
  { category: "deportes", url: "https://www.puntoticket.com/deportes" },
  { category: "teatro", url: "https://www.puntoticket.com/teatro" },
  { category: "familia", url: "https://www.puntoticket.com/familia" }
] as const;

export function isCategoryListingPath(pathname: string): boolean {
  return CATEGORY_LISTINGS.some((listing) => {
    const path = new URL(listing.url).pathname;
    return pathname === path || pathname === `${path}/`;
  });
}

export function isBlockedPath(pathname: string, stage: AcquisitionStage): boolean {
  const decodedPathname = decodedPath(pathname);
  if (/(?:^|\/)\.\.(?:\/|$)/.test(decodedPathname) || hasEncodedPathSeparator(pathname)) return true;
  if (stage === "listing" && (isListingPath(decodedPathname) || isCategoryListingPath(decodedPathname))) return false;
  return /^\/(?:musica|deportes|teatro|familia|todos|especiales|destacados|nuevos|account|cliente|queue|login|registro|carrito|checkout|purchase|payment|pago|confirmacion|cuenta|seleccion|tickets|compra|comprar|auth|authentication|categoria|confirma|envio|direccion|error|register|signin)(?:\/|$)/i.test(decodedPathname);
}

function decodedPath(pathname: string): string {
  let decoded = pathname;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return next;
      decoded = next;
    } catch {
      return pathname;
    }
  }
  return decoded;
}
