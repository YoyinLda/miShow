import type { CatalogEvent, CatalogEventSource } from "@mishow/catalog-client";

/**
 * Helpers puros de descubrimiento del rediseño (Etapa 4). Sin DOM ni estado:
 * son funciones testeables que alimentan los chips de filtro por fecha, la
 * selección de destacados y los bloques de fecha "12 DIC".
 *
 * Zona del negocio: America/Santiago. Para los cálculos de "hoy" (inicio y fin
 * del día local) se obtiene el desfase horario de Santiago para el instante
 * dado y se construyen los extremos del día. Para "semana"/"mes" basta con
 * sumar días al instante actual (no dependen del límite de día local).
 */

const SANTIAGO_TZ = "America/Santiago";

/** Rango de fecha inclusivo listo para `CatalogClient.listEvents({ range })`. */
export interface DateRange {
  gteISO: string;
  lteISO: string;
}

/** Tipos de chip de filtro reconocidos en el querystring `?rango=`. */
export type RangoKind = "hoy" | "semana" | "mes" | "gratis";

/**
 * Devuelve, para una fecha dada en Santiago, las partes de año/mes/día como
 * números. Usa `Intl` con la zona explícita para no depender de la zona del
 * runtime (Lambda/CI corren en UTC).
 */
function santiagoYMD(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Desfase de Santiago (en minutos respecto de UTC) para un instante dado.
 * Positivo al oeste de UTC (Santiago suele ser -03:00 => +180). Se calcula
 * comparando la "hora de pared" en Santiago contra la hora UTC del mismo
 * instante, de modo que respeta automáticamente el horario de verano.
 */
function santiagoOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Instante "como si la hora de pared de Santiago fuese UTC".
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Construye el ISO (UTC, con `Z`) del instante local de Santiago indicado. */
function santiagoLocalToISO(
  ymd: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  second: number,
  ms: number,
  offsetMinutes: number
): string {
  // `offsetMinutes` = (hora de pared como-UTC) - (UTC real) para un instante
  // dado. Para Santiago en verano vale -180. Invirtiendo: UTC = local - offset,
  // es decir 00:00 local -> +03:00 UTC.
  const utcMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute, second, ms) - offsetMinutes * 60000;
  return new Date(utcMs).toISOString();
}

/**
 * Rango de fecha para los chips de filtro, calculado en America/Santiago:
 * - `hoy`:    desde 00:00:00.000 hasta 23:59:59.999 del día local de `now`.
 * - `semana`: desde `now` hasta `now + 7 días`.
 * - `mes`:    desde `now` hasta `now + 30 días`.
 *
 * `now` es inyectable para pruebas deterministas.
 */
export function dateRange(kind: "hoy" | "semana" | "mes", now: Date = new Date()): DateRange {
  if (kind === "hoy") {
    const ymd = santiagoYMD(now);
    const offset = santiagoOffsetMinutes(now);
    return {
      gteISO: santiagoLocalToISO(ymd, 0, 0, 0, 0, offset),
      lteISO: santiagoLocalToISO(ymd, 23, 59, 59, 999, offset)
    };
  }
  const days = kind === "semana" ? 7 : 30;
  return {
    gteISO: now.toISOString(),
    lteISO: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  };
}

/**
 * Normaliza el valor del querystring `?rango=` a un tipo conocido. Devuelve
 * `null` para valores ausentes o no reconocidos (la UI muestra entonces el
 * listado sin filtro).
 */
export function parseRango(value: string | null): RangoKind | null {
  switch (value) {
    case "hoy":
    case "semana":
    case "mes":
    case "gratis":
      return value;
    default:
      return null;
  }
}

/**
 * Selecciona hasta `n` eventos "destacados". No existe un campo `destacado`
 * real en el catálogo: el fallback es por cercanía temporal. Ordena por
 * `next_performance_at` ascendente dejando los nulos al final y recorta a `n`.
 * No muta el arreglo recibido.
 */
export function selectFeatured(events: readonly CatalogEvent[], n: number): CatalogEvent[] {
  if (n <= 0) return [];
  const sorted = [...events].sort((a, b) => {
    const av = a.next_performance_at;
    const bv = b.next_performance_at;
    if (av === null && bv === null) return 0;
    if (av === null) return 1; // nulos al final
    if (bv === null) return -1;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return sorted.slice(0, n);
}

/**
 * Indica si un evento es gratuito: alguna de sus fuentes expone
 * `price_min === 0`. Un precio ausente (`undefined`) NO cuenta como gratis (no
 * inventamos datos). Pensado como base del futuro distintivo "Gratis".
 */
export function isFree(sources: readonly CatalogEventSource[] | null | undefined): boolean {
  if (!sources || sources.length === 0) return false;
  return sources.some((s) => s.price_min === 0);
}

const DAY_MONTH = new Intl.DateTimeFormat("es-CL", {
  timeZone: SANTIAGO_TZ,
  day: "numeric",
  month: "short"
});

/**
 * Parte de fecha para el bloque "12 DIC" del diseño: día numérico y mes
 * abreviado en mayúsculas, en America/Santiago. Respeta `timeKnown === false`
 * sin introducir hora (de todos modos este helper nunca formatea hora). El mes
 * se devuelve sin punto final (p. ej. "DIC", no "DIC.").
 */
export function formatDayMonth(
  iso: string | null | undefined,
  timeKnown?: boolean
): { day: string; month: string } | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  // `timeKnown` se acepta por consistencia de contrato con formatDate; aquí la
  // salida es solo día/mes, nunca hora, así que no altera el resultado.
  void timeKnown;
  const parts = DAY_MONTH.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const monthRaw = parts.find((p) => p.type === "month")?.value ?? "";
  const month = monthRaw.replace(/\.$/u, "").toUpperCase();
  return { day, month };
}
