import { PuntoTicketHttpClient, type HttpTransport, type Sleep } from "../acquisition/http.js";
import { scrapePuntoTicket } from "../acquisition/orchestrator.js";
import type { AcquisitionConfig } from "../acquisition/policy.js";
import { parseConfig, parseDiscovery, type ParseDiscoveryDeps } from "./scrape-args.js";

export interface ScrapeRunDeps {
  transport: HttpTransport;
  now: () => Date;
  sleep?: Sleep;
  /** Loader de `venue_sources` inyectable para tests (sin red). */
  venueSourcesLoader?: ParseDiscoveryDeps["venueSourcesLoader"];
}

/** Construye cliente y opciones de scrape a partir de los argumentos del CLI. */
export function buildScrape(args: string[], env: Record<string, string | undefined>, deps: ScrapeRunDeps) {
  const config: AcquisitionConfig = parseConfig(args);
  const { discovery, adapter, dbVenuesIndex } = parseDiscovery(args, env, deps.venueSourcesLoader ? { venueSourcesLoader: deps.venueSourcesLoader } : {});
  const client = new PuntoTicketHttpClient({
    config,
    transport: deps.transport,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(adapter ? { adapter } : {})
  });
  const scrape = () =>
    scrapePuntoTicket({ config, client, now: deps.now, ...(discovery ? { discovery, adapter } : {}) });
  return { config, scrape, dbVenuesIndex };
}
