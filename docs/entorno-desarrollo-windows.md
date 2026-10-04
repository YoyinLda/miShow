# Entorno de desarrollo en Windows

Guía para preparar una estación Windows (PowerShell 5.1+) para miShow. Contexto y
decisiones en [briefs/004-migracion-entorno-windows.md](briefs/004-migracion-entorno-windows.md).

## 1. Node.js con nvm-windows

Versión del proyecto: **Node 24.21.0** (la misma que CI). Mínimo por
dependencias: `>=20.19.0`.

```powershell
nvm install 24.21.0
nvm use 24.21.0
node -v; npm -v
```

Si `npm` no se reconoce:

1. Verifica que existan `NVM_HOME` y `NVM_SYMLINK` (el `Path` usa ambas):

   ```powershell
   [Environment]::GetEnvironmentVariable("NVM_HOME","User")
   [Environment]::GetEnvironmentVariable("NVM_SYMLINK","User")
   ```

2. Si `NVM_SYMLINK` está vacía, defínela con la ruta `path:` de
   `%NVM_HOME%\settings.txt` (por defecto `C:\nvm4w\nodejs`):

   ```powershell
   [Environment]::SetEnvironmentVariable("NVM_SYMLINK","C:\nvm4w\nodejs","User")
   ```

3. Si aparece "la ejecución de scripts está deshabilitada" al correr `npm`:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

4. Cierra y reabre la terminal (o recarga la ventana del editor).

## 2. Cargar `.env` en PowerShell

La app no carga `.env` automáticamente. Equivalente a `set -a; . ./.env; set +a`:

```powershell
Get-Content .env | Where-Object { $_ -match '^\s*[A-Za-z_]\w*\s*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  Set-Item "Env:$($k.Trim())" $v.Trim().Trim('"').Trim("'")
}
npm --silent run puntoticket:scrape -- --live --persist --max-events 2 --concurrency 1 --delay-ms 1500 --timeout-ms 15000
```

Las variables quedan solo en esa sesión de terminal.

## 3. Tests

`npm run qa` funciona igual que en macOS/Linux. Los tests que invocan la CLI por
npm usan `scrapers/puntoticket/tests/helpers/run-npm.ts`; para nuevos tests de
CLI, usa `runNpm([...])` en vez de `spawnSync("npm", ...)` (en Windows `npm` es
`npm.cmd` y no arranca sin shell).

## 4. MCP del asistente (Kiro)

Se configuran en `~/.kiro/settings/mcp.json` (usuario, **fuera del repo**):

- **codebase-memory:** binario de
  [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
  instalado con `install.ps1 --skip-config` en
  `%LOCALAPPDATA%\Programs\codebase-memory-mcp\`. Indexar con
  `index_repository(mode="fast")`.
- **supabase:** servidor remoto con PAT (`sbp_...`, Supabase → Account → Access
  Tokens):

  ```json
  "supabase": {
    "url": "https://mcp.supabase.com/mcp?project_ref=<REF>&read_only=true",
    "headers": { "Authorization": "Bearer sbp_..." }
  }
  ```

  La `SUPABASE_SECRET_KEY` no sirve para el MCP. Mantener `read_only=true`.

El stack local de Supabase (`npm run supabase:start`) requiere Docker Desktop.
