# miShow — Definición V1 y Roadmap Priorizado

**Estado:** propuesta de V1  
**Fecha:** 13 de septiembre de 2026  
**Proyecto:** miShow  
**Repositorio:** `YoyinLda/miShow`  
**Stack actual:** Next.js, Supabase, GitHub Actions, Cloudflare Pages, scrapers multi-fuente  
**Herramienta principal de desarrollo asistido:** Kiro  
**Backups:** Codex y GitHub Copilot  

---

## 1. Objetivo de esta V1

La V1 de miShow debe dejar de presentarse como un simple catálogo de conciertos y comenzar a expresar la visión de producto completa:

> **miShow es una plataforma para descubrir eventos y la escena que existe alrededor de ellos.**

El catálogo automatizado sigue siendo el motor del producto, pero la V1 debe incorporar suficientes señales de comunidad y escena independiente como para diferenciarse claramente de una agenda musical tradicional o de un sitio editorial como WalkingStgo.

La V1 no necesita implementar todavía una red social completa, pero sí debe demostrar tres capacidades:

1. **Descubrir eventos de múltiples fuentes.**
2. **Representar artistas, venues y eventos como entidades propias.**
3. **Permitir que la escena independiente pueda incorporarse al catálogo sin depender de una ticketera.**

---

## 2. Posicionamiento inicial

### Propuesta de valor

miShow debe responder rápidamente preguntas como:

- ¿Qué conciertos hay esta semana?
- ¿Qué toca cerca de mí?
- ¿Dónde compro la entrada?
- ¿Qué eventos tiene este artista?
- ¿Qué tocatas pequeñas hay este fin de semana?
- ¿Qué bandas locales puedo descubrir?
- ¿Qué está pasando en determinado venue?

### Diferenciador frente a agendas/editoriales

miShow no debe competir inicialmente por cantidad de reportajes o cobertura periodística.

Su ventaja debe ser:

**datos + descubrimiento + cobertura multi-fuente + participación de la comunidad.**

WalkingStgo puede seguir siendo una referencia editorial. miShow debe evolucionar hacia una plataforma estructurada.

---

## 3. Principios de producto para V1

### 3.1 Música primero

Aunque la arquitectura debe permitir múltiples categorías, la primera versión pública debe mantener una identidad clara:

**miShow V1 = música.**

El dominio debe permitir posteriormente:

- teatro;
- deportes;
- comedia;
- espectáculos familiares;
- festivales;
- otros.

Pero no es recomendable lanzar todas esas categorías desde el inicio.

### 3.2 Cobertura antes que profundidad editorial

La V1 debe priorizar:

- cobertura;
- búsqueda;
- filtros;
- artistas;
- venues;
- tocatas;
- información confiable.

Los artículos y reseñas son importantes para la visión, pero no deben retrasar los elementos anteriores.

### 3.3 Información honesta

No inventar datos ausentes.

Si una fuente no expone:

- precio;
- disponibilidad;
- horario;
- imagen;

la interfaz debe indicarlo de forma adecuada o simplemente omitir el campo.

Este principio ya existe en la implementación actual y debe mantenerse.

### 3.4 La fuente no define al evento

El producto debe evolucionar hacia eventos canónicos independientes de PuntoTicket, Ticketmaster o cualquier otra fuente.

Una fuente representa una observación o publicación de un evento, no el evento mismo.

---

# 4. Estado actual relevante

La base técnica existente permite avanzar hacia esta V1 sin rehacer el proyecto.

Actualmente existen:

- monorepo con npm workspaces;
- frontend Next.js;
- catálogo consultado mediante `@mishow/catalog-client`;
- persistencia en Supabase;
- scraper genérico multi-fuente mediante `@mishow/scraper-core`;
- adaptador PuntoTicket;
- adaptador Ticketmaster;
- aproximadamente 48 eventos PuntoTicket;
- aproximadamente 60 eventos Ticketmaster;
- catálogo combinado superior a 100 registros;
- cron mediante GitHub Actions;
- despliegue frontend mediante Cloudflare Pages;
- freshness por fuente;
- tests automatizados;
- política de no inventar precios o disponibilidad.

Esto significa que el principal riesgo de la siguiente etapa ya no es técnico.

El principal riesgo pasa a ser:

> **construir una experiencia de producto suficientemente diferenciada y útil.**

---

# 5. Arquitectura conceptual objetivo

La arquitectura debe diferenciar entre:

## 5.1 Ingesta externa

Ejemplos:

- PuntoTicket;
- Ticketmaster;
- futuras ticketeras;
- futuros feeds o APIs.

```text
PuntoTicket ─────┐
                 │
Ticketmaster ────┼────► scraper-core
                 │           │
Fuente futura ───┘           ▼
                        source_events
```

## 5.2 Catálogo canónico

```text
source_events
      │
      ▼
canonical events
      │
      ├── artists
      ├── venues
      ├── performances
      └── sources
```

## 5.3 Comunidad

```text
users
  │
  ├── community submissions
  ├── articles
  └── reviews
```

Las publicaciones de la comunidad deben terminar integrándose al mismo catálogo de eventos cuando corresponda.

---

# 6. Modelo de dominio recomendado

Antes de seguir agregando funcionalidades importantes, conviene evolucionar el modelo hacia entidades separadas.

## 6.1 Event

Representa el espectáculo canónico.

Ejemplos:

- Los Tres — Movistar Arena;
- Macha y El Bloque Depresivo;
- Festival X.

Debe ser independiente de la ticketera.

Campos conceptuales:

- `id`;
- `name`;
- `slug`;
- `category`;
- `subcategory`;
- `description`;
- `venue_id`;
- `status`;
- `image_url`;
- timestamps.

---

## 6.2 EventSource

Relaciona el evento canónico con su origen.

Ejemplo:

```text
Event EV123
 ├── PuntoTicket PT456
 └── Ticketmaster TM789
```

Campos conceptuales:

- `event_id`;
- `source`;
- `source_id`;
- `source_url`;
- `purchase_url`;
- `source_payload/reference`;
- `last_seen_at`.

Esta separación será crítica para la deduplicación multi-fuente.

---

## 6.3 Performance

Una misma producción puede tener varias funciones.

Campos:

- `event_id`;
- fecha;
- hora;
- timezone;
- disponibilidad;
- rango de precios cuando exista.

---

## 6.4 Artist

Entidad propia.

Campos posibles:

- nombre;
- slug;
- descripción breve;
- país/ciudad;
- género;
- imagen;
- Spotify;
- Instagram;
- YouTube;
- sitio web;
- estado de verificación.

Debe poder relacionarse con múltiples eventos.

---

## 6.5 Venue

Entidad propia.

Campos posibles:

- nombre;
- slug;
- dirección;
- comuna;
- ciudad;
- coordenadas;
- capacidad aproximada;
- sitio/Instagram;
- imagen.

Debe permitir descubrir eventos por recinto y ubicación.

---

## 6.6 CommunitySubmission

Permite ingresar eventos sin depender de una ticketera.

Estados sugeridos:

```text
draft
  ↓
submitted
  ↓
under_review
  ↓
approved
  ↓
published
```

Debe mantener trazabilidad del usuario que envió el contenido.

---

## 6.7 Article

Contenido generado por la comunidad o por editores.

Tipos posibles:

- reseña de concierto;
- reseña de disco;
- artículo sobre banda;
- entrevista;
- opinión;
- recomendación.

No es requisito completar un CMS complejo en V1.

---

# 7. Alcance funcional V1

## P0 — Obligatorio antes de lanzamiento público

Estas tareas definen la V1 mínima competitiva.

---

### P0.1 Modelo canónico de eventos multi-fuente

**Prioridad:** crítica

Crear separación entre:

- evento;
- fuente;
- función;
- artista;
- venue.

El objetivo es evitar que el catálogo dependa estructuralmente de registros individuales de ticketera.

#### Resultado esperado

Dos fuentes que describen el mismo evento pueden asociarse a un único evento canónico.

#### Comentario

Esta es la principal deuda estructural que conviene resolver antes de agregar muchas más fuentes o comunidad.

---

### P0.2 Deduplicación entre fuentes

**Prioridad:** crítica

Implementar una estrategia de matching progresiva.

Señales posibles:

- artista;
- venue;
- fecha/hora;
- nombre normalizado;
- ciudad;
- similitud textual.

Debe existir posibilidad de revisión manual cuando el matching no sea suficientemente seguro.

#### Importante

No aplicar deduplicación agresiva que pueda unir conciertos distintos.

---

### P0.3 Página de artista

**Prioridad:** muy alta

Ruta sugerida:

```text
/artistas/{slug}
```

Debe mostrar inicialmente:

- nombre;
- imagen;
- próximos eventos;
- venues asociados;
- links externos cuando existan.

No necesita todavía:

- biografía extensa;
- discografía completa;
- followers;
- estadísticas sociales.

---

### P0.4 Página de venue

**Prioridad:** muy alta

Ruta sugerida:

```text
/venues/{slug}
```

Debe mostrar:

- nombre;
- ubicación;
- próximos eventos;
- links externos;
- mapa o enlace de ubicación si existe.

---

### P0.5 Filtros útiles de catálogo

**Prioridad:** muy alta

La búsqueda actual debe evolucionar.

Filtros mínimos:

- fecha;
- comuna/ciudad;
- artista;
- venue;
- rango de precio cuando exista;
- eventos gratuitos;
- género musical cuando sea confiable.

Atajos de UX recomendados:

- Hoy;
- Este fin de semana;
- Próxima semana;
- Este mes.

---

### P0.6 Publicación de tocatas

**Prioridad:** crítica para diferenciación

Crear flujo para que una persona pueda enviar una tocata o evento independiente.

Información mínima:

- nombre del evento;
- artista/bandas;
- fecha;
- hora;
- venue;
- dirección;
- precio o gratuito;
- imagen;
- Instagram o sitio;
- link de venta si existe.

Debe existir moderación previa a publicación.

---

### P0.7 Sección “Escena local”

**Prioridad:** muy alta

Debe existir una sección visible desde la home.

Contenido inicial:

- tocatas próximas;
- bandas emergentes;
- venues pequeños;
- eventos publicados por la comunidad.

Esta sección debe hacer evidente, en pocos segundos, que miShow no es simplemente otra agenda de conciertos grandes.

---

### P0.8 Home orientada a descubrimiento

**Prioridad:** alta

La portada no debe limitarse a un listado cronológico.

Bloques sugeridos:

```text
Buscar artista, evento o venue

Próximos eventos

Este fin de semana

Tocatas

Bandas emergentes

Escena local

Explorar por venue
```

---

### P0.9 Login mínimo para contribuciones

**Prioridad:** alta

Usar Supabase Auth.

El login no debe ser obligatorio para navegar.

Debe ser necesario solo para:

- publicar tocatas;
- enviar artículos;
- futuras reseñas;
- administrar contenido propio.

---

### P0.10 Moderación básica

**Prioridad:** alta

No abrir publicación directa desde el primer día.

Debe existir:

- cola de contenido pendiente;
- aprobar;
- rechazar;
- editar;
- trazabilidad;
- usuario autor.

Inicialmente puede existir un único rol administrador/editor.

---

# 8. P1 — Muy recomendable para lanzamiento o inmediatamente después

---

## P1.1 Tercera fuente de eventos

Agregar una tercera ticketera después de resolver el modelo canónico.

Candidatos deben evaluarse según:

- cobertura real;
- dificultad técnica;
- estabilidad;
- términos de uso;
- cantidad de eventos no cubiertos por las fuentes actuales.

No agregar una tercera fuente solo para aumentar un número.

La pregunta debe ser:

> ¿Qué eventos nuevos aporta?

---

## P1.2 Perfiles reclamables de bandas

Permitir eventualmente:

> “¿Esta es tu banda? Reclamar perfil.”

No es imprescindible en P0, pero es muy importante para comunidad futura.

---

## P1.3 Artículos de comunidad

Implementación básica.

Una persona registrada puede:

- escribir;
- guardar borrador;
- enviar a revisión.

Tipos iniciales:

- reseña de disco;
- reseña de show;
- artículo sobre banda.

---

## P1.4 Página “Bandas emergentes”

Debe permitir descubrir artistas pequeños aunque todavía no tengan grandes eventos.

Posibles criterios:

- actividad reciente;
- próximos shows;
- contenido publicado;
- selección editorial inicial.

Evitar rankings automáticos complejos en esta etapa.

---

## P1.5 SEO estructurado

Implementar:

- rutas estables;
- metadata;
- Open Graph;
- Schema.org Event;
- Schema.org MusicGroup;
- sitemap;
- canonical URLs.

El catálogo puede generar mucho tráfico orgánico si las entidades están correctamente modeladas.

---

## P1.6 Analytics

Medir al menos:

- búsquedas;
- filtros utilizados;
- eventos abiertos;
- clicks hacia ticketera;
- vistas de artista;
- vistas de venue;
- submissions iniciadas/completadas.

No construir métricas complejas todavía.

---

# 9. P2 — Evolución posterior

Estas funcionalidades forman parte de la visión, pero no deben bloquear V1.

---

## P2.1 Reviews rápidas

Ejemplo:

```text
★★★★☆
Buen show, buen sonido, acceso lento.
```

Pueden coexistir con artículos largos.

---

## P2.2 Seguimiento de artistas

Permitir seguir artistas para posteriormente generar:

- recomendaciones;
- feed;
- notificaciones.

---

## P2.3 Seguimiento de venues

Útil para usuarios interesados en:

- Bar de René;
- Blondie;
- Movistar Arena;
- Teatro Caupolicán;
- salas independientes.

---

## P2.4 Feed personalizado

Basado en:

- artistas;
- géneros;
- venues;
- ubicación;
- historial.

No construir antes de tener suficiente actividad.

---

## P2.5 Reputación de usuarios

Puede permitir que usuarios confiables publiquen sin moderación previa.

Ejemplo:

```text
nuevo usuario
    ↓
requiere revisión

usuario confiable
    ↓
publicación simplificada
```

---

## P2.6 Categorías adicionales

Expansión futura:

- teatro;
- deportes;
- comedia;
- familiar;
- festivales;
- otros.

El esquema debe permitirlas desde antes, pero no es necesario llenar esas categorías en V1.

---

# 10. Lo que NO debe entrar en V1

Para evitar crecimiento descontrolado del alcance:

- pagos internos;
- marketplace propio de entradas;
- chat entre usuarios;
- mensajería privada;
- followers completos;
- feed social avanzado;
- notificaciones push;
- app móvil nativa;
- discografía completa;
- integración profunda con Spotify;
- gamificación;
- reputación compleja;
- recomendaciones mediante ML;
- comentarios anidados;
- eventos de todas las categorías;
- CMS editorial avanzado;
- venta directa para bandas.

Estas funcionalidades pueden reconsiderarse luego de validar uso real.

---

# 11. Roadmap propuesto

## Etapa 2A — Dominio y catálogo

### Objetivo

Preparar el modelo para el producto futuro.

### Tareas

1. diseñar modelo canónico;
2. migraciones Supabase;
3. separar `event` de `event_source`;
4. introducir `artist`;
5. introducir `venue`;
6. adaptar catalog-client;
7. migrar datos existentes;
8. deduplicar PuntoTicket/Ticketmaster;
9. mantener compatibilidad del frontend;
10. QA de regresión.

**Prioridad global:** P0.

---

## Etapa 2B — Descubrimiento

### Objetivo

Convertir el catálogo técnico en un producto útil para explorar.

### Tareas

1. búsqueda mejorada;
2. filtros;
3. páginas de artista;
4. páginas de venue;
5. home orientada a descubrimiento;
6. “Hoy / fin de semana / mes”;
7. SEO básico.

**Prioridad global:** P0.

---

## Etapa 2C — Escena independiente

### Objetivo

Crear el primer gran diferenciador público.

### Tareas

1. Supabase Auth;
2. formulario de tocata;
3. moderación;
4. incorporación al catálogo;
5. sección Escena local;
6. bandas emergentes;
7. venues pequeños.

**Prioridad global:** P0.

---

## Etapa 2D — Comunidad inicial

### Objetivo

Demostrar que miShow puede generar contenido más allá del catálogo.

### Tareas

1. Article;
2. editor básico;
3. drafts;
4. envío a revisión;
5. publicación;
6. asociación con artista/evento;
7. bloque de comunidad en home.

**Prioridad global:** P1.

---

## Etapa 2E — Cobertura y crecimiento

### Tareas

1. tercera fuente;
2. analytics;
3. perfiles reclamables;
4. mejoras SEO;
5. optimización de deduplicación;
6. automatización de moderación segura.

**Prioridad global:** P1.

---

# 12. Orden recomendado de implementación

Orden concreto:

```text
1. Modelo canónico
2. Migración de datos
3. Deduplicación multi-fuente
4. Artist
5. Venue
6. Adaptar catálogo
7. Filtros
8. Nueva home
9. Páginas Artist/Venue
10. Auth
11. CommunitySubmission
12. Moderación
13. Tocatas
14. Escena local
15. Articles
16. Tercera fuente
17. Analytics
18. Mejoras SEO
```

No comenzar los pasos 10–15 antes de estabilizar los primeros 6.

---

# 13. Estrategia de trabajo con IA

El proyecto actualmente utiliza:

1. **Kiro — herramienta principal**
2. **Codex — backup**
3. **GitHub Copilot — apoyo complementario**

Es importante evitar que cada herramienta genere sus propias convenciones.

Todas deben trabajar desde las mismas definiciones del repositorio.

---

## 13.1 Kiro

Debe ser la herramienta principal para:

- planificación de features;
- diseño técnico;
- implementación;
- refactors;
- generación de tests;
- actualización de documentación;
- ejecución de briefs;
- análisis mediante Codebase Memory.

Kiro debe tomar como fuente de verdad:

- documentación del repo;
- steering rules;
- skills;
- briefs;
- ADR/decisiones técnicas;
- esquema Supabase.

### Recomendación

Cada bloque importante del roadmap debe comenzar con un brief.

Ejemplo:

```text
docs/briefs/
003-modelo-canonico-eventos.md
004-artist-venue.md
005-filtros-descubrimiento.md
006-community-tocatas.md
007-articulos-comunidad.md
```

Cada brief debe contener:

- problema;
- alcance;
- fuera de alcance;
- modelo;
- contratos;
- migraciones;
- criterios de aceptación;
- pruebas;
- checklist.

---

# 14. Uso de Codebase Memory

Mantener enfoque **graph-first**.

Antes de hacer lecturas amplias del repositorio:

- buscar símbolos;
- revisar callers/callees;
- analizar impacto;
- limitar lecturas de archivos.

Objetivo:

- reducir consumo de tokens;
- reducir contexto innecesario;
- evitar modificaciones fuera del alcance.

Después de cambios estructurales importantes, verificar que el índice de Codebase Memory continúe representando correctamente el repo.

---

# 15. Codex como backup

Codex debe utilizarse principalmente cuando:

- Kiro tenga dificultades con una tarea;
- se necesite una segunda opinión;
- se quiera realizar revisión independiente;
- exista un bug difícil;
- se quiera comparar una solución arquitectónica;
- sea útil una revisión de PR.

Codex no debería mantener documentación paralela.

Debe consumir:

- `AGENTS.md`;
- briefs;
- documentación técnica existente;
- reglas compartidas.

No crear reglas equivalentes separadas solo para Codex salvo que una diferencia de runtime lo requiera.

---

# 16. GitHub Copilot

Copilot debe quedar como herramienta de asistencia local.

Uso recomendado:

- autocompletado;
- pequeñas funciones;
- tests sencillos;
- refactors locales;
- documentación inline;
- sugerencias mientras se programa manualmente.

No utilizarlo como principal responsable de:

- decisiones arquitectónicas;
- migraciones complejas;
- modelo de dominio;
- cambios cross-workspace;
- definición de producto.

---

# 17. Regla para evitar conflicto entre herramientas

La jerarquía debe ser:

```text
Documentación del proyecto
          ↓
Brief activo
          ↓
Decisiones técnicas
          ↓
Kiro
          ↓
Codex
          ↓
Copilot
```

Ningún asistente debe reemplazar silenciosamente una decisión documentada.

Si detecta una mejor alternativa, debe:

1. describirla;
2. explicar impacto;
3. pedir o registrar decisión;
4. modificar la documentación;
5. recién después implementar.

---

# 18. Convención recomendada para branches

Mantener features pequeñas y trazables.

Ejemplos:

```text
feat/canonical-events
feat/artists-venues
feat/catalog-filters
feat/community-submissions
feat/local-scene
feat/community-articles
```

Evitar ramas largas que contengan varias etapas de producto.

---

# 19. Definición de Done

Una feature no está terminada solamente porque funciona localmente.

Debe incluir, cuando aplique:

- código;
- typecheck;
- lint;
- tests;
- migración;
- documentación;
- actualización de brief;
- compatibilidad con catálogo;
- manejo de errores;
- accesibilidad básica;
- mobile;
- build;
- verificación manual.

---

# 20. Criterios de lanzamiento de V1

No publicar V1 hasta cumplir al menos:

### Datos

- PuntoTicket operativo;
- Ticketmaster operativo;
- eventos canónicos;
- deduplicación razonable;
- freshness funcionando.

### Producto

- búsqueda;
- filtros;
- página de evento;
- página de artista;
- página de venue;
- home orientada a descubrimiento.

### Comunidad

- login;
- publicar tocata;
- moderación;
- sección Escena local.

### Calidad

- responsive;
- navegación usable;
- errores comprensibles;
- datos incompletos correctamente representados;
- observabilidad mínima;
- QA automatizado verde.

---

# 21. Métricas iniciales de éxito

Evitar vanity metrics.

Medir inicialmente:

## Descubrimiento

- búsquedas por usuario;
- uso de filtros;
- eventos vistos.

## Conversión

- clicks hacia ticketera;
- porcentaje evento → ticketera.

## Comunidad

- tocatas enviadas;
- tocatas aprobadas;
- bandas incorporadas;
- usuarios registrados.

## Retención

- usuarios que vuelven;
- visitas semanales;
- búsquedas repetidas.

---

# 22. Riesgos principales

## 22.1 Moderación

La comunidad trae:

- spam;
- promoción engañosa;
- contenido ofensivo;
- copyright;
- contenido generado automáticamente.

Mitigación inicial:

**moderación previa.**

---

## 22.2 Duplicados

Múltiples fuentes pueden generar eventos aparentemente distintos.

La deduplicación debe ser conservadora.

---

## 22.3 Dependencia de scrapers

Las fuentes pueden cambiar HTML.

Mitigaciones existentes y recomendadas:

- adapters aislados;
- fixtures;
- tests;
- freshness;
- health checks;
- alertas futuras.

---

## 22.4 Scope creep

El mayor riesgo de producto.

La visión futura es amplia, pero V1 debe seguir siendo acotada.

Toda nueva idea debe clasificarse:

```text
P0
P1
P2
Fuera de V1
```

---

# 23. Visión posterior

Si la V1 funciona, miShow puede evolucionar desde:

> catálogo musical multi-fuente

hacia:

> plataforma chilena de descubrimiento de eventos y comunidad cultural.

Evolución posible:

```text
Música
   ↓
Escena local
   ↓
Comunidad
   ↓
Personalización
   ↓
Teatro / Deportes / Otros
```

La expansión de categorías debe ocurrir después de demostrar que el modelo funciona bien para música.

---

# 24. Resumen ejecutivo

## Lo que ya está resuelto

- adquisición multi-fuente;
- persistencia;
- frontend base;
- operación;
- tests;
- despliegue;
- freshness.

## Lo que define la siguiente etapa

1. evento canónico;
2. deduplicación;
3. artistas;
4. venues;
5. descubrimiento;
6. tocatas;
7. escena local;
8. comunidad inicial.

## Principal decisión

No lanzar públicamente el MVP original como producto definitivo.

Utilizar la base técnica actual para construir una **V1 más completa y diferenciada**, suficientemente pequeña para poder terminarse, pero suficientemente clara para comunicar desde el primer día que miShow no es simplemente otra agenda de conciertos.

---

## Próximo paso recomendado

Crear el brief:

```text
docs/briefs/003-modelo-canonico-eventos.md
```

Este brief debería cerrar antes de implementar:

- modelo `Event`;
- `EventSource`;
- `Performance`;
- `Artist`;
- `Venue`;
- estrategia de deduplicación;
- migración de datos existentes;
- impacto en scrapers;
- impacto en `catalog-client`;
- impacto en frontend;
- compatibilidad hacia atrás.

Ese cambio será la base del resto de la V1.
