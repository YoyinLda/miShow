import type { ReactNode } from "react";

/**
 * Encabezado de sección (Figma Home 3:2 / 3:123): título SemiBold 600 (22 en
 * mobile, 24 desde `lg`) y, opcionalmente, una descripción o conteo gris 14 a
 * su lado (gap 12). Como en el Figma mobile, la descripción solo se muestra
 * desde `lg`.
 */
export function SectionHeader({
  title,
  subtitle
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline gap-3 lg:mb-5">
      <h2 className="text-[1.375rem] font-semibold tracking-tight lg:text-2xl">{title}</h2>
      {subtitle ? <p className="hidden text-sm text-text-muted lg:block">{subtitle}</p> : null}
    </div>
  );
}
