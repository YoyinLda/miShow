# Brief 004 — Migración del entorno de desarrollo a Windows (RFC tardío)

- **Estado:** Completado (9/9). **RFC tardío:** se documenta después de ejecutar,
  como excepción a la convención de briefs (se resolvieron bloqueos operativos en
  sesión). Requiere validación retroactiva de TL/PO.
- **Fecha:** 2026-10-04
- **Depende de:** Brief 003 (modelo canónico), ya en `main`.

---

## 1. Contexto y problema

El desarrollo pasa a una estación **Windows 11 + PowerShell 5.1** (antes POSIX).
Al migrar aparecieron bloqueos que impedían trabajar y operar:

1. `npm` no se reconocía en la terminal de Kiro.
2. Los workflows de scraping (`Scrape PuntoTicket`, `Scrape Ticketmaster`) fallaban
   en **todas** las corridas recientes con exit code 1.
3. CI fijaba Node `20.18.1`, por debajo del mínimo de dependencias actuales, y
   GitHub Actions avisa la deprecación de Node 20 en las actions.
4. 6 tests de PuntoTicket fallaban en Windows.
5. Faltaban los MCP para el asistente (Codebase Memory y Supabase cloud).

## 2. Investigación (verificada en sesión, 2026-10-04)

### 2.1 `npm` no reconocido
- nvm-windows instalado con Node `v24.21.0` en `%LOCALAPPDATA%\nvm`.
- El `Path` (usuario y máquina) contiene `%NVM_HOME%;%NVM_SYMLINK%`, pero
  **`NVM_SYMLINK` no existía** como variable: la ruta del symlink no se expandía.
- `settings.txt` de nvm define el symlink en `C:\nvm4w\nodejs`.
- Segundo bloqueo: ExecutionPolicy de PowerShell impedía cargar `npm.ps1`.

### 2.2 Workflows de scraping fallando
- Log de los runs 37170603364 y 37164982655:
  `Error: SUPABASE_URL y SUPABASE_SECRET_KEY son obligatorias con --persist.`
- `gh secret list`: el repo **no tenía secrets**. No era un defecto de código.

### 2.3 Versión de Node en CI
- `npm ci` en CI emitía `EBADENGINE`: `vite@7.3.6` exige `^20.19.0 || >=22.12.0`
  y `eslint-visitor-keys@5.0.1` exige `^20.19.0 || ^22.13.0 || >=24`.
- Aviso de Actions: `actions/checkout@v4` y `actions/setup-node@v4` apuntan a
  Node 20 (deprecado).

### 2.4 Tests fallando en Windows
- 7 llamadas `spawnSync("npm", ...)` sin shell en
  `scrapers/puntoticket/tests/puntoticket.test.ts` (5) y
  `puntoticket-acquisition.test.ts` (2).
- En Windows `npm` es `npm.cmd`; sin shell el proceso no arranca (`status: null`,
  `stdout: undefined`). Fallaría igual con cualquier versión de Node en Windows.

### 2.5 MCP de Supabase
- El power `supabase-local` apunta a `http://127.0.0.1:54321/mcp` (stack local),
  que requiere Docker; no hay Docker en esta estación.
- El MCP remoto no acepta la `sb_secret_`: requiere OAuth o PAT (`sbp_`).
- OAuth falló: el callback `localhost:<puerto>/oauth/callback` llegó cuando el
  listener de Kiro ya estaba cerrado.

## 3. Decisiones (tomadas en sesión; validar con TL/PO)

- **D1. Runtime de CI:** Node `24.21.0` (igual que local) y
  `actions/checkout@v5` / `actions/setup-node@v5`.
  - Descartado: Node 20.19.x (aún deprecado en Actions) y saltar a actions v7
    (sin necesidad para quitar el aviso; se evalúa aparte).
- **D2. Tests de CLI portables:** helper `runNpm` en lugar de `shell: true` global.
  - Usa `npm_execpath` (npm-cli.js) con el mismo Node, sin shell, cuando corre vía
    `npm test`; fallback `npm.cmd` por shell con argumentos citados en Windows y
    `npm` en POSIX.
  - Descartado: `shell: true` en todas las llamadas (quoting frágil entre
    plataformas) y `cross-spawn` (dependencia nueva para un caso acotado).
- **D3. Secrets de Actions:** cargados por TL/PO (`gh secret set -f .env`). El
  asistente no manipula credenciales.
- **D4. Codebase Memory MCP:** binario oficial `DeusData/codebase-memory-mcp`
  0.11.0 instalado con `--skip-config` (script revisado, checksum SHA-256
  verificado); registro manual en la config MCP de usuario.
- **D5. Supabase MCP:** servidor remoto con **PAT** en header `Authorization`,
  `project_ref` fijo y `read_only=true`, en la config MCP **de usuario**
  (`~/.kiro/settings/mcp.json`, fuera del repo).
  - Descartado: OAuth (callback inestable) y secret key (no soportada por el MCP).

## 4. Solución aplicada

1. **Estación (fuera del repo):** `NVM_SYMLINK=C:\nvm4w\nodejs` (usuario) y
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
2. **Workflows:** `deploy-web.yml`, `scrape-puntoticket.yml`,
   `scrape-ticketmaster.yml` → actions v5 + Node `24.21.0`.
3. **Tests:** `scrapers/puntoticket/tests/helpers/run-npm.ts` y reemplazo de las 7
   llamadas.
4. **MCP (fuera del repo):** `codebase-memory` y `supabase` en
   `~/.kiro/settings/mcp.json`. Proyecto indexado como `C-Yoyo-Dev-miShow`.
5. **Documentación:** requisito de Node, equivalente PowerShell para cargar `.env`,
   guía `docs/entorno-desarrollo-windows.md` y decisión en
   `docs/decisiones-tecnicas.md`.

## 5. Checklist de tareas

> Estado: `[ ]` pendiente · `[x]` hecho.

- [x] **T1.** `npm` operativo: `node -v` → v24.21.0, `npm -v` → 11.19.0.
- [x] **T2.** Causa de fallos de cron identificada (secrets ausentes) y secrets
  `SUPABASE_URL` / `SUPABASE_SECRET_KEY` cargados (`gh secret list`).
- [x] **T3.** Workflows a Node 24.21.0 + actions v5 (commit `16a12cb`).
- [x] **T4.** Tests portables con `runNpm` (commit `16a12cb`).
- [x] **T5.** `npm run qa` verde en Windows: PuntoTicket 101/101, Ticketmaster
  14/14, web 10/10, catalog-client 9/9; también con `vitest` directo (rama fallback).
- [x] **T6.** Codebase Memory MCP instalado e indexado (896 nodos, 1993 aristas).
- [x] **T7.** Supabase MCP conectado vía PAT, solo lectura verificada
  (`transaction_read_only = on`).
- [x] **T8.** Prueba local → cloud con parámetros del cron: run 13 PuntoTicket
  48/48 y run 14 Ticketmaster 60/60 `succeeded`; 136 eventos, 0 `source_url`
  duplicadas, `scrape_errors` vacío.
- [x] **T9.** Documentación y brief actualizados.

## 6. Verificación

- `npm ci` sin `EBADENGINE` con Node 24.21.0.
- `npm run qa` verde en Windows (typecheck, lint, tests).
- Scrape real `--live --persist` desde Windows contra Supabase cloud, idempotente.
- **Pendiente post-merge:** ejecutar ambos workflows por `workflow_dispatch` y
  confirmar runs verdes en Actions.
- **No verificado:** ejecución de tests en macOS (sin equipo disponible). La ruta
  principal (`npm_execpath`) es la misma validada en Windows.

## 7. Riesgos y pendientes

- **Ticketmaster corta en 60/68** por `MAX_EVENTS=60`. Decisión TL/PO: variable de
  repo `MAX_EVENTS` (p. ej. 80; tope 200).
- **Advisor de seguridad (WARN):** `public.catalog_freshness_v1` es
  `SECURITY DEFINER` ejecutable por `anon`/`authenticated`. Confirmar si es
  intencional (lo consume la web) o revocar/cambiar a `SECURITY INVOKER`.
- **Advisor (INFO):** `scrape_runs` y `scrape_errors` con RLS sin políticas
  (esperado: solo las escribe el scraper con secret key).
- `npm audit` reporta 6 vulnerabilidades (1 crítica) en dependencias; fuera de
  alcance, requiere brief propio.
- Actions v7 disponibles (`checkout@v7.0.1`, `setup-node@v7.0.0`); evaluar aparte.
- El PAT de Supabase da permisos de desarrollador: rotarlo periódicamente y no
  versionarlo.
