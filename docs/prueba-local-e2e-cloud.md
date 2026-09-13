# Prueba local end-to-end contra Supabase cloud

Esta guía describe cómo ejecutar una prueba completa **en local** conectada a un
proyecto **Supabase cloud**: sincronizar el esquema, ejecutar un scraping real de
PuntoTicket que persiste los datos en la nube, y levantar el frontend local para
ver y verificar el catálogo.

> Alcance: es una prueba manual, no un despliegue. El frontend corre en tu
> máquina (`localhost`); la base de datos es el proyecto cloud. El scraping hace
> peticiones HTTP reales a PuntoTicket, así que respeta los límites configurados.

## 0. Requisitos previos

- Node.js `>=20.18.1` y npm.
- Dependencias instaladas: `npm ci` (o `npm install`) en la raíz del repo.
- Docker **no** es necesario para esta prueba (solo se usa para el stack local,
  que aquí no usamos porque apuntamos a cloud).
- Acceso al proyecto Supabase cloud (`project ref`, ver más abajo).
- La CLI de Supabase viene como dependencia del repo; se invoca con
  `npx --no-install supabase ...` (no requiere instalación global).

Nunca se versiona `.env`, `apps/web/.env.local` ni tokens. Solo se usan aquí.

## 1. Credenciales del proyecto cloud

En el Dashboard de Supabase (proyecto correspondiente):

| Dato | Dónde | Uso |
|---|---|---|
| Project ref | Project Settings → General | `supabase link` |
| Database password | Project Settings → Database | `supabase link` |
| API URL | Project Settings → API (`https://<ref>.supabase.co`) | scraper y frontend |
| Secret key (server) | Project Settings → API keys | **scraper** (`--persist`) |
| Publishable key | Project Settings → API keys | **frontend** (solo lectura) |
| Personal Access Token | Account → Access Tokens | autenticar la CLI |

Reglas de seguridad:

- La **secret key** solo se usa server-side (scraper/CLI). Nunca en el navegador
  ni con prefijo `NEXT_PUBLIC_`.
- El **frontend** solo recibe la **publishable key** (solo lectura, protegida por
  RLS).
- El **access token** y la **database password** son credenciales personales del
  proyecto: no pegarlas en archivos versionados.

## 2. Sincronizar el esquema con cloud (una vez, o al cambiar migraciones)

El esquema (tablas, RPC, vista `catalog_events_v1`, RPC `catalog_freshness_v1`,
RLS y grants) vive en `supabase/migrations/`. Hay que aplicarlo al proyecto cloud
antes de que el scraping o el catálogo funcionen.

Autenticar la CLI (una de las dos opciones):

```bash
# Opción A: login interactivo (abre el navegador)
npx --no-install supabase login

# Opción B: token por variable de entorno (sin navegador)
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx   # Personal Access Token
```

Enlazar el proyecto y aplicar migraciones:

```bash
npx --no-install supabase link --project-ref <TU_PROJECT_REF>
# pedirá la database password del proyecto

npx --no-install supabase db push --dry-run   # revisa qué migraciones aplicaría
npx --no-install supabase db push             # aplica de verdad
```

`db push` aplica solo las migraciones que falten en cloud. Si el proyecto ya
tenía la migración base, aplicará únicamente la de frescura.

> Atención: `db push` modifica el esquema de **producción**. Revisa siempre el
> `--dry-run` primero. Para revertir se requiere una migración inversa revisada
> (no hay `reset` seguro en un proyecto compartido).

## 3. Variables de entorno

### 3.1 Scraper (raíz): `.env`

El scraper con `--persist` lee `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del entorno
del proceso. Copia el ejemplo y complétalo con los valores del proyecto cloud:

```bash
cp .env.example .env
```

`.env` (no versionado):

```dotenv
SUPABASE_URL=https://<TU_PROJECT_REF>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx   # secret key del servidor (NUNCA la publishable)
```

La app **no** carga `.env` automáticamente: hay que exportarlo al entorno del
proceso (ver paso 4).

### 3.2 Frontend: `apps/web/.env.local`

El frontend lee variables `NEXT_PUBLIC_*` (públicas, solo lectura). Copia el
ejemplo y complétalo:

```bash
cp apps/web/.env.example apps/web/.env.local
```

`apps/web/.env.local` (no versionado):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<TU_PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

## 4. Carga de datos: scraping real con persistencia en cloud

Desde la raíz del repo, exporta las variables del scraper y ejecuta la carga.
`--persist` valida la configuración **antes** de adquirir; si falta algo, falla
sin tocar la red.

```bash
set -a; . ./.env; set +a

npm --silent run puntoticket:scrape -- \
  --live \
  --persist \
  --max-events 5 \
  --concurrency 1 \
  --delay-ms 1500 \
  --timeout-ms 15000
```

- `--max-events 5` es un valor razonable para una prueba (el cron usa 2). El
  máximo admitido por la política es 50; súbelo con cautela.
- La salida es un único JSON en stdout con `run_id`, `status` y `summary`.
- Códigos de salida: `0` para `succeeded`/`partial`, `1` para fallo global o
  configuración inválida. Los errores van a stderr sin exponer secretos.

Interpretación del resultado:

- `status: succeeded` → todos los eventos intentados se persistieron.
- `status: partial` → hubo éxitos y también errores/advertencias (se guardó lo
  que se pudo).
- `status: failed` → no se persistió ningún evento.

La persistencia es idempotente: repetir el comando **no** duplica eventos
(actualiza por `source_url` y por instante de función).

## 5. Verificar los datos en cloud (opcional, por Data API)

Comprueba rápidamente que el catálogo y la frescura respondan con la
**publishable key** (rol anon), tal como los consumirá el frontend:

```bash
# Cantidad de eventos visibles en el catálogo público
curl -s "$SUPABASE_URL/rest/v1/catalog_events_v1?select=id,name&limit=5" \
  -H "apikey: <PUBLISHABLE_KEY>" | head

# Frescura del catálogo (última corrida succeeded/partial)
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/catalog_freshness_v1" \
  -H "apikey: <PUBLISHABLE_KEY>" \
  -H "content-type: application/json" \
  -d '{"p_source":"puntoticket"}'
```

Se espera una lista de eventos y un objeto de frescura con
`last_run_finished_at`, `last_run_status`, `discovered_count` y
`succeeded_count`. La secret key nunca se usa aquí.

## 6. Levantar el frontend local

Con `apps/web/.env.local` apuntando a cloud (paso 3.2), inicia el servidor de
desarrollo:

```bash
npm run dev -w @mishow/web
```

Abre `http://localhost:3000`. Deberías ver:

- El **listado** de eventos leídos desde `catalog_events_v1` (cloud).
- El indicador **"Catálogo actualizado hace X"** sobre el buscador (frescura
  desde `catalog_freshness_v1`).
- La **búsqueda** por nombre/artista/recinto filtrando en cliente.
- El **detalle** de un evento al hacer clic (artistas, recinto, funciones,
  precios y enlace a la ticketera original).

> El comando `npm run dev` levanta un servidor de desarrollo que no termina solo;
> déjalo corriendo en su terminal y ábrelo en el navegador. Para detenerlo, Ctrl+C.

### Verificación funcional sugerida

1. El listado carga sin el mensaje de "no configurado".
2. El indicador de frescura muestra un tiempo relativo coherente con la hora del
   scraping (paso 4).
3. La búsqueda filtra resultados.
4. El detalle abre y el botón "Comprar"/enlace a la ticketera apunta a
   PuntoTicket.
5. Si borras temporalmente las variables de `apps/web/.env.local`, la web muestra
   el estado "no configurado" sin romperse (comprobación del manejo de estados).

## 7. Repetir para validar idempotencia (opcional)

Vuelve a ejecutar el comando del paso 4. El conteo de eventos en
`catalog_events_v1` no debe crecer por reprocesar los mismos eventos; solo se
actualizan `last_seen_at` y datos cambiantes. La frescura reflejará la nueva
corrida.

## 8. Build estático (opcional, como en producción)

Para reproducir exactamente lo que se publica en Cloudflare Pages:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<TU_PROJECT_REF>.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx \
npm run build -w @mishow/web
# genera apps/web/out (sitio estático)
```

Puedes servir `apps/web/out` con cualquier servidor estático para validar el
export.

## 9. Limpieza

- Detén el servidor de desarrollo con Ctrl+C.
- `.env` y `apps/web/.env.local` quedan en tu máquina (git los ignora). Bórralos
  si no quieres conservar las credenciales localmente.
- Los datos cargados quedan en el proyecto cloud. Para removerlos se requiere una
  acción explícita sobre la base (fuera del alcance de esta prueba).

## Resumen de comandos

```bash
# 0) dependencias
npm ci

# 2) esquema en cloud (una vez / al cambiar migraciones)
npx --no-install supabase login            # o export SUPABASE_ACCESS_TOKEN=...
npx --no-install supabase link --project-ref <REF>
npx --no-install supabase db push --dry-run
npx --no-install supabase db push

# 3) variables
cp .env.example .env                       # completar SUPABASE_URL/SECRET_KEY
cp apps/web/.env.example apps/web/.env.local  # completar NEXT_PUBLIC_*

# 4) carga de datos (scraping real -> cloud)
set -a; . ./.env; set +a
npm --silent run puntoticket:scrape -- --live --persist --max-events 5 --concurrency 1 --delay-ms 1500 --timeout-ms 15000

# 6) frontend local
npm run dev -w @mishow/web                 # http://localhost:3000
```
