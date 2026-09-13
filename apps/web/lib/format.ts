import type { CatalogEvent } from "@mishow/catalog-client";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function formatPrice(event: Pick<CatalogEvent, "price_min" | "price_max" | "currency">): string | undefined {
  const { price_min, price_max, currency } = event;
  if (price_min == null && price_max == null) return undefined;
  const format = (value: number) => (currency === "CLP" || !currency ? CLP.format(value) : `${value} ${currency}`);
  if (price_min != null && price_max != null && price_min !== price_max) {
    return `${format(price_min)} – ${format(price_max)}`;
  }
  return format(price_min ?? price_max ?? 0);
}

const DATE = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function formatDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return DATE.format(date);
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
