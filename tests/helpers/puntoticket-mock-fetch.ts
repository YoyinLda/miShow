const detailHtml = `
  <h1>Evento CLI</h1>
  <script type="application/ld+json">{"@type":"Event","name":"Evento CLI","startDate":"2026-12-12T20:00:00-03:00","offers":{"url":"/queue/enqueue/CLI"}}</script>`;

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url === "https://www.puntoticket.com/musica") {
    return new Response(`<a href="/evento/CLI"><h3>Evento CLI</h3></a>`, { status: 200, headers: { "content-type": "text/html" } });
  }
  if (url === "https://www.puntoticket.com/evento/CLI") {
    return new Response(detailHtml, { status: 200, headers: { "content-type": "text/html" } });
  }
  throw new Error(`unexpected fetch ${url}`);
};
