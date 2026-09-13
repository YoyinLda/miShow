import type { AcquisitionStage, SourceAdapter } from "@mishow/scraper-core";
import { hasEncodedPathSeparator } from "@mishow/domain";
import { parseMusicListing } from "./extraction/listing.js";
import { extractDetail, parseEventDetail } from "./extraction/detail.js";

const HOST = "www.ticketmaster.cl";

export const ticketmasterAdapter: SourceAdapter = {
  source: "ticketmaster",
  name: "Ticketmaster",
  baseUrl: "https://www.ticketmaster.cl",
  host: HOST,
  listingUrl: "https://www.ticketmaster.cl/page/musica",
  // No se siguen URLs de compra: la compra vive detrás de la landing del evento.
  purchasePathPatterns: [],

  isListingPath(pathname: string): boolean {
    return isListingPath(pathname);
  },

  isDetailPath(pathname: string): boolean {
    return /^\/event\/[A-Za-z0-9._~-]+\/?$/i.test(pathname);
  },

  isBlockedPath(pathname: string, stage: AcquisitionStage): boolean {
    return isBlockedPath(pathname, stage);
  },

  parseListing(html: string, baseUrl: string) {
    return parseMusicListing(html, baseUrl);
  },

  parseDetail(html: string, sourceUrl: string) {
    return parseEventDetail(html, sourceUrl);
  },

  extractDetail(detail) {
    return extractDetail(detail);
  }
};

function isListingPath(pathname: string): boolean {
  return pathname === "/page/musica" || pathname === "/page/musica/";
}

function isBlockedPath(pathname: string, stage: AcquisitionStage): boolean {
  const decodedPathname = decodedPath(pathname);
  if (/(?:^|\/)\.\.(?:\/|$)/.test(decodedPathname) || hasEncodedPathSeparator(pathname)) return true;
  if (stage === "listing" && isListingPath(decodedPathname)) return false;
  return /^\/(?:page|account|login|register|registro|cart|carrito|checkout|purchase|payment|pago|cuenta|auth|api|search|buscar|tickets|comprar|queue)(?:\/|$)/i.test(decodedPathname);
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
