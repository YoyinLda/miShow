import { SectionHeader } from "./ui/SectionHeader";
import { EmptyPlaceholder } from "./ui/EmptyPlaceholder";

/**
 * Sección "Historias" de la Home. Estructura fiel al Figma (encabezado + cards)
 * pero SIN artículos inventados: el contenido editorial (reportajes, notas) es
 * una capa futura que no existe en el modelo de datos actual. Se muestran
 * placeholders honestos "Próximamente".
 *
 * A futuro: contenido editorial real (artículos, entrevistas). NO inventar
 * artículos aquí.
 */
export function StoriesSection() {
  return (
    <section id="historias" className="scroll-mt-20">
      <SectionHeader title="Historias" subtitle="Música, personas y cultura." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EmptyPlaceholder />
        <EmptyPlaceholder />
        <EmptyPlaceholder />
      </div>
    </section>
  );
}
