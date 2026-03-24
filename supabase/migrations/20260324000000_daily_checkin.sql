begin;

alter table public.users
  add column if not exists checkin_streak integer not null default 0;

alter table public.users
  add column if not exists last_checkin_on date;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'credit_transactions'
      and constraint_name = 'credit_transactions_type_check'
  ) then
    alter table public.credit_transactions
      drop constraint credit_transactions_type_check;
  end if;
end $$;

alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (
    type in (
      'topup',
      'analysis_spend',
      'referral_commission',
      'admin_grant',
      'refund',
      'signup_bonus',
      'subscription_credit',
      'daily_checkin_bonus'
    )
  );

create or replace function public.perform_daily_checkin(
  p_user_id text,
  p_checkin_date date default null
)
returns table (
  checked_in boolean,
  streak integer,
  rewarded boolean,
  reward_amount integer,
  balance integer,
  checkin_date date,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_checkin_date date := coalesce(p_checkin_date, (now() at time zone 'Asia/Shanghai')::date);
  v_new_streak integer;
  v_reward_amount integer := 0;
  v_new_balance integer;
  v_tx_id uuid := null;
begin
  select *
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.last_checkin_on = v_checkin_date then
    raise exception 'ALREADY_CHECKED_IN';
  end if;

  if v_user.last_checkin_on = v_checkin_date - 1 then
    v_new_streak := coalesce(v_user.checkin_streak, 0) + 1;
  else
    v_new_streak := 1;
  end if;

  v_new_balance := coalesce(v_user.credit_balance, 0);

  if mod(v_new_streak, 3) = 0 then
    v_reward_amount := 100;
    v_new_balance := v_new_balance + v_reward_amount;
  end if;

  update public.users
  set checkin_streak = v_new_streak,
      last_checkin_on = v_checkin_date,
      credit_balance = v_new_balance,
      updated_at = now()
  where id = p_user_id;

  if v_reward_amount > 0 then
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
      v_reward_amount,
      'daily_checkin_bonus',
      format('daily-checkin:%s', v_checkin_date),
      format('Daily check-in bonus for %s-day streak', v_new_streak),
      v_new_balance
    )
    returning id into v_tx_id;
  end if;

  return query
  select true, v_new_streak, v_reward_amount > 0, v_reward_amount, v_new_balance, v_checkin_date, v_tx_id;
end;
$$;

commit;
