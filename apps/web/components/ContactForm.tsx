"use client";

import { useState, type FormEvent } from "react";
import { ContentRequestError } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";

/**
 * Formulario de contacto y retiro de contenido (brief 009 · C).
 * Inserta en `content_requests` (anon solo puede insertar). Antispam: rate limit
 * en la base (trigger) + honeypot `website`: si un bot lo llena, se simula éxito
 * sin enviar nada.
 */
type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand";

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    if (value("website")) {
      setStatus({ kind: "sent" });
      return;
    }
    if (!catalogConfigured()) {
      setStatus({ kind: "error", message: "El formulario no está disponible en este momento." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      await catalogClient().submitContentRequest({
        name: value("name"),
        organization: value("organization"),
        email: value("email"),
        eventUrl: value("eventUrl"),
        reason: value("reason")
      });
      setStatus({ kind: "sent" });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof ContentRequestError ? error.message : "No se pudo enviar la solicitud."
      });
    }
  }

  if (status.kind === "sent") {
    return (
      <p role="status" className="rounded-lg border border-border bg-surface p-4 text-sm">
        Recibimos tu solicitud. Te responderemos dentro de 24 horas al correo que indicaste.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nombre
        <input name="name" required maxLength={120} autoComplete="name" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          Organización <span className="font-normal text-text-muted">(opcional)</span>
        </span>
        <input name="organization" maxLength={160} autoComplete="organization" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Correo
        <input name="email" type="email" required maxLength={254} autoComplete="email" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          URL del evento en miShow <span className="font-normal text-text-muted">(si aplica)</span>
        </span>
        <input name="eventUrl" type="url" maxLength={500} placeholder="https://mishow.pages.dev/evento?slug=…" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Motivo
        <textarea name="reason" required minLength={10} maxLength={4000} rows={5} className={FIELD} />
      </label>
      {/* Honeypot: invisible para personas; los bots simples lo llenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {status.kind === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {status.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="inline-flex min-h-11 w-fit items-center rounded-[10px] bg-brand px-5 py-3 text-sm font-semibold text-brand-contrast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
      >
        {status.kind === "sending" ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}
