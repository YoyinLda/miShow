const detailHtml = `
  <h1>Evento CLI</h1>
  <script type="application/ld+json">{"@type":"Event","name":"Evento CLI","startDate":"2026-12-12T20:00:00-03:00","offers":{"url":"/queue/enqueue/CLI"}}</script>`;

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:54321/rest/v1/rpc/")) {
    const headers = init?.headers as Record<string, string> | undefined;
    if (headers?.apikey !== "sb_secret_TEST" || "Authorization" in (headers ?? {})) throw new Error("invalid Supabase headers");
    const name = url.split("/").at(-1);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (name === "start_scrape_run") return Response.json({ run_id: "42", status: "running" });
    if (name === "persist_normalized_event") {
      if (process.env.MISHOW_TEST_PERSIST_FAILURE === "1") {
        return Response.json({ code: "23514", message: "constraint failed" }, { status: 400 });
      }
      const warnings = process.env.MISHOW_TEST_PERSIST_WARNING === "1"
        ? [{ stage: "persist", source_url: body.p_event.source_url, severity: "warning", code: "duplicate_source_code", message: "retained", attempts: 1 }]
        : [];
      return Response.json({ event_id: "7", warnings });
    }
    if (name === "record_scrape_error") return Response.json({ error_id: "9" });
    if (name === "finish_scrape_run") {
      if (process.env.MISHOW_TEST_FINISH_FAILURE === "1") {
        return Response.json({ code: "finish_failed", message: "Authorization: Bearer FINISH_SECRET" }, { status: 500 });
      }
      return Response.json({ run_id: "42", status: body.p_result.status });
    }
    throw new Error(`unexpected RPC ${name}`);
  }
  if (url === "https://www.puntoticket.com/musica") {
    if (process.env.MISHOW_TEST_LISTING_FAILURE === "1") throw new Error("listing test failure");
    return new Response(`<a href="/evento/CLI"><h3>Evento CLI</h3></a>`, { status: 200, headers: { "content-type": "text/html" } });
  }
  if (url === "https://www.puntoticket.com/evento/CLI") {
    return new Response(detailHtml, { status: 200, headers: { "content-type": "text/html" } });
  }
  throw new Error(`unexpected fetch ${url}`);
};
