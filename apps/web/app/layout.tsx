import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
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
    <html lang="es" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4">
          <header className="flex items-center justify-between gap-4 border-b border-border py-4">
            <a
              href="/"
              className="text-2xl font-bold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              miShow
            </a>
            <ThemeToggle />
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t border-border py-6 text-xs text-text-muted">
            Datos obtenidos de fuentes públicas. Cada evento enlaza a su ticketera original.
          </footer>
        </div>
      </body>
    </html>
  );
}
