import type { CatalogEvent } from "@mishow/catalog-client";
import { formatDate, formatPrice, sourceLinks, statusLabel } from "../lib/format";

export function EventCard({ event }: { event: CatalogEvent }) {
  const price = formatPrice(event.sources);
  const nextDate = formatDate(event.next_performance_at);
  const artists = event.artists.map((artist) => artist.name).join(", ");
  const links = sourceLinks(event.sources);
  const primaryLink = links[0];

  return (
    <article className="relative flex gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition focus-within:border-neutral-400 hover:border-neutral-400">
      {/* Enlace que cubre la card y navega al detalle interno por slug. */}
      <a
        href={`/evento?slug=${encodeURIComponent(event.slug)}`}
        className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
        aria-label={`Ver detalle de ${event.name}`}
      />

      {event.image_url ? (
        <img
          src={event.image_url}
          alt=""
          className="h-24 w-20 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-24 w-20 shrink-0 rounded bg-neutral-100" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold">{event.name}</h2>
        {artists ? <p className="truncate text-sm text-neutral-600">{artists}</p> : null}
        {event.venue?.name ? (
          <p className="truncate text-sm text-neutral-500">
            {event.venue.name}
            {event.venue.city ? `, ${event.venue.city}` : ""}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {nextDate ? <span className="text-neutral-500">{nextDate}</span> : null}
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
            {statusLabel(event.status)}
          </span>
          {price ? <span className="font-medium text-neutral-800">{price}</span> : null}
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
            className="relative z-10 mt-3 inline-flex min-h-9 items-center rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
            aria-label={`${primaryLink.label} para ${event.name}`}
          >
            {links.length > 1 ? "Ver ticketeras" : primaryLink.label}
          </a>
        ) : null}
      </div>
    </article>
  );
}
