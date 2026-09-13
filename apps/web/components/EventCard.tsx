import type { CatalogEvent } from "@mishow/catalog-client";
import { formatDate, formatPrice, statusLabel } from "../lib/format";

export function EventCard({ event }: { event: CatalogEvent }) {
  const price = formatPrice(event);
  const nextDate = formatDate(event.next_performance_at);
  const artists = event.artists.map((artist) => artist.name).join(", ");

  return (
    <a
      href={`/evento?id=${event.id}`}
      className="flex gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
    >
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
      </div>
    </a>
  );
}
