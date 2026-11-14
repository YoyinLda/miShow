import { EventList } from "../../components/EventList";

/**
 * Catálogo completo (Figma Catálogo Mobile 10:332 / Desktop 10:175).
 *
 * Layout: título "Explora eventos" (34 / 48 Bold) + subtítulo (15 / 18) y, en
 * EventList, buscador (solo mobile; en desktop vive en el header), chips de
 * rango (+ Filtros en desktop), encabezado "Todos los eventos" con conteo y la
 * lista con scroll infinito.
 *
 * El Figma rotula "Datos de ejemplo" como placeholder de diseño; aquí hay
 * datos reales, así que no se muestra.
 */
export default function EventosPage() {
  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      <div className="flex flex-col gap-5 lg:gap-7">
        <h1 className="text-[2.125rem] font-bold leading-tight tracking-tight lg:text-5xl">Explora eventos</h1>
        <p className="text-[0.9375rem] text-text-muted lg:text-lg">Encuentra tu próximo concierto.</p>
      </div>

      <EventList />
    </div>
  );
}
