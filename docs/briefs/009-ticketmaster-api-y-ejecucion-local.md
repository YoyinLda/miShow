# Brief 009 — Ticketmaster: Discovery API, runner local y canal de retiro de contenido

Estado: propuesto (2026-11-14).

## Contexto

- Ticketmaster responde `HTTP 403` cuando el scraper corre desde GitHub Actions (IP de datacenter). Desde una IP local funciona. La fuente aporta 97 de 280 eventos.
- El brief 008 desactivó el cron y dejó solo la ejecución manual.
- No hay registro de que la API oficial se haya evaluado antes.

## Decisiones TL/PO (2026-11-14)

1. **Se ajusta la regla D4 del brief 008.** Correr el scraper desde una IP local o residencial está permitido: la premisa del proyecto siempre fue scrapear de forma responsable, con el objetivo de llegar a convenios de API. Las reglas de responsabilidad se mantienen:
   - Ritmo bajo: concurrencia 1–2, delay con jitter y tope de solicitudes por corrida.
   - User-Agent honesto. No se rotan IPs, no se usan proxies residenciales de terceros ni se resuelven CAPTCHAs.
   - No se reintentan 401 ni 403. Si aparece un 403 también desde la IP local, la corrida se detiene y queda `failed`.
   - Solo se leen páginas públicas de listado y detalle de música.
2. **La Discovery API se evalúa primero.** Es un endpoint oficial con API key (`app.ticketmaster.com`) y no debería tener el bloqueo de IPs de datacenter que tiene el sitio web, así que puede correr desde GitHub Actions. Esto se confirma en la entrega A. Si la cobertura de Chile es suficiente, la API pasa a ser la fuente principal y el runner local queda solo para el scraper de respaldo.
3. **Se abre un canal de retiro de contenido**, con notificación y una respuesta en menos de 24 h. Lo exigen los términos de la API y sirve igual para el scraping responsable de cualquier fuente.

## Entregas

### A. Evaluación de la Discovery API (va primero)
- [ ] Registrar una app en developer.ticketmaster.com y obtener la key. Se guarda como secreto `TICKETMASTER_API_KEY` y nunca se commitea.
- [ ] Hacer una llamada de prueba desde un workflow de GitHub Actions para confirmar que no hay 403 desde datacenter.
- [ ] Consultar `GET /discovery/v2/events.json?countryCode=CL&classificationName=music&size=200`, paginando hasta cubrir todo el resultado.
- [ ] Comparar contra los eventos de Ticketmaster en la base: cuántos coinciden, cuántos faltan en cada lado, y la calidad de fechas, horas (America/Santiago), recintos, imágenes y URL de compra (¿apunta a ticketmaster.cl?).
- [ ] Informe con una recomendación: API como fuente principal, como complemento o descartada.

### B. Runner local (si A no cubre lo suficiente, o para el scraper de respaldo)
- [ ] Self-hosted runner de GitHub Actions en una Raspberry Pi 5, con label `local-ip`. Ver la cotización más abajo.
- [ ] `scrape-ticketmaster.yml` corre con `runs-on: [self-hosted, local-ip]`. Se reactiva el cron y se mantienen las alertas del brief 008.
- [ ] El runner solo acepta workflows de `main`. Como el repo es público, los PR de forks no se ejecutan en tu red.
- [ ] Guía de instalación: Raspberry Pi OS Lite de 64 bits, Node LTS, Playwright Chromium en ARM64 si hace falta, el runner como servicio systemd, actualizaciones automáticas de seguridad y acceso por SSH con llave.

### C. Canal de retiro de contenido
- [ ] Link «Contacto y retiro de contenido» en el footer, que lleva a la página `/contacto` con un formulario: nombre, organización, correo, URL del evento en miShow y motivo.
- [ ] Tabla `content_requests` en Supabase con RLS de solo inserción para el rol `anon`, rate limit y captcha liviano (Cloudflare Turnstile, que es gratuito).
- [ ] Notificación inmediata: una Database Webhook o Edge Function envía un correo al TL y abre un issue en GitHub con el label `retiro-contenido`.
- [ ] Mecanismos para retirar contenido:
  - `events.hidden_at`, para ocultar un evento puntual. Las vistas públicas lo filtran.
  - Kill switch por fuente, `sources.enabled = false`, para ocultar todo el contenido de una ticketera en minutos.
- [ ] Un correo de contacto visible en el footer, como alias dedicado. Hoy el sitio vive en `pages.dev`, así que sirve uno de Gmail mientras no haya dominio.
- [ ] Política de privacidad breve en el footer, porque los términos de la API lo exigen: qué datos se recogen (formulario y analítica si la hay) y para qué.
- [ ] Runbook de 24 h: recibir la solicitud, ocultar el contenido, responder y cerrar el issue.

## Condiciones de la API (investigadas el 2026-11-14)

| Tema | Detalle |
|---|---|
| Obtención | Registro gratuito en el portal; la key queda disponible de inmediato |
| Cuota | 5.000 llamadas al día. El rate por segundo aparece como 5/s en Getting Started y 2/s en la FAQ: usar 2/s |
| Al exceder | `429` con `policies.ratelimit.QuotaViolation`. Headers `Rate-Limit`, `Rate-Limit-Available`, `Rate-Limit-Reset` |
| Más cuota | Se aprueba caso a caso: exige cumplir los términos y la guía de marca y representar bien los datos. Alternativa: Discovery Feed para socios (sin límite, se actualiza cada hora) |
| Paginación | `size * page < 1000`. Si hay más resultados, hay que partir la consulta por rango de fechas |
| Caché | Solo se permite guardar por "periodos razonables", sin un plazo definido. Si piden retirar contenido, hay que hacerlo en 24 h (ver la entrega C) |
| Restricciones | No replicar ni reemplazar la experiencia de Ticketmaster.com, no afectar la estabilidad de sus servidores, no usar sus imágenes como hosting de publicidad. Pueden cortar la key en cualquier momento |
| Monetización | El programa de afiliados (Impact) incluye Chile: paga comisión por ventas reales, salvo en presales y las primeras 24 h de un onsale. Se postula en el formulario de afiliados y las consultas van a devportalinquiry@ticketmaster.com |
| Privacidad | Hay que declarar en la política de privacidad o el footer cómo se recogen y usan los datos |

## Cotización del dispositivo (entrega B)

Precios de MCI Electronics vendidos en Falabella.com, consultados el 2026-11-14, en CLP con IVA.

| Ítem | Opción | Precio |
|---|---|---|
| **Recomendada: Kit Raspberry Pi 5 de 4 GB con accesorios originales** (placa, fuente oficial de 27 W, carcasa con ventilador y microSD) | Suficiente para Node y un Chromium headless con concurrencia 1–2 | **$231.990** |
| Alternativa: Kit Pi 5 de 4 GB con memoria y transformador (sin carcasa) | Más barato, pero hay que sumar la carcasa con ventilador oficial ($15.990) | $219.690 + $15.990 = $235.680 |
| Margen extra: Kit Pi 5 de 8 GB con accesorios originales | Solo si después corren más scrapers con Playwright en paralelo | $346.990 |
| Opcional: M.2 HAT para Pi 5 + SSD NVMe de 128–256 GB | Más vida útil que la microSD con escrituras frecuentes. Precio del SSD por cotizar | $26.990 + SSD |
| Cable de red | Se recomienda Ethernet en vez de WiFi | Por cotizar (si no tienes uno) |

**Costo operativo:** la Pi 5 consume alrededor de 5 W en promedio, unos 3,6 kWh al mes. Con la tarifa de Enel en Providencia (~$240/kWh) son **menos de $1.000 al mes**. Internet: el que ya tienes.

**Alternativa sin costo:** usar como runner un equipo que ya tengas mientras se decide. El problema es que tiene que estar encendido a la hora del cron (09:00 y 19:00).

**Total estimado de partida: ~$232.000**, más el SSD y el cable si se suman.

## Implicancias para miShow

- 5.000 llamadas al día alcanzan de sobra: con 2 corridas al día y unas pocas páginas de 200 eventos cada una, el uso es mínimo.
- Guardar en Postgres y refrescar 2 veces al día calza con "periodos razonables". El canal de la entrega C cubre la obligación de retirar contenido en 24 h.
- El aviso de redirección a la ticketera separa a miShow de "replicar la experiencia de Ticketmaster".
- Camino hacia un convenio: API, luego el afiliado y después el Discovery Feed.

## Verificación

- A: informe de cobertura con números, una muestra de 10 eventos comparados campo a campo y una llamada exitosa desde GitHub Actions.
- B: 3 corridas programadas seguidas sin 403 desde el runner, alertas funcionando y ritmo dentro de los topes.
- C: una solicitud de prueba genera el correo y el issue, y un evento se oculta y vuelve a mostrarse con `hidden_at`.

## Fuera de alcance

- Implementar el adapter de la API: queda para un brief posterior si la evaluación sale positiva.
- Otras fuentes en el runner local, salvo que también lo necesiten.
