import type { CatalogEventSource } from "@mishow/catalog-client";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

/**
 * Precio combinado a partir de las fuentes de un evento canónico: mínimo de
 * todos los `price_min` y máximo de todos los `price_max`. Devuelve `undefined`
 * cuando ninguna fuente expone precio (no se inventan valores).
 */
export function formatPrice(sources: readonly CatalogEventSource[] | null | undefined): string | undefined {
  if (!sources || sources.length === 0) return undefined;
  const mins = sources.map((s) => s.price_min).filter((v): v is number => typeof v === "number");
  const maxs = sources.map((s) => s.price_max).filter((v): v is number => typeof v === "number");
  if (mins.length === 0 && maxs.length === 0) return undefined;
  const currency = sources.map((s) => s.currency).find((c): c is string => Boolean(c));
  const format = (value: number) => (currency === "CLP" || !currency ? CLP.format(value) : `${value} ${currency}`);
  const min = mins.length ? Math.min(...mins) : undefined;
  const max = maxs.length ? Math.max(...maxs) : undefined;
  if (min != null && max != null && min !== max) return `${format(min)} – ${format(max)}`;
  return format(min ?? max ?? 0);
}

const SOURCE_LABEL: Record<string, string> = {
  puntoticket: "PuntoTicket",
  ticketmaster: "Ticketmaster"
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

/**
 * Enlaces a la(s) ticketera(s) de un evento. Cada fuente aporta su
 * `source_url`. Si hay una sola fuente, el texto es genérico ("Ir a la
 * ticketera"); con varias, se nombra cada una ("Ir a PuntoTicket", …).
 */
export function sourceLinks(sources: readonly CatalogEventSource[] | null | undefined): Array<{ url: string; label: string }> {
  if (!sources || sources.length === 0) return [];
  const withUrl = sources.filter((s) => Boolean(s.source_url));
  if (withUrl.length === 1) return [{ url: withUrl[0].source_url, label: "Ir a la ticketera" }];
  return withUrl.map((s) => ({ url: s.source_url, label: `Ir a ${sourceLabel(s.source)}` }));
}

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const DATE_ONLY = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric"
});

/**
 * Formatea un instante ISO en `America/Santiago`. Cuando `options.timeKnown` es
 * `false` (hora desconocida), devuelve solo la fecha (sin hora ni leyenda): la
 * fecha nunca cambia de día por la zona. Por defecto (`undefined`/`true`)
 * muestra fecha + hora, de modo que una medianoche real (`time_known=true`)
 * exhibe `00:00`.
 */
export function formatDate(iso: string | null | undefined, options?: { timeKnown?: boolean }): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return (options?.timeKnown === false ? DATE_ONLY : DATE_TIME).format(date);
}

const STATUS_LABEL: Record<string, string> = {
  available: "Disponible",
  sold_out: "Agotado",
  upcoming: "Próximamente",
  unknown: "Confirmado"
};

/**
 * Etiqueta de estado a nivel evento. Por defecto asumimos que el evento está
 * confirmado (`unknown`), a menos que la fuente indique disponibilidad,
 * agotamiento o próxima venta.
 */
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? STATUS_LABEL.unknown;
}

/**
 * Etiqueta de estado a nivel función. Cuando no tenemos información de
 * disponibilidad (`unknown`) devolvemos `undefined` para que la UI omita la
 * etiqueta y muestre solo la fecha/hora, en vez de mostrar un estado dudoso.
 */
export function performanceStatusLabel(status: string): string | undefined {
  if (status === "unknown") return undefined;
  return STATUS_LABEL[status];
}

/**
 * Texto de frescura del catálogo, tipo "actualizado hace 3 h".
 *
 * `iso` es el instante técnico (UTC) de término de la última corrida. Devuelve
 * un texto relativo para instantes recientes (< ~7 días) y cae a una fecha
 * absoluta en `America/Santiago` para instantes más antiguos o cuando el
 * relativo perdería precisión. Devuelve `undefined` si el instante es inválido
 * o futuro (reloj desfasado): en ese caso la UI simplemente no muestra el
 * indicador. `now` es inyectable para pruebas deterministas.
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return undefined;

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return undefined;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "actualizado hace instantes";
  if (minutes < 60) return `actualizado hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `actualizado hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `actualizado hace ${days} ${days === 1 ? "día" : "días"}`;

  const absolute = formatDate(iso);
  return absolute ? `actualizado el ${absolute}` : undefined;
}
