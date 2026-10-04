import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
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
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4">
          <header className="flex items-start justify-between gap-4 py-6">
            <div>
              <a href="/" className="text-2xl font-bold tracking-tight">
                miShow
              </a>
              <p className="text-sm text-neutral-500">Conciertos y eventos musicales en Chile</p>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 pb-16">{children}</main>
          <footer className="border-t border-neutral-200 py-6 text-xs text-neutral-400">
            Datos obtenidos de fuentes públicas. Cada evento enlaza a su ticketera original.
          </footer>
        </div>
      </body>
    </html>
  );
}
