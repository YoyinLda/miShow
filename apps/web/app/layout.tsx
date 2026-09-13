import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "miShow — Conciertos y eventos en Chile",
  description: "Catálogo de conciertos y eventos musicales de distintas ticketeras, en un solo lugar."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4">
          <header className="py-6">
            <a href="/" className="text-2xl font-bold tracking-tight">
              miShow
            </a>
            <p className="text-sm text-neutral-500">Conciertos y eventos musicales en Chile</p>
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
