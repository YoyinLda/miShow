import type { EventStatus } from "@mishow/domain";

/**
 * Forma pública de una fila de la vista `catalog_events_v1`.
 *
 * Esta es la ÚNICA representación de datos que el frontend consume. Si en el
 * futuro se introduce una capa intermedia (Cloudflare Worker), debe respetar
 * este mismo contrato para no obligar a cambios en la UI.
 */
export interface CatalogArtist {
  name: string;
}

export interface CatalogVenue {
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
  performance_code?: string;
  purchase_url?: string;
}

export interface CatalogEvent {
  id: number;
  source: string;
  source_url: string;
  source_code: string | null;
  purchase_url: string | null;
  image_url: string | null;
  name: string;
  status: EventStatus;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  source_extracted_at: string;
  first_seen_at: string;
  last_seen_at: string;
  next_performance_at: string | null;
  artists: CatalogArtist[];
  venue: CatalogVenue | null;
  performances: CatalogPerformance[];
}
