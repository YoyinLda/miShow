-- Brief 009 · C: canal de retiro de contenido.
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_table('public', 'content_requests', 'content_requests exists');
select has_column('public', 'events', 'hidden_at', 'events.hidden_at exists');
select has_column('public', 'sources', 'enabled', 'sources.enabled exists');
select ok(not pg_catalog.has_table_privilege('anon', 'public.content_requests', 'select'), 'anon cannot read content_requests');

set local role anon;
select lives_ok(
  $$ insert into public.content_requests (name, email, reason) values ('Ana', 'ana@ejemplo.cl', 'Solicito retirar el evento X') $$,
  'anon can submit a request'
);
select lives_ok($$ insert into public.content_requests (name, email, reason) values ('Ana', 'ana@ejemplo.cl', 'Segunda solicitud de prueba') $$, 'second request');
select lives_ok($$ insert into public.content_requests (name, email, reason) values ('Ana', 'ANA@ejemplo.cl', 'Tercera solicitud de prueba') $$, 'third request');
select throws_ok(
  $$ insert into public.content_requests (name, email, reason) values ('Ana', 'ana@ejemplo.cl', 'Cuarta solicitud de prueba') $$,
  'P0001', 'rate_limited', 'more than 3 per email per hour is rate limited'
);
select throws_ok(
  $$ insert into public.content_requests (name, email, reason, status) values ('Bot', 'bot@ejemplo.cl', 'Intenta forzar estado', 'resolved') $$,
  '42501', null, 'anon cannot set status'
);
select throws_ok(
  $$ insert into public.content_requests (name, email, reason) values ('Bot', 'no-es-correo', 'Correo invalido de prueba') $$,
  '23514', null, 'invalid email is rejected'
);
reset role;

select * from finish();
rollback;
