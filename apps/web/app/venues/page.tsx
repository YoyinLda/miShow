"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VenueDetail } from "../../components/VenueDetail";

function VenueContent() {
  const slug = useSearchParams().get("slug") ?? undefined;
  return <VenueDetail slug={slug} />;
}

export default function VenuesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
      <VenueContent />
    </Suspense>
  );
}
