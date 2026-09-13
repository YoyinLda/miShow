import { Suspense } from "react";
import { EventDetail } from "../../components/EventDetail";

export default function EventoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
      <EventDetail />
    </Suspense>
  );
}
