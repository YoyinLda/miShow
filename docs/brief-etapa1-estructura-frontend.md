# Brief de ejecución: Etapa 1 — estructura monorepo y frontend público

| Campo | Valor |
|---|---|
| Estado | Propuesta para aprobación TL/PO |
| Etapa | Etapa 1 — MVP público a costo cero |
| Branch sugerida | `feat/etapa1-monorepo-estructura` |
| Branch base | `main` |
| Flujo obligatorio | `designer → aprobación TL/PO → dev → qa` |
| Dependencia | Etapa 0 completa (adquisición, extracción, normalización, persistencia idempotente) |
| Fecha | 12 de septiembre de 2026 |

## 1. Propósito

Esta etapa **no** entrega todavía el catálogo público terminado. Entrega dos
cosas que lo habilitan:

1. Una **estructura de repositorio** clara, ordenada por proyectos internos,
   preparada para (a) dividirse en repositorios separados en el futuro sin
   reescrituras y (b) ser compatible con el despliegue previsto.
2. El **andamiaje del frontend** Next.js y su forma de consumir datos, hasta
   mostrar un MVP simplificado del catálogo.

El objetivo transversal es **no volver a pagar el costo de reorganizar** más
adelante: los límites entre dominio, fuentes, acceso a datos, frontend e
infraestructura quedan definidos desde ahora.

## 2. Decisiones cerradas por el TL/PO

| Tema | Decisión |
|---|---|
| Organización del código | **Monorepo con npm workspaces** |
| Momento del refactor | **Incremental, en commits pequeños y reversibles** |
| Hosting frontend | **Diferido** (se evaluará más adelante; posible uso de DNS en GoDaddy) |
| Renderizado | **Estático (SSG) inicialmente**, con estructura preparada para migrar a híbrido |
| Acceso a datos del frontend | **Data API de Supabase directa con clave publishable**, documentando cómo migrar a una capa intermedia en el futuro |
| Alcance visual MVP | **MVP simplificado** |
| IaC futura (CDK/Terraform) | **No se implementa ahora**; se reserva `infra/` para el futuro |
| Estrategia de tests | **Co-ubicados por paquete/proyecto interno** |

Estas decisiones son la base del diseño. El agente `designer` debe respetarlas y
solo proponer alternativas si detecta un conflicto técnico real, deteniéndose
para que el TL/PO resuelva.

## 3. Principios de diseño estructural

### Preparado para dejar de ser monorepo

Cada proyecto interno (workspace) debe comportarse como si algún día fuera su
propio repositorio:

- **Frontera explícita:** cada paquete declara sus dependencias en su propio
  `package.json`. Nada se importa por rutas relativas que crucen la raíz de otro
  paquete (`../../otro-paquete/src/...`). Se importa por el **nombre del
  paquete** (`@mishow/domain`).
- **Sin dependencias circulares** entre paquetes. El grafo debe ser un árbol
  dirigido: `apps` y `scrapers` dependen de `packages`, nunca al revés.
- **Contratos como frontera:** lo que se comparte entre proyectos vive en un
  paquete de contratos/dominio, no se duplica ni se importa desde el interior de
  otro proyecto.
- **Extracción trivial:** mover un workspace a un repo aparte debe requerir solo
  copiar su carpeta, publicar los paquetes de los que depende (o versionarlos), y
  ajustar la instalación. Ningún archivo de configuración global debe esconder
  lógica propia de un solo proyecto.

### Compatible con el despliegue futuro

- Cada unidad desplegable (frontend, scraper programado, futura API) es un
  **workspace independiente** con su propio punto de entrada y build.
- La carpeta `infra/` queda **reservada y documentada** aunque vacía, para alojar
  IaC (CDK o Terraform) sin renombrar nada después.
- Los artefactos de build de cada app deben poder generarse por separado
  (`build` por workspace), condición necesaria para pipelines de despliegue
  independientes.

### Orden por proyectos internos

- Un desarrollador o agente debe poder ubicar cualquier pieza por su carpeta sin
  leer código: `apps/` (lo que se despliega y ve el usuario), `packages/` (lo
  compartido y reutilizable), `scrapers/` (adquisición por fuente),
  `supabase/` (esquema), `infra/` (despliegue futuro), `docs/`.
- Tests co-ubicados con el código que prueban, dentro de cada workspace.

### Costo cero e incremental (heredado del brief base)

- No adoptar herramientas que impliquen costo o servidores permanentes en esta
  etapa.
- El refactor se hace por partes: en cada commit el repo debe seguir con
  `typecheck`, `lint` y `test` en verde.

## 4. Estructura objetivo propuesta

Estructura destino al final de la Etapa 1. El agente `designer` debe validarla
contra el código actual y ajustar nombres antes de implementar.

```text
mishow/
├── package.json                 # raíz: workspaces + scripts orquestadores
├── tsconfig.base.json           # config TS compartida (paths de workspaces)
├── apps/
│   └── web/                     # Next.js (SSG inicial, preparado para híbrido)
│       ├── package.json
│       ├── app/ o pages/
│       └── ...tests co-ubicados
├── packages/
│   ├── domain/                  # @mishow/domain: contratos NormalizedEvent, tipos catálogo
│   ├── catalog-client/          # @mishow/catalog-client: acceso de LECTURA a la Data API pública
│   └── persistence/             # @mishow/persistence: escritura idempotente (hoy en src/puntoticket/persistence)
├── scrapers/
│   └── puntoticket/             # @mishow/scraper-puntoticket: adquisición + extracción + normalización
├── supabase/
│   ├── migrations/
│   └── tests/
├── infra/                       # RESERVADO para IaC futura (CDK/Terraform). Con README explicativo.
├── docs/
└── .github/workflows/           # CI + cron de scraping (se define en su propio hito)
```

Notas:

- Los nombres de paquetes usan el scope `@mishow/*` para dejar lista una eventual
  publicación privada o migración a repos separados.
- `catalog-client` (lectura pública) y `persistence` (escritura privilegiada)
  quedan **separados a propósito**: el frontend nunca debe poder importar la ruta
  de escritura ni sus credenciales.

## 5. Mapa de migración desde la estructura actual

Estado actual (plano):

```text
src/
  cli/{puntoticket-listing,puntoticket-detail,puntoticket-scrape}.ts
  puntoticket/{acquisition,extraction,persistence,contracts,normalization,time,url}.ts
tests/            # tests centrales
supabase/
docs/
```

Correspondencia sugerida (a confirmar por `designer`):

| Hoy | Destino |
|---|---|
| `src/puntoticket/{acquisition,extraction,normalization,contracts,time,url}` | `scrapers/puntoticket/src/` |
| `src/puntoticket/persistence/*` | `packages/persistence/src/` |
| Tipos compartidos (`contracts.ts`, tipos del catálogo) | `packages/domain/src/` |
| `src/cli/*` | `scrapers/puntoticket/src/cli/` (o un workspace `apps/scraper-cli`) |
| `tests/*` | co-ubicados en cada workspace |
| `supabase/` | se mantiene en la raíz (esquema transversal) |

El `designer` decide si `domain` y `persistence` se separan en esta etapa o si
`persistence` permanece dentro del scraper hasta que exista un segundo
consumidor. Criterio: no crear paquetes sin al menos un consumidor real, pero sí
dejar el límite de importación claro.

## 6. Frontend (apps/web)

### Alcance del MVP simplificado

Incluido:

- Listado de eventos leyendo la vista pública `catalog_events_v1`.
- Detalle de un evento (artistas, recinto, funciones, precios, enlace a la
  ticketera original mediante `purchase_url`).
- Búsqueda/filtro **básico** en cliente (por nombre; filtros avanzados quedan
  fuera).
- Estados de carga, vacío y error.
- Diseño mobile-first y accesible.

Fuera de alcance en esta etapa:

- Autenticación, favoritos, alertas, notificaciones.
- Paginación server-side compleja, filtros facetados.
- SSR/ISR (se habilita al migrar a híbrido, no ahora).

### Renderizado

- **SSG** como modo inicial: la web se genera estática y consume el catálogo.
- La estructura del proyecto (organización de rutas, capa de datos aislada en
  `catalog-client`) debe permitir **cambiar a híbrido** (SSR/ISR) sin reescribir
  componentes. El `designer` debe documentar explícitamente qué habría que tocar
  para esa migración.

### Acceso a datos

- El frontend consume la **Data API de Supabase directamente** con la **clave
  publishable** (solo lectura, protegida por RLS ya existente sobre
  `catalog_events_v1`).
- Todo el acceso a datos se encapsula en `@mishow/catalog-client`. Ningún
  componente llama a `fetch` de Supabase directamente.
- **Documentar la ruta de migración futura** a una capa intermedia (Cloudflare
  Worker u otra API): qué cambia, qué permanece igual, por qué se haría (ocultar
  estructura, componer consultas, caché, rate limiting). Como `catalog-client`
  es la única frontera de datos, migrar significaría cambiar su implementación
  sin tocar la UI.

### Seguridad

- Solo la clave **publishable** llega al navegador. Nunca `SUPABASE_SECRET_KEY`
  ni tokens privados.
- Las variables públicas del frontend se documentan en `.env.example` del
  workspace `apps/web`, con valores ficticios.

## 7. Estrategia de ejecución incremental

El refactor se hace en commits pequeños; el repo queda verde en cada paso.

**Hito A — Habilitar workspaces sin mover código.**
Configurar npm workspaces y `tsconfig.base.json` con el `src/` actual convertido
en el primer workspace, o convivir temporalmente. Verificación: `qa` en verde.

**Hito B — Extraer `domain` y `persistence`.**
Mover contratos compartidos y la persistencia a `packages/`, ajustando imports a
`@mishow/*`. Verificación: tests de persistencia y normalización en verde.

**Hito C — Reubicar el scraper.**
Mover adquisición/extracción/normalización/CLI a `scrapers/puntoticket/`.
Verificación: CLI `--persist` sigue funcionando; suite completa en verde.

**Hito D — Andamiaje de `apps/web`.**
Crear el workspace Next.js y `@mishow/catalog-client`; conectar el listado a
`catalog_events_v1` contra el entorno local o remoto. Verificación: build
estático del frontend + typecheck.

**Hito E — MVP simplificado.**
Detalle de evento, búsqueda básica, estados de UI, accesibilidad mobile-first.

**Hito F — `infra/` reservado y documentación.**
Crear `infra/README.md` explicando su propósito y la decisión de IaC diferida.
Actualizar `docs/` y `README.md`.

Cada hito puede ser uno o varios commits. Ningún hito debe dejar el repo roto.

## 8. Compatibilidad con despliegue futuro (documentar, no implementar)

El `designer`/`dev` deben dejar por escrito, sin construirlo aún:

- Cómo se construye cada unidad desplegable por separado (`build` por workspace).
- Qué workspace corresponde a cada destino previsto: `apps/web` → hosting
  estático/híbrido; `scrapers/puntoticket` → cron (GitHub Actions ahora, Fargate
  después); futura API → `infra/`.
- Qué se necesitaría para separar un workspace en su propio repositorio.
- Ruta de migración de acceso a datos directo → capa intermedia.

## 9. Tests

- **Co-ubicados por workspace** (junto al código que prueban), no en un `tests/`
  central.
- Los tests existentes de Etapa 0 deben **seguir pasando** tras cada movimiento,
  reubicados en su workspace correspondiente.
- El frontend incluye, como mínimo, pruebas de la capa `catalog-client` (mapeo de
  la respuesta del catálogo) sin requerir red real, y una prueba de render básica
  del listado.
- La suite raíz (`npm run qa` o equivalente con workspaces) debe ejecutar los
  tests de todos los workspaces.

## 10. Restricciones

- No introducir costo ni servidores permanentes en esta etapa.
- No implementar autenticación, IaC, ni la capa intermedia de datos (solo
  documentar su migración).
- No romper el flujo de scraping/persistencia existente.
- No exponer secretos al navegador ni versionar `.env` ni `.kiro/settings/mcp.json`.
- No decidir el hosting definitivo aquí (queda diferido).
- Cambios pequeños y reversibles; cada commit deja el repo en verde.

## 11. Decisiones que debe resolver `designer` (modo lectura, sin editar)

1. Layout exacto de workspaces y nombres `@mishow/*` definitivos.
2. Si `persistence` y `domain` se separan ya o `persistence` espera un segundo
   consumidor.
3. Herramienta de workspaces: npm workspaces puro vs. añadir un orquestador
   (evaluar si es necesario; preferir lo mínimo).
4. Estructura de rutas de Next.js compatible con la futura migración a híbrido.
5. Forma de tipar la respuesta de `catalog_events_v1` en `domain` y reutilizarla
   en `catalog-client` y `apps/web`.
6. Estrategia de configuración de TS entre workspaces (`references`, `paths`).
7. Plan concreto de commits por hito (§7) con verificación por paso.
8. Riesgos del refactor y orden que minimiza el tiempo en rojo.

No modifica archivos. Presenta todo al TL/PO antes de `dev`.

## 12. Criterios de aceptación

- El repo es un monorepo con npm workspaces, con `apps/`, `packages/`,
  `scrapers/`, `supabase/`, `infra/` y `docs/` claramente delimitados.
- Cada workspace tiene su `package.json`, declara sus dependencias y se importa
  por nombre `@mishow/*`; no hay imports que crucen carpetas de otros paquetes ni
  dependencias circulares.
- Cada unidad desplegable puede construirse por separado.
- `infra/` existe, está vacío de implementación y tiene un README que explica su
  propósito y la decisión de IaC diferida.
- El frontend `apps/web` renderiza estáticamente el listado y el detalle desde
  `catalog_events_v1`, con búsqueda básica y estados de UI, mobile-first.
- El acceso a datos está aislado en `@mishow/catalog-client`; solo la clave
  publishable llega al navegador.
- Existe documentación de: cómo migrar SSG → híbrido, cómo migrar acceso directo
  → capa intermedia, y cómo separar un workspace en un repo aparte.
- Tests co-ubicados por workspace; todos los tests de Etapa 0 siguen pasando.
- `typecheck`, `lint` y `test` en verde a nivel raíz y por workspace.
- Documentación (`docs/` y `README.md`) actualizada.
- QA emite `VEREDICTO QA: APROBADO`.

## 13. Entregables

- Configuración de workspaces (raíz `package.json`, `tsconfig.base.json`).
- Workspaces `packages/domain`, `packages/catalog-client`,
  `packages/persistence` (según decisión de `designer`).
- Workspace `scrapers/puntoticket` con el scraper y su CLI reubicados.
- Workspace `apps/web` (Next.js) con el MVP simplificado.
- `infra/README.md` reservando la carpeta.
- Tests co-ubicados; suite raíz que corre todo.
- `.env.example` del frontend con la variable publishable ficticia.
- Documentación de migración (SSG→híbrido, datos directos→intermedios,
  monorepo→repos separados).
- Actualización de `README.md` y `docs/decisiones-tecnicas.md` (cerrar
  "Organización del código" y "Renderizado frontend").
- Reporte QA.

## 14. Flujo de agentes

### Paso 1 — `designer` (solo lectura)
Entrega: layout de workspaces, grafo de dependencias entre paquetes, plan de
commits por hito con verificación, estructura de `apps/web` compatible con
híbrido, tipado del catálogo compartido, decisiones pendientes y riesgos. No
edita archivos.

### Paso 2 — Aprobación TL/PO
Aprueba layout definitivo, nombres de paquetes, alcance del MVP, y el plan
incremental de commits.

### Paso 3 — `dev`
Implementa por hitos (§7), commits pequeños y reversibles, manteniendo el repo en
verde. Reubica tests, crea el frontend, documenta migraciones.

### Paso 4 — `qa`
Verifica fronteras de importación, ausencia de dependencias circulares, builds
por workspace, separación lectura/escritura, seguridad de claves, regresiones de
Etapa 0, funcionamiento del MVP y documentación. Prueba casos adversos.

## 15. Verificación

```bash
npm install
npm run qa            # typecheck + lint + test agregados de todos los workspaces
# build por workspace (nombres a confirmar por designer):
npm run build -w apps/web
npm run build -w scrapers/puntoticket
git diff --check
```

Con Supabase local o remoto disponible, validar manualmente que el listado y el
detalle del frontend muestran datos reales de `catalog_events_v1`.

## 16. Notas

- Esta etapa cierra dos decisiones abiertas de `docs/decisiones-tecnicas.md`:
  "Organización del código" (→ monorepo con workspaces) y "Renderizado frontend"
  (→ estático inicial, preparado para híbrido). Registrarlas allí al finalizar.
- El hosting definitivo y la IaC siguen abiertos a propósito; su preparación
  estructural queda lista para no repetir reorganizaciones.
