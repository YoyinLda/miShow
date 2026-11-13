import { createFetchTransport } from "../acquisition/http.js";
import { PUNTOTICKET_ACQUISITION_DEFAULTS } from "../acquisition/policy.js";
import { createSupabaseRpcTransport, recordVenueSourceChecks, SupabaseEventPersistence, supabaseServerConfig } from "../persistence/supabase-data-api.js";
import { executePersistedPuntoTicketScrape, PersistedRunError } from "../persistence/workflow.js";
import { CliUsageError } from "./scrape-args.js";
import { buildScrape } from "./scrape-run.js";

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
  console.log(`Uso: npm --silent run puntoticket:scrape -- --live [opciones]

Opciones:
  --listing-url <url>   Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.listingUrl}
  --max-events <n>      Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxEvents} (env MAX_EVENTS), maximo ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxEventsLimit} (env MAX_EVENTS_LIMIT)
  --concurrency <n>     Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.concurrency}, maximo ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxConcurrency}
  --delay-ms <n>        Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.delayMs}, minimo ${PUNTOTICKET_ACQUISITION_DEFAULTS.minDelayMs}
  --timeout-ms <n>      Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.timeoutMs}, maximo ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxTimeoutMs}
  --persist             Persiste mediante SUPABASE_URL y SUPABASE_SECRET_KEY
  --venue-discovery     Descubre eventos en paginas de venue (o PUNTOTICKET_VENUE_DISCOVERY=true). Default: desactivado
  --max-venue-pages <n> Paginas de venue maximas (env PUNTOTICKET_MAX_VENUE_PAGES, default MAX_EVENTS), tope PUNTOTICKET_MAX_VENUE_PAGES_LIMIT (default MAX_EVENTS_LIMIT)
  --venue-url <url>     Venue fijo, repetible (o PUNTOTICKET_VENUE_URLS separado por comas); prevalece sobre db-venues

Los limites MAX_EVENTS y MAX_EVENTS_LIMIT se leen del entorno; el flag CLI, si se
entrega, tiene prioridad sobre el valor del entorno.

Con el descubrimiento habilitado y sin lista fija, los venues se leen de la tabla
venue_sources (db-venues) y requieren SUPABASE_URL y SUPABASE_SECRET_KEY.`);
  process.exit(0);
}

run().catch((error) => {
  if (error instanceof PersistedRunError) {
    console.log(JSON.stringify({ run_id: error.runId, status: "failed" }, null, 2));
  }
  fail(error instanceof CliUsageError ? error.message : safeMessage(error));
});

async function run(): Promise<void> {
  if (!args.includes("--live")) fail("Se requiere --live para habilitar adquisicion HTTP.");
  const persist = args.includes("--persist");
  const { config, scrape, dbVenuesIndex } = buildScrape(args, process.env, { transport: createFetchTransport(), now: () => new Date() });
  if (!persist) {
    const result = await scrape();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const serverConfig = supabaseServerConfig(process.env);
  const rpc = createSupabaseRpcTransport(serverConfig);
  const persistence = new SupabaseEventPersistence(rpc);
  const result = await executePersistedPuntoTicketScrape({
    persistence,
    start: {
      source: "puntoticket",
      listing_url: config.listingUrl,
      started_at: new Date().toISOString(),
      parameters: {
        concurrency: config.concurrency,
        delay_ms: config.delayMs,
        max_events: config.maxEvents,
        timeout_ms: config.timeoutMs
      }
    },
    scrape,
    now: () => new Date()
  });
  if (dbVenuesIndex) {
    try {
      await recordVenueSourceChecks("puntoticket", dbVenuesIndex.pendingChecks(), rpc);
    } catch (error) {
      console.error(`Advertencia: no se registraron verificaciones de venue_sources: ${sanitize(safeMessage(error))}`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

function fail(message: string): never {
  console.error(`Error: ${sanitize(message)}`);
  process.exitCode = 1;
  process.exit(1);
}

function safeMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message.split("\n")[0] : "Error de adquisicion.";
}

function sanitize(value: string): string {
  return value.replace(/https?:\/\/[^@\s]+:[^@\s]+@/g, "https://").replace(/[{}<>]/g, "").trim();
}
