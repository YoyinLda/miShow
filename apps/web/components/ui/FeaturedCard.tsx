import type { CatalogEvent } from "@mishow/catalog-client";
import { formatDayMonth } from "../../lib/discovery";

/**
 * Card de evento destacado (Figma Home · Destacados).
 *
 * NOTA de dato: no existe un campo "destacado" real en el catálogo (ver
 * context.json data_reality). El destacado es un fallback por cercanía temporal
 * (selectFeatured). El badge "DESTACADO" es, por ahora, una etiqueta de la
 * sección; cuando exista un dato real de destacado se podrá condicionar con un
 * flag `isFeatured`.
 *
 * Variantes:
 * - "primary" (mobile y la primera de desktop): fondo featured + borde
 *   featured-border, badge amarillo, fecha, nombre a 2 líneas, venue y botón
 *   "Ver evento →".
 * - "mini" (las 2 secundarias de desktop): card sobria surface-event con fecha
 *   en brand, nombre y venue; sin badge ni botón. Toda la card enlaza al
 *   detalle.
 */
function venueLine(event: CatalogEvent): string | null {
  const name = event.venue?.name;
  if (!name) return null;
  return event.venue?.city ? `${name} · ${event.venue.city}` : name;
}

export function FeaturedCard({
  event,
  variant = "primary",
  showBadge = variant === "primary"
}: {
  event: CatalogEvent;
  variant?: "primary" | "mini";
  showBadge?: boolean;
}) {
  const date = formatDayMonth(event.next_performance_at, event.next_performance_time_known ?? true);
  const venue = venueLine(event);
  const href = `/evento?slug=${encodeURIComponent(event.slug)}`;

  if (variant === "mini") {
    return (
      <a
        href={href}
        className="group flex min-h-40 flex-col rounded-[14px] border border-border bg-surface-event p-5 transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {date ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {date.day} {date.month}
          </p>
        ) : null}
        <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-snug">{event.name}</h3>
        {venue ? <p className="mt-1 text-sm text-text-muted">{venue}</p> : null}
      </a>
    );
  }

  return (
    <article className="flex flex-col rounded-[14px] border border-featured-border bg-featured p-6">
      {showBadge ? (
        <span className="mb-3 inline-flex w-fit items-center rounded-full bg-accent px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-accent-contrast">
          Destacado
        </span>
      ) : null}
      {date ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {date.day} {date.month}
        </p>
      ) : null}
      <h3 className="mt-1 line-clamp-2 text-3xl font-bold leading-tight">{event.name}</h3>
      {venue ? <p className="mt-2 text-sm text-text-muted">{venue}</p> : null}
      <a
        href={href}
        className="mt-5 inline-flex w-fit min-h-10 items-center gap-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-contrast transition focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-label={`Ver evento ${event.name}`}
      >
        Ver evento <span aria-hidden="true">→</span>
      </a>
    </article>
  );
}
