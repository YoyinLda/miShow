"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArtistDetail } from "../../components/ArtistDetail";

function ArtistContent() {
  const slug = useSearchParams().get("slug") ?? undefined;
  return <ArtistDetail slug={slug} />;
}

export default function ArtistasPage() {
  return (
    <Suspense fallback={<p className="text-sm text-text-muted">Cargando…</p>}>
      <ArtistContent />
    </Suspense>
  );
}
