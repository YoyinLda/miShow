import type { CatalogEvent } from "@mishow/catalog-client";
import { formatDayMonth } from "../../lib/discovery";
import { formatPrice } from "../../lib/format";

/**
 * Fila de evento del listado (Figma Home · Próximos conciertos y Catálogo).
 * Conserva la semántica de EventCard: toda la fila enlaza al detalle interno
 * (/evento?slug=). Composición fiel al Figma:
 * - bloque de fecha compacto "12 / DIC" (formatDayMonth, respeta
 *   time_known=false sin introducir hora);
 * - miniatura cuadrada: image_url si existe, si no un placeholder event-image;
 * - nombre + venue (venue · ciudad);
 * - en desktop (sm+) precio "Desde $…" (formatPrice) antes de la flecha;
 * - flecha → en color brand.
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
      className="group flex items-center gap-4 rounded-xl border border-border bg-surface-event p-4 transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      aria-label={`Ver detalle de ${event.name}`}
    >
      {date ? (
        <div className="flex w-10 shrink-0 flex-col items-center leading-none">
          <span className="text-xl font-bold">{date.day}</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            {date.month}
          </span>
        </div>
      ) : (
        <div className="w-10 shrink-0" aria-hidden="true" />
      )}

      {event.image_url ? (
        <img
          src={event.image_url}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-event-image" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{event.name}</p>
        {venue ? <p className="truncate text-sm text-text-muted">{venue}</p> : null}
      </div>

      {price ? <span className="hidden shrink-0 text-sm text-text-muted sm:inline">Desde {price}</span> : null}

      <span aria-hidden="true" className="shrink-0 text-lg text-brand">
        →
      </span>
    </a>
  );
}
