import type { CatalogEvent } from "@mishow/catalog-client";
import { formatDayMonth } from "../../lib/discovery";
import { formatPrice } from "../../lib/format";

/**
 * Fila de evento (Figma EventRow 2:9; Home 3:2 / 3:123 y Catálogo). Toda la
 * fila enlaza al detalle interno (/evento?slug=).
 *
 * - Fecha compacta "12 / DIC" (22 Bold / 11 SemiBold), respeta time_known=false.
 * - Imagen: 48×56 en mobile, 72×52 desde `lg`; placeholder event-image si no hay.
 * - Nombre SemiBold 16 (hasta 2 líneas en mobile, 1 en desktop) + venue 13.
 * - Precio "Desde $…": en mobile bajo el venue, en desktop antes de la flecha.
 *   (El Figma mobile lo oculta; se muestra por decisión de la entrega 2.)
 * - Flecha → en color brand.
 */
function venueLine(event: CatalogEvent): string | null {
  const name = event.venue?.name;
  if (!name) return null;
  return event.venue?.city ? `${name} · ${event.venue.city}` : name;
}

export function EventRow({ event }: { event: CatalogEvent }) {
  const date = formatDayMonth(event.next_performance_at, event.next_performance_time_known ?? true);
  const venue = venueLine(event);
  const price = formatPrice(event.sources);
  const href = `/evento?slug=${encodeURIComponent(event.slug)}`;

  return (
    <a
      href={href}
      className="group flex min-h-[108px] items-center gap-3 rounded-[10px] border border-border bg-surface-event px-4 py-3 transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:min-h-[88px] lg:gap-5"
      aria-label={`Ver detalle de ${event.name}`}
    >
      {date ? (
        <div className="flex min-w-7 shrink-0 flex-col items-start">
          <span className="text-[1.375rem] font-bold leading-tight">{date.day}</span>
          <span className="text-[0.6875rem] font-semibold uppercase text-text-muted">{date.month}</span>
        </div>
      ) : (
        <div className="min-w-7 shrink-0" aria-hidden="true" />
      )}

      {event.image_url ? (
        <img
          src={event.image_url}
          alt=""
          className="h-14 w-12 shrink-0 rounded-lg object-cover lg:h-[52px] lg:w-[72px]"
          loading="lazy"
        />
      ) : (
        <div className="h-14 w-12 shrink-0 rounded-lg bg-event-image lg:h-[52px] lg:w-[72px]" aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 font-semibold leading-snug lg:truncate">{event.name}</p>
        {venue ? <p className="truncate text-[0.8125rem] text-text-muted">{venue}</p> : null}
        {price ? <p className="text-[0.8125rem] font-medium text-text lg:hidden">Desde {price}</p> : null}
      </div>

      {price ? (
        <span className="hidden shrink-0 text-sm font-medium text-text lg:inline">Desde {price}</span>
      ) : null}

      <span aria-hidden="true" className="shrink-0 text-[1.375rem] leading-none text-brand">
        →
      </span>
    </a>
  );
}
