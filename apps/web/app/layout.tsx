import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { geistSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "miShow — Conciertos y eventos en Chile",
  description: "Catálogo de conciertos y eventos musicales de distintas ticketeras, en un solo lugar."
};

// Script anti-flash: antes del paint aplica data-theme según la elección
// guardada. 'system'/ausente deja que el CSS siga a prefers-color-scheme.
const themeScript = `(function(){try{var v=localStorage.getItem('mishow-theme');if(v==='light'||v==='dark'){document.documentElement.setAttribute('data-theme',v);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={geistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {/* Contenedor a los anchos del Figma: mobile estrecho (px-4), desktop
            ancho hasta 1440 (px-12). El header/footer comparten el mismo
            contenedor para alinear con el contenido. */}
        <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 sm:px-12">
          <SiteHeader />
          <main className="flex-1 py-8 sm:py-10">{children}</main>
          <footer className="border-t border-border py-6 text-xs text-text-muted">
            Datos obtenidos de fuentes públicas. Cada evento enlaza a su ticketera original.
          </footer>
        </div>
      </body>
    </html>
  );
}
