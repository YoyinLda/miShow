import type { EventPerformance, EventStatus, NormalizedEvent } from "@mishow/domain";
import { allowedPurchaseUrl, canonicalSourceUrl } from "@mishow/domain";
import { PersistenceError, type ScrapeErrorInput, type StartRunInput } from "./contracts.js";

const STATUSES = new Set<EventStatus>(["available", "sold_out", "upcoming", "unknown"]);
const ISO_INSTANT = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-](\d\d):(\d\d))$/;
const SENSITIVE_KEY = String.raw`(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[a-z0-9]+[-_])*token)`;
const SENSITIVE_PREFIX = String.raw`(^|[\s{,;\[])`;
const QUOTED_SENSITIVE_ASSIGNMENT = new RegExp(
  String.raw`${SENSITIVE_PREFIX}(["']?)(${SENSITIVE_KEY})\2(\s*[:=]\s*)(["'])(?:\\.|(?!\5)[\s\S])*\5`,
  "giu"
);
const UNQUOTED_HEADER_ASSIGNMENT = /^([ \t]*)(authorization|proxy-authorization|cookie|set-cookie)[ \t]*[:=](?![ \t]*["'])[ \t]*[^\r\n]*/gimu;
const AUTHORIZATION_ASSIGNMENT = new RegExp(
  String.raw`${SENSITIVE_PREFIX}(["']?)(authorization|proxy-authorization)\2(\s*[:=](?!\s*["'])\s*)(?:(?:bearer|basic)\s+)?[^\s,;}]+`,
  "giu"
);
const COOKIE_ASSIGNMENT = new RegExp(
  String.raw`${SENSITIVE_PREFIX}(["']?)(cookie|set-cookie)\2(\s*[:=](?!\s*["'])\s*)[^\r\n,}]+`,
  "giu"
);
const TOKEN_ASSIGNMENT = new RegExp(
  String.raw`${SENSITIVE_PREFIX}(["']?)(api[-_]?key|(?:[a-z0-9]+[-_])*token)\2(\s*[:=](?!\s*["'])\s*)(?:bearer\s+)?[^\s,;}]+`,
  "giu"
);

export interface PersistedEventPayload {
  source: "puntoticket";
  source_url: string;
  extracted_at: string;
  name: string;
  status: EventStatus;
  source_code?: string;
  image_url?: string;
  purchase_url?: string;
  price?: { min?: number; max?: number; currency?: string };
  artists: Array<{ name: string; normalized_name: string; position: number }>;
  venue?: { name?: string; normalized_name?: string; address?: string; city?: string; latitude?: number; longitude?: number };
  performances: EventPerformance[];
}

export function mapEventForPersistence(event: NormalizedEvent): PersistedEventPayload {
  if (event.source !== "puntoticket") throw validationError("source no soportada.");
  if (canonicalSourceUrl(event.source_url) !== event.source_url) throw validationError("source_url debe estar canonica.");
  requireInstant(event.extracted_at, "extracted_at");
  requireNonEmpty(event.name, "name");
  requireStatus(event.status, "status");
  optionalHttpsUrl(event.image_url, "image_url");
  optionalPurchaseUrl(event.purchase_url, event.source_url, "purchase_url");

  const artists = event.artists.map((name, position) => {
    requireNonEmpty(name, `artists[${position}]`);
    return { name, normalized_name: normalizeSnapshotName(name), position };
  }).sort((left, right) => left.normalized_name.localeCompare(right.normalized_name));
  const artistNames = new Set<string>();
  for (const artist of artists) {
    if (artistNames.has(artist.normalized_name)) throw validationError("artists contiene nombres normalizados duplicados.");
    artistNames.add(artist.normalized_name);
  }

  const performances = event.performances.map((performance, index) => mapPerformance(performance, event.source_url, index))
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));
  const instants = new Set<number>();
  for (const performance of performances) {
    const instant = Date.parse(performance.starts_at);
    if (instants.has(instant)) throw validationError("performances contiene instantes duplicados.");
    instants.add(instant);
  }

  const venue = mapVenue(event.venue);
  const price = mapPrice(event.price);
  return {
    source: event.source,
    source_url: event.source_url,
    extracted_at: event.extracted_at,
    name: event.name,
    status: event.status,
    ...optionalText("source_code", event.source_code),
    ...optionalText("image_url", event.image_url),
    ...optionalText("purchase_url", event.purchase_url),
    ...(price ? { price } : {}),
    artists,
    ...(venue ? { venue } : {}),
    performances
  };
}

export function mapStartRun(input: StartRunInput): StartRunInput {
  if (input.source !== "puntoticket") throw validationError("source no soportada.");
  if (canonicalSourceUrl(input.listing_url, "listing_url") !== input.listing_url) throw validationError("listing_url debe estar canonica.");
  requireInstant(input.started_at, "started_at");
  if (!isPlainObject(input.parameters)) throw validationError("parameters debe ser un objeto.");
  return { ...input, parameters: sortObject(input.parameters) };
}

export function mapScrapeError(error: ScrapeErrorInput): ScrapeErrorInput {
  requireNonEmpty(error.stage, "error.stage");
  requireNonEmpty(error.code, "error.code");
  if (!Number.isInteger(error.attempts) || error.attempts < 1) throw validationError("error.attempts debe ser un entero positivo.");
  if (error.severity !== "warning" && error.severity !== "error") throw validationError("error.severity no es valida.");
  if (error.source_url !== undefined) canonicalSourceUrl(error.source_url, "error.source_url");
  return { ...error, message: sanitizePersistenceMessage(error.message) };
}

export function sanitizePersistenceMessage(value: unknown, secrets: string[] = []): string {
  let message = typeof value === "string" ? value : "Error de persistencia.";
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join("[REDACTED]");
  message = message
    .replace(/\b(https?:\/\/)[^/@\s?#]+@/giu, "$1[REDACTED]@")
    .replace(QUOTED_SENSITIVE_ASSIGNMENT, "$1$2$3$2$4$5[REDACTED]$5")
    .replace(UNQUOTED_HEADER_ASSIGNMENT, "$1$2=[REDACTED]")
    .replace(AUTHORIZATION_ASSIGNMENT, "$1$2$3$2$4[REDACTED]")
    .replace(COOKIE_ASSIGNMENT, "$1$2$3$2$4[REDACTED]")
    .replace(TOKEN_ASSIGNMENT, "$1$2$3$2$4[REDACTED]")
    .replace(/\bbearer[ \t]+[A-Za-z0-9._~+/-]+=*/giu, "Bearer [REDACTED]")
    .replace(/\b(?:bearer\s+)?sb_secret_[A-Za-z0-9._-]+/giu, "[REDACTED]")
    .replace(/\s+/gu, " ")
    .trim();
  return (message || "Error de persistencia.").slice(0, 2000);
}

export function normalizeSnapshotName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("es-CL");
}

function mapPerformance(performance: EventPerformance, sourceUrl: string, index: number): EventPerformance {
  requireInstant(performance.starts_at, `performances[${index}].starts_at`);
  requireNonEmpty(performance.timezone, `performances[${index}].timezone`);
  if (performance.timezone !== "America/Santiago") throw validationError(`performances[${index}].timezone no es soportada.`);
  requireStatus(performance.status, `performances[${index}].status`);
  optionalPurchaseUrl(performance.purchase_url, sourceUrl, `performances[${index}].purchase_url`);
  return {
    starts_at: performance.starts_at,
    timezone: performance.timezone,
    status: performance.status,
    ...optionalText("performance_code", performance.performance_code),
    ...optionalText("purchase_url", performance.purchase_url)
  };
}

function mapVenue(venue: NormalizedEvent["venue"]): PersistedEventPayload["venue"] {
  if (!venue) return undefined;
  const result = {
    ...optionalText("name", venue.name),
    ...(venue.name?.trim() ? { normalized_name: normalizeSnapshotName(venue.name) } : {}),
    ...optionalText("address", venue.address),
    ...optionalText("city", venue.city),
    ...(venue.latitude !== undefined ? { latitude: finiteRange(venue.latitude, -90, 90, "venue.latitude") } : {}),
    ...(venue.longitude !== undefined ? { longitude: finiteRange(venue.longitude, -180, 180, "venue.longitude") } : {})
  };
  return Object.keys(result).length ? result : undefined;
}

function mapPrice(price: NormalizedEvent["price"]): PersistedEventPayload["price"] {
  if (!price) return undefined;
  const min = price.min === undefined ? undefined : nonNegative(price.min, "price.min");
  const max = price.max === undefined ? undefined : nonNegative(price.max, "price.max");
  if (min !== undefined && max !== undefined && min > max) throw validationError("price.min no puede superar price.max.");
  if (price.currency !== undefined && !/^[A-Z]{3}$/.test(price.currency)) throw validationError("price.currency debe ser ISO-4217 en mayusculas.");
  const result = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...optionalText("currency", price.currency) };
  return Object.keys(result).length ? result : undefined;
}

function requireInstant(value: string, label: string): void {
  const match = typeof value === "string" ? value.match(ISO_INSTANT) : null;
  if (!match || Number.isNaN(Date.parse(value))) throw validationError(`${label} debe ser un timestamp ISO-8601 con zona.`);
  const [, year, month, day, hour, minute, second, offsetHour = "00", offsetMinute = "00"] = match;
  const days = [31, leap(Number(year)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  if (!days || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(offsetHour) > 23 || Number(offsetMinute) > 59) {
    throw validationError(`${label} debe ser un timestamp ISO-8601 con zona.`);
  }
}

function requireStatus(value: EventStatus, label: string): void {
  if (!STATUSES.has(value)) throw validationError(`${label} no es valido.`);
}

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") throw validationError(`${label} es obligatorio.`);
}

function optionalHttpsUrl(value: string | undefined, label: string): void {
  if (value === undefined) return;
  try {
    if (new URL(value).protocol !== "https:") throw new Error();
  } catch {
    throw validationError(`${label} debe ser HTTPS.`);
  }
}

function optionalPurchaseUrl(value: string | undefined, sourceUrl: string, label: string): void {
  if (value !== undefined && allowedPurchaseUrl(value, sourceUrl) !== value) throw validationError(`${label} no es una URL de compra permitida.`);
}

function optionalText<Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> {
  return typeof value === "string" && value.trim() ? { [key]: value } as Record<Key, string> : {};
}

function finiteRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw validationError(`${label} esta fuera de rango.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw validationError(`${label} debe ser no negativo.`);
  return value;
}

function leap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validationError(message: string): PersistenceError {
  return new PersistenceError("validation_error", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
