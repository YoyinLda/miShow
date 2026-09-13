# Brief 002 — Correcciones Ticketmaster: imagen, precios y documentación

- **Estado:** Completado (7/7). Decisiones D1–D4 con opciones recomendadas.
- **Fecha:** 2026-09-13
- **Depende de:** Brief 001 (fuente Ticketmaster + multi-fuente), ya completado.

---

## 1. Contexto y problema

Tras persistir Ticketmaster en cloud se detectaron pendientes:

1. **Documentación:** el README y la doc de operación/persistencia no mencionan
   Ticketmaster ni cómo ejecutar su persistencia (solo PuntoTicket).
2. **Imagen no persiste:** en la DB, Ticketmaster tiene **0/60** eventos con
   `image_url` (PuntoTicket 48/48).
3. **Precios/otros datos faltantes:** Ticketmaster tiene **39/60** con precio
   (21 sin precio).

## 2. Investigación (verificada con curl + consultas a cloud, 2026-09-13)

Conteos reales en `public.events` (join `sources`):

| source | total | con_imagen | con_precio | status_unknown |
|---|---|---|---|---|
| puntoticket | 48 | 48 | 48 | 33 |
| ticketmaster | 60 | 0 | 39 | 60 |

### 2.1 Imagen (corregible)
- El JSON-LD de Ticketmaster trae **`"image": null` siempre**. El extractor común
  (`extractJsonLdDetail` → `image(event.image)`) solo mira el JSON-LD, por eso 0/60.
- Pero **`<meta property="og:image">` sí trae la imagen del evento** en todos los
  detalles inspeccionados (robbie-williams, iron-maiden, las-migas):
  `https://cdn.getcrowder.com/images/...jpg`.
- **Conclusión:** leer `og:image` como fuente de imagen para Ticketmaster
  resuelve el 100% de los casos observados.

### 2.2 Precios (límite de la fuente, no bug)
- Cuando el JSON-LD trae `offers` con `price`/`priceCurrency`, el extractor ya
  los captura correctamente (los 39/60; ej. Myriam Hernández 21.000–100.000 CLP).
- Los 21 sin precio tienen **`offers: []`** en el JSON-LD server-rendered; el
  precio no está en el HTML (se carga por JS/API aparte). **No es un defecto del
  scraper:** es un dato que la fuente no expone en la primera respuesta.
- **Conclusión:** no forzamos precios inexistentes. La UI ya maneja la ausencia
  de precio de forma amable (regla de producto). Solo se documenta el límite.
- Mejora menor detectada: algunos eventos traen `startDate`/`endDate` en JSON-LD
  (mejor que derivar de `description`); el extractor ya prioriza `startDate`.

### 2.3 Estado del código
- `scrapers/core/src/extraction/jsonld.ts`: `extractJsonLdDetail(detail, options,
  hooks)` ya acepta hooks (`descriptionDate`). Recibe `detail.html`, así que puede
  soportar un hook `fallbackImage(html)` sin romper a PuntoTicket.
- `scrapers/ticketmaster/src/extraction/detail.ts`: pasa los hooks; aquí se
  implementaría `fallbackImage` leyendo `og:image`.

## 3. Decisiones a validar con TL/PO

- **D1. Fuente de imagen para Ticketmaster.**
  - (a) Hook `fallbackImage(html)` en el core que Ticketmaster implementa con
    `og:image` (fallback solo cuando el JSON-LD no trae imagen válida). *(recomendada)*
  - (b) Extraer imagen en el adaptador de Ticketmaster por fuera del core.
- **D2. Precios faltantes (21/60).**
  - (a) Aceptar el límite de la fuente: no perseguir el JS/API de precios ahora;
    documentar y dejar que la UI muestre "precio no disponible". *(recomendada)*
  - (b) Investigar la API interna de precios de Ticketmaster (más trabajo, más
    frágil, más carga a la fuente). Fuera de alcance salvo que TL/PO lo pida.
- **D3. Re-persistencia tras el fix.**
  - (a) Volver a correr `ticketmaster:scrape --persist` para poblar las imágenes
    (el upsert es idempotente; `image_url` se completará). *(recomendada)*
  - (b) Dejar que el próximo cron lo actualice solo.

## 4. Solución propuesta (diseño)

1. **Core:** añadir hook opcional `fallbackImage?: (html: string) => string | undefined`
   a `extractJsonLdDetail`. Si `image(event.image)` no da resultado y hay
   `fallbackImage`, usarlo con `detail.html`. Validar que sea HTTPS. No afecta a
   PuntoTicket (no pasa el hook).
2. **Ticketmaster:** implementar `fallbackImage` leyendo
   `meta[property="og:image"]` (y `twitter:image` como respaldo), validando HTTPS.
   Pasarlo junto a `descriptionDate`.
3. **Tests:** fixture de detalle Ticketmaster con `image:null` en JSON-LD +
   `og:image` presente → el extractor devuelve la imagen. Caso sin `og:image` →
   sin imagen (no rompe). PuntoTicket sin cambios.
4. **Documentación:**
   - README: sección de scrapers menciona ambas fuentes y comandos
     `ticketmaster:*`; nota de que el precio puede faltar cuando la fuente no lo
     expone.
   - `docs/operacion-scraping-cron.md`: documentar el cron de Ticketmaster.
   - Doc de persistencia: cómo ejecutar la persistencia de Ticketmaster
     (`ticketmaster:scrape --live --persist`), o un doc `docs/operacion-persistencia-fuentes.md`
     genérico multi-fuente. (Ver D4.)
5. **Re-persistencia** (D3=a): correr Ticketmaster `--persist` para completar
   imágenes; verificar `con_imagen` en cloud.

- **D4. Ubicación de la doc de persistencia multi-fuente.**
  - (a) Generalizar/renombrar el enfoque a un doc multi-fuente y enlazar desde
    los específicos. *(recomendada)*
  - (b) Añadir una sección de Ticketmaster en la doc existente de PuntoTicket.

## 5. Checklist de tareas

> Estado: `[ ]` pendiente · `[x]` hecho.

- [x] **T1.** D1–D4 cerradas con opciones recomendadas (a).
- [x] **T2.** Core: hook `fallbackImage(html)` en `extractJsonLdDetail` (usa
  `jsonLdImage ?? fallback` validado HTTPS). Sin impacto en PuntoTicket.
- [x] **T3.** Ticketmaster: `imageFromMeta` lee `og:image`/`og:image:secure_url`/
  `twitter:image`. Tests: fallback, prioridad JSON-LD y `imageFromMeta`. 14/14 verdes.
- [x] **T4.** Verificación: `npm run qa` verde (PuntoTicket 101, Ticketmaster 14,
  web 10, catalog-client 9). Prueba `--live` (MAX_EVENTS=4): 4/4 con `image_url`.
- [x] **T5.** Documentación: README (CLIs de ambas fuentes, persistencia
  multi-fuente, nota de precios e imagen) y cron de Ticketmaster en
  `operacion-scraping-cron.md`.
- [x] **T6.** Re-persistencia (run 7, succeeded, 60/60). En cloud:
  Ticketmaster **con_imagen 60/60** (antes 0), con_precio 39/60 (límite de fuente).
- [x] **T7.** Brief e índice de `docs/briefs/` actualizados con evidencia.

## 6. Verificación (definición de terminado)

- `npm run typecheck`, `lint`, `test` verdes; PuntoTicket sin regresiones.
- Nuevos tests de imagen de Ticketmaster (con/sin `og:image`).
- Prueba `--live` Ticketmaster con `image_url` presente en el JSON de salida.
- Tras `--persist`: `con_imagen` de Ticketmaster ≈ total en cloud.
- Precios: documentado el límite de la fuente; sin inventar valores.
- README y docs de operación/persistencia actualizados; diff claro.

## 7. Notas

- No se sigue `purchase_url`; sin cookies; throttling responsable.
- La ausencia de precio en 21 eventos es un límite de la fuente, no un fallo del
  scraper. La UI ya lo maneja con la regla "mostrar amablemente cuando falta".
