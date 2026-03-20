create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_record_id uuid not null unique references public.analysis_records(id) on delete cascade,
  user_id text not null,
  engine text not null check (engine in ('n8n', 'code')),
  lang text not null default 'en' check (lang in ('en', 'zh')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_jobs_status_created_idx
  on public.analysis_jobs (status, created_at);

create index if not exists analysis_jobs_engine_status_idx
  on public.analysis_jobs (engine, status, created_at);
