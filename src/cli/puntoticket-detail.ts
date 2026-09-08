import { readFileSync } from "node:fs";
import { extractDetail, parseEventDetail } from "../puntoticket/extraction/detail.js";
import { normalizeEvent } from "../puntoticket/normalization.js";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log("Uso: npm run puntoticket:detail -- <ruta-html> <source-url> [extracted-at]");
  process.exit(0);
}

if (args.length < 2 || args.length > 3) fail("Se requiere ruta HTML, source-url y extracted-at opcional.");

try {
  const html = readFileSync(args[0], "utf8");
  const parsed = parseEventDetail(html, args[1]);
  if (!parsed.value) fail("No se pudo extraer el detalle.");
  const extracted = extractDetail(parsed.value);
  if (!extracted.value) fail("No se pudo normalizar el detalle extraído.");
  if (parsed.errors.length || extracted.errors.length) {
    console.error([...parsed.errors, ...extracted.errors].join("\n"));
  }
  console.log(JSON.stringify(normalizeEvent(parsed.value, extracted.value, {
    extracted_at: args[2] ?? new Date().toISOString()
  }), null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
  process.exit(1);
}
