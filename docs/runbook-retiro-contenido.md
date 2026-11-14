# Runbook — Retiro de contenido (plazo: 24 h)

Brief 009 · C. Aplica a cualquier fuente (términos de la Discovery API de Ticketmaster y scraping responsable).

## Cómo llega una solicitud

1. Alguien completa `/contacto`, y la solicitud queda en `content_requests` con `status = 'pending'`. Antispam: hasta 3 por correo por hora, 30 por hora en total, y un campo honeypot.
2. Cada 30 minutos el workflow **Avisar solicitudes de retiro de contenido** abre un issue `[retiro-contenido] Solicitud #<id>` y marca la fila como `notified`. GitHub avisa por correo.
3. El issue es público, así que **no** incluye nombre, correo ni motivo. Esos datos se ven en Supabase → Table Editor → `content_requests`.

## Pasos (dentro de 24 h desde `created_at`)

1. **Leer la solicitud** en Supabase y verificar que sea plausible (titular, marca, organizador o la propia ticketera).
2. **Ocultar el contenido** desde el SQL Editor:
   - Un evento puntual:
     ```sql
     update public.events set hidden_at = now() where slug = '<slug>';
     ```
   - Todo el contenido de una ticketera (kill switch):
     ```sql
     update public.sources set enabled = false where code = '<fuente>';
     ```
     Sus eventos dejan de mostrarse y sus enlaces y precios desaparecen de los eventos compartidos con otras fuentes. Si la fuente no debe volver a ingresar, desactiva también su workflow de scraping.
   - El cambio se ve de inmediato: el sitio lee las vistas en vivo y no hay que redesplegar.
3. **Responder** desde tu correo a la dirección de la solicitud: qué se retiró y cuándo.
4. **Cerrar**:
   ```sql
   update public.content_requests set status = 'resolved', resolved_at = now() where id = <id>;
   ```
   Cierra también el issue con un comentario breve, sin datos personales. Si la solicitud no procede, usa `status = 'rejected'` y explica el motivo en la respuesta.

## Revertir

```sql
update public.events set hidden_at = null where slug = '<slug>';
update public.sources set enabled = true where code = '<fuente>';
```

## Notas

- GitHub desactiva los cron de repos sin actividad durante 60 días. Si eso pasa, reactiva el workflow desde Actions.
- Para probar el canal: envía una solicitud desde `/contacto` y corre el workflow a mano (Run workflow). Revisa que aparezca el issue y que la fila pase a `notified`.
