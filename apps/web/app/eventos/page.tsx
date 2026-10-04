import { EventList } from "../../components/EventList";

/**
 * Catálogo completo (Figma Catálogo Mobile 10:332 / Desktop 10:175).
 *
 * Layout del frame: título "Explora eventos" + subtítulo + buscador + chips de
 * rango + encabezado "Todos los eventos" + la lista completa con scroll
 * infinito. El buscador, los chips y el encabezado "Todos los eventos" viven
 * dentro de EventList (es client y es el dueño del estado de ?q= y ?rango=);
 * EventList ya envuelve su contenido en <Suspense> alrededor de useSearchParams.
 *
 * Subtítulo HONESTO: el Figma rotula "Datos de ejemplo" / "Encuentra tu próximo
 * concierto" como placeholder de diseño. Aquí mostramos datos reales del
 * catálogo, así que el subtítulo no debe decir "Datos de ejemplo".
 */
export default function EventosPage() {
  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Explora eventos</h1>
        <p className="text-sm text-text-muted sm:text-base">Conciertos, tocatas, festivales y más en Chile.</p>
      </div>

      <EventList />
    </div>
  );
}
