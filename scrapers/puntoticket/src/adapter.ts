import type { AcquisitionStage, AcquisitionUrlContext, SourceAdapter } from "@mishow/scraper-core";
import { hasEncodedPathSeparator, hasUserinfo } from "@mishow/domain";
import { parseMusicListing } from "./extraction/listing.js";
import { extractDetail, parseEventDetail } from "./extraction/detail.js";

const HOST = "www.puntoticket.com";
const PUNTOTICKET_QUEUE_PATH = /^\/queue\/enqueue\/[^/?#]+$/i;
const PUNTOTICKET_BUY_PATH = /^\/comprar\/evento\/[^/?#]+\/cal\/[^/?#]+$/i;

export const puntoticketAdapter: SourceAdapter = {
  source: "puntoticket",
  name: "PuntoTicket",
  baseUrl: "https://www.puntoticket.com",
  host: HOST,
  listingUrl: "https://www.puntoticket.com/musica",
  purchasePathPatterns: [PUNTOTICKET_QUEUE_PATH, PUNTOTICKET_BUY_PATH],

  isListingPath(pathname: string): boolean {
    return isListingPath(pathname);
  },

  isDetailPath(pathname: string, context: AcquisitionUrlContext): boolean {
    return isAllowedDetailUrl(pathname, context);
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
  return pathname === "/musica" || pathname === "/musica/";
}

// La política de detalle acepta rutas canónicas /evento/<slug> y root-landings
// (/<slug>) descubiertas en el listado, verificando que la URL descubierta
// coincida con la solicitada y sea también un root-landing.
function isAllowedDetailUrl(pathname: string, context: AcquisitionUrlContext): boolean {
  if (isCanonicalDetailPath(pathname)) return true;
  if (!isRootLandingPath(pathname) || !context.discoveredDetailUrl) return false;
  try {
    const discovered = new URL(context.discoveredDetailUrl);
    if (discovered.protocol !== "https:") return false;
    if (discovered.hostname !== HOST) return false;
    if (discovered.username || discovered.password || hasUserinfo(context.discoveredDetailUrl)) return false;
    if (discovered.port && discovered.port !== "443") return false;
    if (isBlockedPath(discovered.pathname, "detail")) return false;
    discovered.search = "";
    discovered.hash = "";
    return discovered.pathname.replace(/\/+$/, "") === pathname.replace(/\/+$/, "") && isRootLandingPath(discovered.pathname);
  } catch {
    return false;
  }
}

function isCanonicalDetailPath(pathname: string): boolean {
  return /^\/evento\/[A-Za-z0-9-]+\/?$/i.test(pathname);
}

function isRootLandingPath(pathname: string): boolean {
  return /^\/[A-Za-z0-9-]+\/?$/.test(pathname);
}

function isBlockedPath(pathname: string, stage: AcquisitionStage): boolean {
  const decodedPathname = decodedPath(pathname);
  if (/(?:^|\/)\.\.(?:\/|$)/.test(decodedPathname) || hasEncodedPathSeparator(pathname)) return true;
  if (stage === "listing" && isListingPath(decodedPathname)) return false;
  return /^\/(?:musica|deportes|teatro|familia|todos|especiales|destacados|nuevos|account|cliente|queue|login|registro|carrito|checkout|purchase|payment|pago|confirmacion|cuenta|seleccion|tickets|compra|comprar|auth|authentication)(?:\/|$)/i.test(decodedPathname);
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
