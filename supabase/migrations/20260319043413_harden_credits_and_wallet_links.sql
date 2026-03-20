begin;

alter table public.wallets
  add column if not exists user_id text references public.users(id);

update public.wallets
set user_id = substring(seed from '^user:(.+)$')
where user_id is null
  and seed like 'user:%';

create unique index if not exists idx_wallets_user_id_unique
  on public.wallets (user_id)
  where user_id is not null;

create index if not exists idx_credit_tx_user_type_ref_amount
  on public.credit_transactions (user_id, type, reference_id, amount)
  where reference_id is not null;

create or replace function public.apply_credit_transaction(
  p_user_id text,
  p_amount integer,
  p_type text,
  p_reference_id text default null,
  p_description text default null,
  p_require_non_negative boolean default false,
  p_dedupe boolean default false
)
returns table (
  applied boolean,
  balance integer,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_existing public.credit_transactions%rowtype;
  v_new_balance integer;
  v_tx_id uuid;
begin
  if p_amount = 0 then
    raise exception 'ZERO_AMOUNT_NOT_ALLOWED';
  end if;

  if p_dedupe and p_reference_id is not null then
    select *
    into v_existing
    from public.credit_transactions
    where user_id = p_user_id
      and type = p_type
      and reference_id = p_reference_id
      and amount = p_amount
    order by created_at desc
    limit 1;

    if found then
      return query
      select false, v_existing.balance_after, v_existing.id;
      return;
    end if;
  end if;

  select *
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  v_new_balance := coalesce(v_user.credit_balance, 0) + p_amount;

  if p_require_non_negative and v_new_balance < 0 then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.users
  set credit_balance = v_new_balance,
      updated_at = now()
  where id = p_user_id;

  insert into public.credit_transactions (
    user_id,
    amount,
    type,
    reference_id,
    description,
    balance_after
  )
  values (
    p_user_id,
    p_amount,
    p_type,
    p_reference_id,
    p_description,
    v_new_balance
  )
  returning id into v_tx_id;

  return query
  select true, v_new_balance, v_tx_id;
end;
$$;

commit;
