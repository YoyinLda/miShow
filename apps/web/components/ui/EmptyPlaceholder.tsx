import type { ReactNode } from "react";

/**
 * Estado honesto para secciones sin datos reales (Escena local, Historias). No
 * inventa contenido: muestra un título opcional y una etiqueta sobria
 * ("Próximamente" por defecto) dentro de una card con el tratamiento del Figma
 * (fondo surface-event + borde). Pensado como relleno estructural fiel al
 * diseño mientras no exista el dato de origen.
 */
export function EmptyPlaceholder({
  title,
  label = "Próximamente"
}: {
  title?: ReactNode;
  label?: ReactNode;
}) {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-xl border border-border bg-surface-event p-4">
      {title ? <p className="text-sm font-semibold text-text">{title}</p> : null}
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}
