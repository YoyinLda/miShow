# Despliegue a producción — cron + frontend + DNS

Guía operativa, paso a paso, para poner miShow en línea: activar el scraping
programado (cron), publicar el frontend en una URL genérica y dejar preparado el
DNS. Todos los recursos de código ya existen en el repo; aquí se ejecuta la parte
operativa (crear proyectos, cargar secrets, disparar workflows, configurar DNS).

> Convención de estado: marca cada casilla `[x]` al completarla.

---

## 0. Decisión: ¿cron en GitHub Actions o Supabase?

**Elegido: GitHub Actions.** Justificación:

- El scraper corre en Node con `tsx` y dependencias npm (`cheerio`), y ya tiene
  dos workflows listos (`scrape-puntoticket.yml`, `scrape-ticketmaster.yml`).
- Supabase Cron (pg_cron + Edge Functions) obligaría a reescribir el scraper como
  Edge Function en Deno, perdiendo el ecosistema npm y los tests actuales.
- GitHub Actions es gratis para este volumen (2 corridas/día por fuente) y ya
  está integrado con el repo y los secrets.

Supabase se mantiene solo como base de datos (Data API + RPC), no como ejecutor.

---

## 1. Prerrequisitos

- [ ] Repo en GitHub con permisos de administración (para secrets/variables).
- [ ] Proyecto Supabase remoto con migraciones aplicadas (ya está:
  `bomaboxmzznmhcqriwbt`, incluye `catalog_events_v2`, `catalog_artists_v1`,
  `catalog_venues_v1`, `catalog_freshness_v1` y
  `start_scrape_run` multi-fuente).
- [ ] Cuenta de Cloudflare (plan gratuito sirve).
- [ ] La rama `feat/scraper-multi-fuente-ticketmaster` mergeada a `main` (los
  workflows de cron y deploy se disparan desde `main`).

### Datos del proyecto (referencia)

- Data API URL: `https://bomaboxmzznmhcqriwbt.supabase.co`
- Clave publishable (solo lectura, va al navegador):
  `sb_publishable_v3SihToVNftxfqwLmS6exg_GlD1Hc6K`
- Secret key del servidor: **NO** está aquí. Obtenerla en Supabase → Project
  Settings → API → `service_role`/secret key. Solo se usa en el cron, nunca en el
  frontend.

---

## 2. Activar el cron (scraping programado) en GitHub Actions

### 2.1 Cargar secrets del scraper

En GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

- [ ] `SUPABASE_URL` = `https://bomaboxmzznmhcqriwbt.supabase.co`
- [ ] `SUPABASE_SECRET_KEY` = la secret key del servidor (Supabase → Settings →
  API). **Nunca** la publishable.

### 2.2 (Opcional) Variables de cobertura

En **Actions → Variables** (solo si quieres cambiar los defaults 60/200):

- [ ] `MAX_EVENTS` (default 60)
- [ ] `MAX_EVENTS_LIMIT` (default 200)

### 2.3 Primera corrida manual (verificación)

- [ ] GitHub → **Actions → Scrape PuntoTicket → Run workflow** (rama `main`).
- [ ] GitHub → **Actions → Scrape Ticketmaster → Run workflow** (rama `main`).
- [ ] Verificar que ambas terminan en verde (exit 0) y sin errores en el log.

Horarios automáticos ya configurados (UTC):
- PuntoTicket: `0 12` y `0 22`.
- Ticketmaster: `0 13` y `0 23` (desfasados para no solapar).

### 2.4 Verificar datos en Supabase

Ejecuta en el SQL Editor de Supabase (o vía MCP):

```sql
select s.code, count(e.id) as eventos, count(e.image_url) as con_imagen
from public.events e join public.sources s on s.id = e.source_id
group by s.code order by s.code;
```

- [ ] Aparecen `puntoticket` y `ticketmaster` con eventos > 0.

---

## 3. Publicar el frontend en Cloudflare Pages (URL genérica)

El objetivo de esta etapa es obtener una URL genérica del tipo
`https://<proyecto>.pages.dev` para validar el sitio antes de configurar el DNS.

### 3.1 Crear el proyecto de Pages (una vez)

Opción recomendada (conecta el repo, deja URL genérica automática):

- [ ] Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
- [ ] Selecciona el repo `miShow` y la rama `main`.
- [ ] Framework preset: **None** (usamos export estático propio).
- [ ] Build command: `npm run build -w @mishow/web`
- [ ] Build output directory: `apps/web/out`
- [ ] Root directory: (raíz del repo)
- [ ] Variables de entorno de build (Pages → Settings → Environment variables):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://bomaboxmzznmhcqriwbt.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_v3SihToVNftxfqwLmS6exg_GlD1Hc6K`
- [ ] Guarda. Cloudflare hará el primer build y te dará la URL genérica
  `https://<proyecto>.pages.dev`.

> Nota: el nombre del proyecto que elijas es el `<proyecto>` de la URL genérica.

### 3.2 Alternativa: publicar vía el workflow del repo

Si prefieres controlar el deploy desde GitHub Actions (workflow ya existente
`deploy-web.yml`), en vez de la integración Git de Cloudflare:

- [ ] Crea el proyecto de Pages vacío (sin conectar Git) y anota su nombre.
- [ ] Crea un token de Cloudflare con permiso **Cloudflare Pages: Edit** y anota
  el **Account ID**.
- [ ] En GitHub → Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] En GitHub → Variables: `CLOUDFLARE_PAGES_PROJECT` = nombre del proyecto.
- [ ] GitHub → **Actions → Deploy Web (Cloudflare Pages) → Run workflow**.

Elige **una** de las dos vías (3.1 o 3.2), no ambas, para evitar dobles deploys.
La 3.1 es la más simple para arrancar; la 3.2 mantiene el control en el repo.

### 3.3 Verificar el sitio en la URL genérica

- [ ] Abre `https://<proyecto>.pages.dev`.
- [ ] El listado carga eventos de ambas fuentes (PuntoTicket + Ticketmaster).
- [ ] Las tarjetas muestran imagen, estado y el botón "Ir a la ticketera".
- [ ] El detalle de un evento abre y el enlace lleva a la ticketera correcta.
- [ ] El indicador de frescura ("actualizado hace…") aparece.

---

## 4. Configurar el DNS (dominio propio)

Cuando la URL genérica esté validada, apuntar el dominio propio.

### 4.1 Si el DNS lo gestiona Cloudflare

- [ ] Cloudflare → tu proyecto de Pages → **Custom domains → Set up a domain**.
- [ ] Ingresa el dominio o subdominio (p. ej. `www.mishow.cl` o `mishow.cl`).
- [ ] Cloudflare crea el registro (CNAME/apex) automáticamente si el dominio ya
  está en tu cuenta de Cloudflare; confirma.

### 4.2 Si el DNS lo gestiona otro proveedor (p. ej. GoDaddy)

- [ ] En el proveedor, crea un **CNAME** del subdominio (p. ej. `www`) apuntando a
  `<proyecto>.pages.dev`.
- [ ] Para el apex (`mishow.cl` sin `www`), usar el método que indique Cloudflare
  Pages (CNAME flattening o los registros que muestre la pestaña Custom domains).
- [ ] En Cloudflare Pages → **Custom domains**, agrega el dominio y sigue las
  instrucciones de validación.

### 4.3 Verificar

- [ ] `https://<tu-dominio>` sirve el sitio con HTTPS (certificado emitido por
  Cloudflare, puede tardar unos minutos).
- [ ] Redirección coherente entre apex y `www` (elige una canónica).

---

## 5. Post-despliegue

- [ ] Confirmar que el próximo cron programado corre solo y actualiza el catálogo.
- [ ] Revisar la pestaña **Actions** tras la primera corrida automática (verde).
- [ ] Documentar en el README la URL pública final.
- [ ] (Opcional) Configurar alertas si un workflow falla (GitHub notifica por
  defecto al autor del repo).

---

## Notas de seguridad

- Solo la **clave publishable** llega al navegador; la **secret key** vive
  únicamente en los secrets del cron.
- Los workflows no despliegan infraestructura pagada ni siguen `purchase_url`.
- El esquema de la DB vive en `supabase/migrations/`; no cambiar por dashboard.

## Referencias

- Cron: [docs/operacion-scraping-cron.md](operacion-scraping-cron.md)
- Frontend: [docs/despliegue-cloudflare-pages.md](despliegue-cloudflare-pages.md)
- Prueba e2e local: [docs/prueba-local-e2e-cloud.md](prueba-local-e2e-cloud.md)
