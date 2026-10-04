import type { ReactNode } from "react";

/**
 * Encabezado de sección del rediseño (Figma Home): título en negrita y, de
 * forma opcional, un subtítulo gris a su lado (desktop) o debajo (mobile). El
 * subtítulo es contenido editorial opcional; cuando no se pasa, solo se
 * renderiza el título.
 */
export function SectionHeader({
  title,
  subtitle
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:items-baseline">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {subtitle ? <p className="text-sm text-text-muted">{subtitle}</p> : null}
    </div>
  );
}
