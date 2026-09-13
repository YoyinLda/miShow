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
  unknown: "Por confirmar"
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? STATUS_LABEL.unknown;
}
