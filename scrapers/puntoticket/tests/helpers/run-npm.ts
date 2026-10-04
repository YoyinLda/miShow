import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { basename } from "node:path";

/**
 * Ejecuta `npm <args>` de forma portable (Windows, macOS, Linux).
 *
 * En Windows `npm` es `npm.cmd` y `spawnSync("npm", ...)` sin shell no lo
 * encuentra (status null). Cuando los tests corren vía `npm test`, npm expone
 * `npm_execpath` (npm-cli.js): se invoca con el mismo Node, sin shell y sin
 * depender de la plataforma. Si no está disponible (p. ej. `vitest` directo),
 * se usa `npm` en POSIX y `npm.cmd` vía shell en Windows con argumentos citados.
 */
export function runNpm(args: readonly string[]): SpawnSyncReturns<string> {
  const npmCli = process.env.npm_execpath;
  if (npmCli && basename(npmCli).startsWith("npm-cli")) {
    return spawnSync(process.execPath, [npmCli, ...args], { encoding: "utf8" });
  }
  if (process.platform === "win32") {
    const command = ["npm", ...args.map(quoteForCmd)].join(" ");
    return spawnSync(command, { encoding: "utf8", shell: true });
  }
  return spawnSync("npm", [...args], { encoding: "utf8" });
}

function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
