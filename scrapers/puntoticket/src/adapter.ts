import type { AcquisitionStage, AcquisitionUrlContext, SecondaryIndexSource, SourceAdapter } from "@mishow/scraper-core";
import { hasUserinfo } from "@mishow/domain";
import { parseMusicListing } from "./extraction/listing.js";
import { extractDetail, parseEventDetail } from "./extraction/detail.js";
import { parseVenuePage } from "./extraction/venue.js";
import { CATEGORY_LISTINGS, isBlockedPath, isListingPath } from "./paths.js";

export { isBlockedPath };

const HOST = "www.puntoticket.com";
const PUNTOTICKET_QUEUE_PATH = /^\/queue\/enqueue\/[^/?#]+$/i;
const PUNTOTICKET_BUY_PATH = /^\/comprar\/evento\/[^/?#]+\/cal\/[^/?#]+$/i;

export interface PuntoticketAdapterOptions {
  /** Si se pasa, habilita el descubrimiento secundario (páginas de venue). */
  venueIndex?: VenueIndex;
}

/**
 * Índice de venues: `db-venues` expone `allowedPaths()`; `fixed-list` (respaldo)
 * expone `isSecondaryPagePath`. Se prefiere `allowedPaths()` si existe.
 */
export type VenueIndex = SecondaryIndexSource &
  (
    | { allowedPaths(): ReadonlySet<string>; isSecondaryPagePath?: (pathname: string) => boolean }
    | { allowedPaths?: undefined; isSecondaryPagePath(pathname: string): boolean }
  );

function isAllowedVenuePath(index: VenueIndex, pathname: string): boolean {
  if (isBlockedPath(pathname, "listing")) return false;
  if (typeof index.allowedPaths === "function") return index.allowedPaths().has(pathname);
  return index.isSecondaryPagePath(pathname);
}

const baseAdapter: SourceAdapter = {
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

export const puntoticketAdapter: SourceAdapter = baseAdapter;

/**
 * Sin `venueIndex` devuelve el adapter base (sin discovery). Con `venueIndex`
 * habilita descubrimiento secundario con allowlist exacta.
 */
export function createPuntoticketAdapter(opts?: PuntoticketAdapterOptions): SourceAdapter {
  const venueIndex = opts?.venueIndex;
  if (!venueIndex) return baseAdapter;
  return {
    ...baseAdapter,
    discovery: {
      id: "venues",
      isSecondaryPagePath: (pathname) => isAllowedVenuePath(venueIndex, pathname),
      index: venueIndex,
      parsePage: parseVenuePage,
      categoryListings: CATEGORY_LISTINGS
    }
  };
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
