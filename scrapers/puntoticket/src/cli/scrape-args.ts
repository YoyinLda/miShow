import {
  createSupabaseTableSelectTransport,
  createVenueSourcesLoader,
  resolveDiscoveryLimits,
  supabaseServerConfig,
  type DiscoveryOptions,
  type SourceAdapter
} from "@mishow/scraper-core";
import { acquisitionConfig, PUNTOTICKET_ACQUISITION_DEFAULTS, type AcquisitionConfig } from "../acquisition/policy.js";
import { createPuntoticketAdapter } from "../adapter.js";
import { createDbVenuesIndex, DEFAULT_NOT_FOUND_RETRY_DAYS, type DbVenuesIndex, type VenueSourcesLoader } from "../discovery/db-venues.js";
import { createFixedListSource } from "../discovery/fixed-list.js";

/** Error de uso del CLI (argumentos inválidos). */
export class CliUsageError extends Error {}

export function parseInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new CliUsageError(`${name} debe ser un entero no negativo.`);
  return Number(value);
}

export function parseConfig(values: string[]): AcquisitionConfig {
  const config: Partial<AcquisitionConfig> = {};
  for (let index = 0; index < values.length; index += 1) {
    const arg = values[index];
    if (arg === "--live" || arg === "--persist" || arg === "--venue-discovery") continue;
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new CliUsageError(`Falta valor para ${arg}.`);
    if (arg === "--max-venue-pages" || arg === "--venue-url") {
      index += 1;
      continue;
    }
    if (arg === "--listing-url") config.listingUrl = next;
    else if (arg === "--max-events") config.maxEvents = parseInteger(next, arg);
    else if (arg === "--concurrency") config.concurrency = parseInteger(next, arg);
    else if (arg === "--delay-ms") config.delayMs = parseInteger(next, arg);
    else if (arg === "--timeout-ms") config.timeoutMs = parseInteger(next, arg);
    else throw new CliUsageError(`Argumento no soportado: ${arg}.`);
    index += 1;
  }
  return acquisitionConfig(config);
}

export interface ParseDiscoveryDeps {
  /** Loader de `venue_sources` inyectable (tests sin red). Si falta, se usa Supabase (SUPABASE_URL/SUPABASE_SECRET_KEY). */
  venueSourcesLoader?: VenueSourcesLoader;
}

/** Habilita con el flag o `PUNTOTICKET_VENUE_DISCOVERY=true`; ausente/`false` deshabilita; otro valor es error de uso. */
export function resolveVenueDiscoveryEnabled(env: Record<string, string | undefined>, flag: boolean): boolean {
  const raw = env.PUNTOTICKET_VENUE_DISCOVERY;
  if (raw !== undefined && raw !== "true" && raw !== "false") {
    throw new CliUsageError("PUNTOTICKET_VENUE_DISCOVERY debe ser 'true' o 'false'.");
  }
  return flag || raw === "true";
}

function defaultVenueSourcesLoader(env: Record<string, string | undefined>): VenueSourcesLoader {
  let config: ReturnType<typeof supabaseServerConfig>;
  try {
    config = supabaseServerConfig(env);
  } catch {
    throw new CliUsageError(
      "El descubrimiento por venue (db-venues) requiere SUPABASE_URL y SUPABASE_SECRET_KEY validas, o una lista fija con --venue-url / PUNTOTICKET_VENUE_URLS."
    );
  }
  return createVenueSourcesLoader(createSupabaseTableSelectTransport(config)) as VenueSourcesLoader;
}

export function parseDiscovery(
  values: string[],
  env: Record<string, string | undefined>,
  deps: ParseDiscoveryDeps = {}
): { discovery?: DiscoveryOptions; adapter?: SourceAdapter; dbVenuesIndex?: DbVenuesIndex } {
  if (!resolveVenueDiscoveryEnabled(env, values.includes("--venue-discovery"))) return {};
  let limits: ReturnType<typeof resolveDiscoveryLimits>;
  try {
    limits = resolveDiscoveryLimits(env, PUNTOTICKET_ACQUISITION_DEFAULTS);
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
  let { maxPages } = limits;
  const { maxPagesLimit } = limits;
  const urls: string[] = (env.PUNTOTICKET_VENUE_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--max-venue-pages") {
      const value = parseInteger(values[index + 1] ?? "", "--max-venue-pages");
      if (value < 1 || value > maxPagesLimit) {
        throw new CliUsageError(`--max-venue-pages debe estar entre 1 y ${maxPagesLimit}.`);
      }
      maxPages = value;
    } else if (values[index] === "--venue-url") {
      urls.push(values[index + 1]);
    }
  }
  // La lista fija prevalece como respaldo; si no hay, db-venues por defecto.
  const dbVenuesIndex =
    urls.length > 0
      ? undefined
      : createDbVenuesIndex(deps.venueSourcesLoader ?? defaultVenueSourcesLoader(env), {
          notFoundRetryDays: resolveNotFoundRetryDays(env)
        });
  const venueIndex = dbVenuesIndex ?? createFixedListSource(urls);
  return {
    discovery: { enabled: true, maxPages, maxPagesLimit },
    adapter: createPuntoticketAdapter({ venueIndex }),
    ...(dbVenuesIndex ? { dbVenuesIndex } : {})
  };
}

/** `PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS`: entero >= 0; default 30. */
export function resolveNotFoundRetryDays(env: Record<string, string | undefined>): number {
  const raw = env.PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_NOT_FOUND_RETRY_DAYS;
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(Number(raw.trim()))) {
    throw new CliUsageError("PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS debe ser un entero no negativo.");
  }
  return Number(raw.trim());
}
