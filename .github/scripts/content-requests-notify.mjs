// Aviso de solicitudes de contacto y retiro de contenido (brief 009 · C).
//
// Lee las filas `pending` de `content_requests` con la secret key del servidor,
// abre un issue `retiro-contenido` por cada una y la marca `notified`. Corre cada
// 30 min desde .github/workflows/content-requests.yml. Sin dependencias.
//
// Privacidad: el repo es PÚBLICO. El issue solo lleva el id, la URL del evento y
// la fecha; nombre, correo y motivo se revisan en Supabase (ver el runbook
// docs/runbook-retiro-contenido.md).
//
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY.

const LABEL = "retiro-contenido";
const BATCH = 20;

const env = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
};

const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
const secretKey = env("SUPABASE_SECRET_KEY");
const githubToken = env("GITHUB_TOKEN");
const repository = env("GITHUB_REPOSITORY");

async function supabase(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: secretKey, "content-type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status} en ${path.split("?")[0]}.`);
  return text ? JSON.parse(text) : null;
}

async function github(path, body) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${githubToken}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

/** Solo URLs http(s) de miShow; cualquier otra cosa se omite del issue público. */
function safeEventUrl(value) {
  if (!value) return "(no indicada)";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "(URL no válida)";
    return url.hostname.endsWith("mishow.pages.dev") ? url.href : `(URL externa: ${url.hostname})`;
  } catch {
    return "(URL no válida)";
  }
}

const pending = await supabase(
  `content_requests?select=id,created_at,event_url&status=eq.pending&order=created_at.asc&limit=${BATCH}`
);
console.log(`Solicitudes pendientes: ${pending.length}`);
if (pending.length > 0) {
  const label = await github("labels", { name: LABEL, color: "D93F0B", description: "Solicitud de retiro de contenido (brief 009)" });
  if (label.status !== 201 && label.status !== 422) throw new Error(`No se pudo asegurar el label (${label.status}).`);
}

for (const request of pending) {
  const issue = await github("issues", {
    title: `[retiro-contenido] Solicitud #${request.id}`,
    labels: [LABEL],
    body: [
      `Nueva solicitud de contacto o retiro de contenido. **Plazo de respuesta: 24 h.**`,
      ``,
      `- Solicitud: \`content_requests.id = ${request.id}\``,
      `- Recibida: ${request.created_at}`,
      `- Evento: ${safeEventUrl(request.event_url)}`,
      ``,
      `Nombre, correo y motivo están en Supabase (no se publican aquí: el repo es público).`,
      `Seguir \`docs/runbook-retiro-contenido.md\`.`
    ].join("\n")
  });
  if (issue.status !== 201) throw new Error(`No se pudo crear el issue de la solicitud ${request.id} (${issue.status}).`);
  await supabase(`content_requests?id=eq.${request.id}&status=eq.pending`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ status: "notified", issue_number: issue.data.number, notified_at: new Date().toISOString() })
  });
  console.log(`Solicitud ${request.id} → issue #${issue.data.number}`);
}
