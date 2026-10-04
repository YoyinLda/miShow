import localFont from "next/font/local";

/**
 * Geist Sans auto-alojada con `next/font/local`.
 *
 * Apunta a los archivos `.woff2` del paquete `geist` (no se descarga nada en
 * tiempo de ejecución: Next copia la fuente como asset estático, compatible con
 * `output: 'export'`). Mapeamos los cuatro pesos del Figma Foundations
 * (Regular 400, Medium 500, SemiBold 600, Bold 700) a una sola familia; la
 * variable CSS `--font-sans` se consume en globals.css.
 *
 * `display: 'swap'` evita texto invisible mientras carga; `fallback` mantiene
 * una pila de sistema coherente con el fallback de @theme.
 */
export const geistSans = localFont({
  src: [
    { path: "../../../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../../node_modules/geist/dist/fonts/geist-sans/Geist-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../../node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../../node_modules/geist/dist/fonts/geist-sans/Geist-Bold.woff2", weight: "700", style: "normal" }
  ],
  variable: "--geist-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
});
