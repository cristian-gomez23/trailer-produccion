-- ================================================================
--  TRAILER TRACKER — Schema "produccion" en Supabase
--  
--  IMPORTANTE: Este script crea un schema separado "produccion"
--  dentro de tu proyecto Supabase existente.
--  No toca ni modifica ninguna tabla del schema "public".
--
--  Pasos:
--  1. Ir a Supabase Dashboard → SQL Editor → New Query
--  2. Pegar este script completo y ejecutar
-- ================================================================

-- 1. Crear el schema
create schema if not exists produccion;

-- 2. Exponer el schema a la API de Supabase
-- (necesario para que el cliente JS pueda usarlo)
-- Ejecutá esto en SQL Editor también:
comment on schema produccion is 'Schema para el módulo de producción de trailers';

-- 3. Tabla principal de trailers
create table if not exists produccion.trailers (
  id              bigserial primary key,
  nombre          text        not null,
  modelo          text,
  chapa           text        not null,
  fecha_inicio    date,
  fecha_fin       date        not null,
  fecha_real_fin  date,
  prioridad       text        default 'normal'
                              check (prioridad in ('normal', 'alta', 'urgente')),
  en_produccion   boolean     default false,
  finalizado      boolean     default false,
  notas           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 4. Trigger para updated_at automático
create or replace function produccion.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trailers_updated_at
  before update on produccion.trailers
  for each row execute function produccion.update_updated_at();

-- 5. Índices
create index if not exists idx_trailers_chapa      on produccion.trailers(chapa);
create index if not exists idx_trailers_finalizado on produccion.trailers(finalizado);
create index if not exists idx_trailers_fecha_fin  on produccion.trailers(fecha_fin);

-- 6. RLS deshabilitado (ambiente local/interno)
--    Habilitarlo si la app se expone públicamente
alter table produccion.trailers disable row level security;

-- ================================================================
--  PASO EXTRA OBLIGATORIO EN SUPABASE:
--  
--  En Supabase Dashboard → Settings → API → "Exposed schemas"
--  Agregar "produccion" a la lista (además de "public").
--  Sin este paso, el cliente JS no puede acceder al schema.
-- ================================================================
