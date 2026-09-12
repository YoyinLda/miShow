import { createFetchTransport, PuntoTicketHttpClient } from "../puntoticket/acquisition/http.js";
import { acquisitionConfig, type AcquisitionConfig, PUNTOTICKET_ACQUISITION_DEFAULTS } from "../puntoticket/acquisition/policy.js";
import { scrapePuntoTicket } from "../puntoticket/acquisition/orchestrator.js";
import { createSupabaseRpcTransport, SupabaseEventPersistence, supabaseServerConfig } from "../puntoticket/persistence/supabase-data-api.js";
import { executePersistedPuntoTicketScrape, PersistedRunError } from "../puntoticket/persistence/workflow.js";

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
  console.log(`Uso: npm --silent run puntoticket:scrape -- --live [opciones]

Opciones:
  --listing-url <url>   Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.listingUrl}
  --max-events <n>      Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxEvents}, maximo ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxEventsLimit}
  --concurrency <n>     Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.concurrency}, maximo ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxConcurrency}
  --delay-ms <n>        Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.delayMs}, minimo ${PUNTOTICKET_ACQUISITION_DEFAULTS.minDelayMs}
  --timeout-ms <n>      Default: ${PUNTOTICKET_ACQUISITION_DEFAULTS.timeoutMs}, maximo ${PUNTOTICKET_ACQUISITION_DEFAULTS.maxTimeoutMs}
  --persist             Persiste mediante SUPABASE_URL y SUPABASE_SECRET_KEY`);
  process.exit(0);
}

run().catch((error) => {
  if (error instanceof PersistedRunError) {
    console.log(JSON.stringify({ run_id: error.runId, status: "failed" }, null, 2));
  }
  fail(safeMessage(error));
});

async function run(): Promise<void> {
  if (!args.includes("--live")) fail("Se requiere --live para habilitar adquisicion HTTP.");
  const config = parseConfig(args);
  const persist = args.includes("--persist");
  if (!persist) {
    const client = new PuntoTicketHttpClient({ config, transport: createFetchTransport() });
    const result = await scrapePuntoTicket({ config, client, now: () => new Date() });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const serverConfig = supabaseServerConfig(process.env);
  const persistence = new SupabaseEventPersistence(createSupabaseRpcTransport(serverConfig));
  const client = new PuntoTicketHttpClient({ config, transport: createFetchTransport() });
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
    scrape: () => scrapePuntoTicket({ config, client, now: () => new Date() }),
    now: () => new Date()
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

function parseConfig(values: string[]): AcquisitionConfig {
  const config: Partial<AcquisitionConfig> = {};
  for (let index = 0; index < values.length; index += 1) {
    const arg = values[index];
    if (arg === "--live" || arg === "--persist") continue;
    const next = values[index + 1];
    if (!next || next.startsWith("--")) fail(`Falta valor para ${arg}.`);
    if (arg === "--listing-url") config.listingUrl = next;
    else if (arg === "--max-events") config.maxEvents = integer(next, arg);
    else if (arg === "--concurrency") config.concurrency = integer(next, arg);
    else if (arg === "--delay-ms") config.delayMs = integer(next, arg);
    else if (arg === "--timeout-ms") config.timeoutMs = integer(next, arg);
    else fail(`Argumento no soportado: ${arg}.`);
    index += 1;
  }
  return acquisitionConfig(config);
}

function integer(value: string, name: string): number {
  if (!/^\d+$/.test(value)) fail(`${name} debe ser un entero no negativo.`);
  return Number(value);
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
