# Brief 008 — Salud del catálogo (Etapa 0)

Estado: en curso (2026-11-14).

## Diagnóstico (producción, 2026-11-14)

- **Ticketmaster:** 35 de 63 corridas fallaron en 30 días con `HTTP 403` en el listado (bloqueo de la fuente). El error se registra como `global_acquisition_failure` genérico y la última corrida buena fue el 2026-11-13. Aporta 97 de 280 eventos.
- **Eventos pasados:** 80 eventos visibles en el catálogo ya no tienen funciones futuras.
- **PuntoTicket `partial`:** viene de `ambiguous performance purchase mapping` en un evento deportivo, que ya está oculto desde el brief 007. Además hay 42 `HTTP 404` por corrida desde páginas de venue candidatas que se marcan `not_found`. No afectan el estado, pero ensucian `scrape_errors`.
- **Alertas:** una corrida `failed` deja el workflow en rojo, y GitHub avisa por correo a quien programó el cron. Una corrida `partial` queda en verde.

## Decisiones TL/PO

1. **Ticketmaster:** se desactiva la ejecución programada y se mantiene la ejecución manual (`workflow_dispatch`). Por un tiempo se correrá localmente. Se completa el bugfix `.kiro/specs/ticketmaster-scrape-failures` con sus defaults:
   - D1: `partial` si el 25% o más de los detalles falla, `failed` si falla el 75% o más.
   - D2: `listing_empty` con 0 referencias, `listing_degraded` con menos de 10.
   - D3: `failed` sale con código 1; `partial` sale con 0 y deja una anotación `::warning::`.
   - D4: no se cambian headers ni User-Agent; no se eluden bloqueos.
   - D5: no se reintentan 401/403; sí 408, 429 y 5xx, con jitter.
2. **Eventos pasados:** se ocultan de los listados (Home, `/eventos`, artista, venue). El detalle sigue accesible y avisa «Este evento ya pasó».
3. **Alertas:** si una fuente falla 2 corridas seguidas, el workflow abre un issue en GitHub, o lo actualiza si ya existe. El issue se cierra cuando la fuente se recupera. Una corrida `partial` deja `::warning::`.

## Entregas

- [x] **A. Ticketmaster:** schedule desactivado, bugfix (tareas 3.1–3.9, 4 y 5 del spec) y guía de ejecución local. Con esto `npm run qa` vuelve a pasar.
- [x] **B. Eventos pasados:** filtro en los listados y aviso en el detalle.
- [ ] **C. Alertas:** issue tras 2 fallas seguidas, aplicado a las dos fuentes.
- [ ] **D. Ruido de PuntoTicket:** que los 404 de venues candidatas no se registren como error.

## Verificación

Typecheck, lint y tests en verde, incluidos los 8 de bug-condition de Ticketmaster. Una corrida local de Ticketmaster documentada. Revisión del front a 390 y 1440 px.
