# Anexo de diseño — SourceAdapter (Brief 001)

Contrato acordado para el split core + adaptadores. Documento de referencia para
la implementación; se ajustará si la ejecución revela un detalle mejor.

## Estructura de paquetes (D1=a)

```
scrapers/
  core/                     @mishow/scraper-core   (motor genérico + SourceAdapter)
    src/
      acquisition/{http.ts, orchestrator.ts, policy.ts}
      persistence/{contracts.ts, mapping.ts, supabase-data-api.ts, workflow.ts}
      extraction/jsonld.ts  (parser JSON-LD schema.org/Event común)
      normalization.ts
      adapter.ts            (interfaz SourceAdapter)
      index.ts
  puntoticket/              @mishow/scraper-puntoticket  (adapter + CLI)
    src/adapter.ts, src/extraction/{listing.ts, detail.ts}, src/cli/*
  ticketmaster/             @mishow/scraper-ticketmaster (adapter + CLI)
    src/adapter.ts, src/extraction/{listing.ts, detail.ts}, src/cli/*
```

## Interfaz SourceAdapter

```ts
export interface SourceAdapter {
  readonly source: string;          // "puntoticket" | "ticketmaster"
  readonly name: string;            // "PuntoTicket" | "Ticketmaster"
  readonly baseUrl: string;         // https://www.puntoticket.com
  readonly host: string;            // www.puntoticket.com
  readonly listingUrl: string;      // https://www.puntoticket.com/musica
  readonly purchasePathPatterns: RegExp[];   // rutas de compra por fuente

  // Validación de rutas específica de la fuente (listing/detail).
  isListingPath(pathname: string): boolean;
  isDetailPath(pathname: string, context: { discoveredDetailUrl?: string }): boolean;
  isBlockedPath(pathname: string, stage: "listing" | "detail"): boolean;

  // Extracción propia de la fuente.
  parseListing(html: string, baseUrl: string): RawEventReference[];
  parseDetail(html: string, sourceUrl: string): ExtractionResult<RawEventDetail>;
}
```

- El núcleo (`acquisitionConfig`, `validateAcquisitionUrl`, `scrape`, `normalizeEvent`,
  `mapEventForPersistence`) recibe el `SourceAdapter` y delega host/rutas/parseo.
- `canonicalSourceUrl`/`allowedPurchaseUrl` de `@mishow/domain` se llaman con
  `{ host, purchasePathPatterns }` del adapter.
- `normalizeEvent` toma `source` del adapter (ya no literal "puntoticket").
- Persistencia: `mapEventForPersistence`/`mapStartRun` validan `source` no vacío
  y `source_url` canónica con el host del adapter (guardas dejan de comparar con
  "puntoticket").

## Migración de datos

Nueva migración aditiva: `start_scrape_run` toma `name` y `base_url` del payload
(`p_input->>'source_name'`, `p_input->>'source_base_url'`) con fallback a los
valores actuales de PuntoTicket, en vez del literal fijo. Reversible.

## Compatibilidad

- PuntoTicket conserva su comportamiento y sus tests. El adapter de PuntoTicket
  reusa el `parseMusicListing`/`parseEventDetail`/`extractDetail` actuales.
- Ticketmaster: listado `div.grid_element > a[href*="/event/"]` con rutas
  relativas `../event/<slug>`; detalle vía parser JSON-LD común + fecha desde
  `description`; estado con regla "Confirmado por defecto".
