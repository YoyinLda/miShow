import { SectionHeader } from "./ui/SectionHeader";
import { EmptyPlaceholder } from "./ui/EmptyPlaceholder";

/**
 * Sección "Escena local" de la Home. Estructura fiel al Figma (encabezado +
 * grilla de cards) pero SIN datos ficticios: no existe hoy el dato de origen
 * (bandas chilenas/under, género confiable) para poblarla, así que se muestran
 * placeholders honestos "Próximamente".
 *
 * A futuro: esta sección debe mostrar SOLO bandas chilenas o under, lo que
 * requiere un dato de origen/escena que el catálogo aún no tiene. NO inventar
 * bandas aquí.
 */
export function LocalSceneSection() {
  return (
    <section id="escena-local" className="scroll-mt-20">
      <SectionHeader title="Escena local" subtitle="Tocatas, bandas emergentes y talento nacional." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EmptyPlaceholder />
        <EmptyPlaceholder />
        <EmptyPlaceholder />
      </div>
    </section>
  );
}
