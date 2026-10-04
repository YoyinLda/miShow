import type { CatalogEvent } from "@mishow/catalog-client";
import { formatDate, formatPrice, sourceLinks, statusLabel } from "../lib/format";

export function EventCard({ event }: { event: CatalogEvent }) {
  const price = formatPrice(event.sources);
  const nextDate = formatDate(event.next_performance_at, { timeKnown: event.next_performance_time_known ?? true });
  const artists = event.artists.map((artist) => artist.name).join(", ");
  const links = sourceLinks(event.sources);
  const primaryLink = links[0];

  return (
    <article className="relative flex gap-4 rounded-xl border border-border bg-surface p-4 transition-colors focus-within:border-brand hover:border-brand">
      {/* Enlace que cubre la card y navega al detalle interno por slug. */}
      <a
        href={`/evento?slug=${encodeURIComponent(event.slug)}`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-label={`Ver detalle de ${event.name}`}
      />

      {event.image_url ? (
        <img
          src={event.image_url}
          alt=""
          className="aspect-[3/4] w-20 shrink-0 rounded-lg object-cover sm:w-24"
          loading="lazy"
        />
      ) : (
        <div className="aspect-[3/4] w-20 shrink-0 rounded-lg bg-surface-2 sm:w-24" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate text-2xl font-semibold leading-tight">{event.name}</h2>
        {artists ? <p className="truncate text-base text-text-muted">{artists}</p> : null}
        {event.venue?.name ? (
          <p className="truncate text-base text-text-muted">
            {event.venue.name}
            {event.venue.city ? `, ${event.venue.city}` : ""}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {nextDate ? <span className="text-text-muted">{nextDate}</span> : null}
          <span className="rounded-full border border-border bg-surface-2 px-3 py-0.5 text-text-muted">
            {statusLabel(event.status)}
          </span>
          {price ? (
            <span className="rounded-full bg-accent px-3 py-0.5 font-semibold text-accent-contrast">{price}</span>
          ) : null}
        </div>
        {/* CTA externo hacia la ticketera. Va por encima del overlay (z-10) para
            ser clicable de forma independiente a la navegación al detalle. Si el
            evento tiene varias fuentes, el detalle muestra todas; en la card se
            ofrece un acceso directo a la primera. */}
        {primaryLink ? (
          <a
            href={primaryLink.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="relative z-10 mt-3 inline-flex min-h-9 items-center self-start rounded-[10px] bg-brand px-4 py-2 text-sm font-medium text-brand-contrast transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label={`${primaryLink.label} para ${event.name}`}
          >
            {links.length > 1 ? "Ver ticketeras" : primaryLink.label}
          </a>
        ) : null}
      </div>
    </article>
  );
}
