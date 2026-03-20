create or replace function public.claim_analysis_jobs(p_worker_id text, p_limit integer)
returns setof public.analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.analysis_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit greatest(coalesce(p_limit, 0), 0)
  )
  update public.analysis_jobs as jobs
  set
    status = 'running',
    locked_by = p_worker_id,
    locked_at = now(),
    started_at = coalesce(jobs.started_at, now()),
    attempts = coalesce(jobs.attempts, 0) + 1,
    updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create index if not exists analysis_jobs_status_locked_idx
  on public.analysis_jobs (status, locked_at);
