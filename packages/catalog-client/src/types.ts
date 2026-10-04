import type { EventStatus } from "@mishow/domain";

/**
 * Formas públicas del catálogo canónico (vistas `catalog_events_v2`,
 * `catalog_artists_v1`, `catalog_venues_v1`).
 *
 * Es la ÚNICA representación de datos que el frontend consume. Si en el futuro
 * se introduce una capa intermedia (Cloudflare Worker), debe respetar este mismo
 * contrato para no obligar a cambios en la UI.
 */
export interface CatalogArtistRef {
  name: string;
  slug?: string;
}

export interface CatalogVenueRef {
  slug?: string;
  name?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

export interface CatalogPerformance {
  starts_at: string;
  timezone: string;
  status: EventStatus;
  /** `false` = hora desconocida (mostrar solo fecha). Ausente/`true` = hora conocida. */
  time_known?: boolean;
  performance_code?: string;
  purchase_url?: string;
}

/**
 * Observación de un evento en una fuente concreta. El precio y la URL de compra
 * viven aquí (N por evento), no a nivel de fila: un mismo evento canónico puede
 * publicarse en varias ticketeras.
 */
export interface CatalogEventSource {
  source: string;
  source_url: string;
  purchase_url?: string;
  status: EventStatus;
  price_min?: number;
  price_max?: number;
  currency?: string;
}

/**
 * Frescura del catálogo por fuente (RPC `catalog_freshness_v1`, SECURITY
 * DEFINER; solo columnas no sensibles). Para el indicador "actualizado hace X".
 */
export interface CatalogFreshness {
  source: string;
  last_run_finished_at: string | null;
  last_run_status: string | null;
  discovered_count: number | null;
  succeeded_count: number | null;
}

/** Fila de `catalog_events_v2` — evento canónico independiente de la fuente. */
export interface CatalogEvent {
  id: number;
  slug: string;
  name: string;
  category: string;
  subcategory: string | null;
  status: EventStatus;
  image_url: string | null;
  needs_review: boolean;
  first_seen_at: string;
  last_seen_at: string;
  next_performance_at: string | null;
  /** Hora conocida de la próxima función: `false` = solo fecha; `null`/`true` = con hora. */
  next_performance_time_known: boolean | null;
  artists: CatalogArtistRef[];
  venue: CatalogVenueRef | null;
  sources: CatalogEventSource[];
  performances: CatalogPerformance[];
}

/** Evento compacto para las páginas de artista/venue. */
export interface CatalogEventBrief {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  status: EventStatus;
  next_at: string | null;
  venue_name?: string | null;
  venue_slug?: string | null;
  artists?: CatalogArtistRef[];
}

/** Fila de `catalog_artists_v1`. */
export interface CatalogArtist {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  country: string | null;
  genre: string | null;
  image_url: string | null;
  links: Record<string, string>;
  verified: boolean;
  events: CatalogEventBrief[];
}

/** Fila de `catalog_venues_v1`. */
export interface CatalogVenue {
  id: number;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  links: Record<string, string>;
  image_url: string | null;
  events: CatalogEventBrief[];
}
