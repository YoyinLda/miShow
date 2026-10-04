"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EventDetail } from "../../components/EventDetail";

function EventoContent() {
  const params = useSearchParams();
  const slug = params.get("slug") ?? undefined;
  const idParam = params.get("id");
  const id = idParam != null ? Number(idParam) : undefined;
  return <EventDetail slug={slug} id={id} />;
}

export default function EventoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
      <EventoContent />
    </Suspense>
  );
}
