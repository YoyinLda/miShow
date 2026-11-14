/**
 * Logo horizontal miShow / Bloque, exportado del Figma
 * ("02 Components" → Brand / Logo Horizontal, Theme=Dark 13:50 y Theme=Light
 * 13:93; mismas formas, solo cambian los colores).
 *
 * SVG en línea en vez de <img> para que los colores sigan el tema activo con
 * los tokens --logo-mi (violeta "mi") y --logo-show (texto "Show"), definidos
 * en globals.css para claro y oscuro. Las proporciones son las del vector
 * original (376 × 74.702): solo se fija la altura y el ancho se deriva del
 * viewBox. No redibujar ni editar los paths: si cambia el logo, re-exportar
 * desde Figma.
 */
type LogoProps = {
  className?: string;
  /** Nombre accesible. Vacío => decorativo (aria-hidden). */
  title?: string;
};

export function Logo({ className, title = "miShow" }: LogoProps) {
  const decorative = title === "";
  return (
    <svg
      viewBox="0 0 376 74.702"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      {/* "mi" */}
      <path
        fill="var(--logo-mi)"
        d="M0 20.5431H21.1656V22.4106L24.5894 20.5431H33.9272C38.6998 20.5431 42.3311 21.3731 44.8212 23.0331C48.3488 21.3731 52.4989 20.5431 57.2715 20.5431H69.4106C78.1258 20.5431 82.4834 25.0044 82.4834 33.9272V74.0795H61.0066V42.6424C61.0066 40.7748 60.1766 39.8411 58.5166 39.8411H54.7815C52.9139 39.8411 51.9801 40.7748 51.9801 42.6424V74.0795H30.8146V42.6424C30.8146 40.7748 29.9845 39.8411 28.3245 39.8411H21.1656V74.0795H0V20.5431ZM87.1523 21.1656H108.007V74.0795H87.1523V21.1656Z"
      />
      <path
        fill="var(--logo-mi)"
        d="M97.4239 19.298C103.097 19.298 107.695 14.978 107.695 9.64901C107.695 4.32001 103.097 0 97.4239 0C91.7511 0 87.1523 4.32001 87.1523 9.64901C87.1523 14.978 91.7511 19.298 97.4239 19.298Z"
      />
      {/* "Show" (S con corte diagonal) */}
      <path
        fill="var(--logo-show)"
        d="M164.656 0.311249H130.106C118.693 0.311249 112.987 5.49889 112.987 15.8742V29.8808C112.987 35.4834 115.996 39.6335 122.013 42.3311L153.762 30.8146L140.378 26.7682C138.51 26.3532 137.576 25.5232 137.576 24.2781C137.576 22.6181 138.51 21.7881 140.378 21.7881H164.656V0.311249ZM158.742 32.6821L128.55 43.8874L141 47.6225C142.66 48.245 143.49 49.1788 143.49 50.4238C143.49 51.8764 142.556 52.6026 140.689 52.6026H113.921V74.0795H150.649C162.477 74.0795 168.391 68.4768 168.391 57.2715V46.6887C168.391 40.2561 165.174 35.5872 158.742 32.6821Z"
      />
      <path
        fill="var(--logo-show)"
        d="M171.815 0.311249H195.781V20.543H211.967C223.38 20.543 229.086 25.4194 229.086 35.1722V74.0795H205.43V43.2649C205.43 40.9823 204.289 39.8411 202.007 39.8411H195.781V74.0795H171.815V0.311249Z"
      />
      <path
        fill="var(--logo-show)"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M245.894 24.2781H273.907C283.453 24.2781 288.225 29.4658 288.225 39.8411V58.8278C288.225 68.9956 283.141 74.0795 272.974 74.0795H246.205C236.66 74.0795 231.887 68.9956 231.887 58.8278V40.1523C231.887 29.5695 236.556 24.2781 245.894 24.2781ZM254.609 39.8411C252.534 39.8411 251.497 40.8786 251.497 42.9536V54.1589C251.497 56.234 252.534 57.2715 254.609 57.2715H264.881C267.163 57.2715 268.305 56.234 268.305 54.1589V43.2649C268.305 40.9823 267.163 39.8411 264.881 39.8411H254.609Z"
      />
      <path
        fill="var(--logo-show)"
        d="M285.735 21.7881H306.589L312.815 44.8212L320.285 21.7881H339.583L347.987 44.8212L353.901 21.7881H376L358.258 74.0795H337.404L329.623 52.2914L322.152 74.0795H301.298L285.735 21.7881Z"
      />
    </svg>
  );
}
