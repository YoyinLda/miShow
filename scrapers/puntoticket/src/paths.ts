import type { AcquisitionStage } from "@mishow/scraper-core";
import { hasEncodedPathSeparator } from "@mishow/domain";

// Módulo compartido (adapter.ts y extraction/venue.ts) para evitar import circular.

export function isListingPath(pathname: string): boolean {
  return pathname === "/musica" || pathname === "/musica/";
}

export function isBlockedPath(pathname: string, stage: AcquisitionStage): boolean {
  const decodedPathname = decodedPath(pathname);
  if (/(?:^|\/)\.\.(?:\/|$)/.test(decodedPathname) || hasEncodedPathSeparator(pathname)) return true;
  if (stage === "listing" && isListingPath(decodedPathname)) return false;
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
