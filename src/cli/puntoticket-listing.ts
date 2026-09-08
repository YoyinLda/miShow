import { readFileSync } from "node:fs";
import { parseMusicListing } from "../puntoticket/extraction/listing.js";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log("Uso: npm run puntoticket:listing -- <ruta-html> [base-url]");
  process.exit(0);
}

if (args.length < 1 || args.length > 2) fail("Se requiere una ruta HTML y, opcionalmente, una base-url.");

try {
  const html = readFileSync(args[0], "utf8");
  const references = parseMusicListing(html, args[1]);
  console.log(JSON.stringify({ count: references.length, references, errors: [] }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
  process.exit(1);
}
