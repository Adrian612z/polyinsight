begin;

create unique index if not exists idx_user_subscriptions_source_order_unique
  on public.user_subscriptions (source_order_id)
  where source_order_id is not null;

create or replace function public.approve_billing_order_atomic(
  p_order_id uuid,
  p_reviewer_user_id text default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.billing_orders%rowtype;
  v_updated_order public.billing_orders%rowtype;
  v_existing_subscription public.user_subscriptions%rowtype;
  v_subscription public.user_subscriptions%rowtype;
  v_now timestamptz := now();
  v_duration interval := interval '30 days';
  v_credit_type text;
  v_credit_description text;
begin
  select *
  into v_order
  from public.billing_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status = 'approved' then
    raise exception 'ORDER_ALREADY_APPROVED';
  end if;

  if v_order.status in ('rejected', 'cancelled', 'expired') then
    raise exception 'ORDER_NOT_APPROVABLE';
  end if;

  if v_order.tx_hash is null then
    raise exception 'ORDER_MISSING_TX';
  end if;

  if coalesce(v_order.expected_credits, 0) > 0 then
    v_credit_type := case when v_order.plan_id = 'topup' then 'topup' else 'subscription_credit' end;
    v_credit_description := case
      when v_order.plan_id = 'topup' then format('Top-up approved for order %s', v_order.id)
      else format('Plan credits approved for order %s', v_order.id)
    end;

    perform *
    from public.apply_credit_transaction(
      v_order.user_id,
      v_order.expected_credits,
      v_credit_type,
      v_order.id::text,
      v_credit_description,
      false,
      true
    );
  end if;

  if v_order.plan_id <> 'topup' then
    select *
    into v_subscription
    from public.user_subscriptions
    where source_order_id = v_order.id
    limit 1;

    if not found then
      select *
      into v_existing_subscription
      from public.user_subscriptions
      where user_id = v_order.user_id
        and plan_id = v_order.plan_id
        and status = 'active'
      order by ends_at desc
      limit 1
      for update;

      if found then
        update public.user_subscriptions
        set
          ends_at = case
            when v_existing_subscription.ends_at > v_now then v_existing_subscription.ends_at + v_duration
            else v_now + v_duration
          end,
          unlimited = (v_order.plan_id = 'unlimited'),
          included_credits = v_order.expected_credits,
          source_order_id = v_order.id,
          updated_at = v_now
        where id = v_existing_subscription.id
        returning * into v_subscription;
      else
        insert into public.user_subscriptions (
          user_id,
          plan_id,
          status,
          included_credits,
          unlimited,
          starts_at,
          ends_at,
          source_order_id,
          created_at,
          updated_at
        )
        values (
          v_order.user_id,
          v_order.plan_id,
          'active',
          v_order.expected_credits,
          (v_order.plan_id = 'unlimited'),
          v_now,
          v_now + v_duration,
          v_order.id,
          v_now,
          v_now
        )
        returning * into v_subscription;
      end if;
    end if;
  end if;

  update public.billing_orders
  set
    status = 'approved',
    reviewed_by = p_reviewer_user_id,
    review_note = p_review_note,
    approved_at = v_now,
    updated_at = v_now
  where id = p_order_id
  returning * into v_updated_order;

  update public.transactions
  set
    status = 'approved',
    reviewed_by = p_reviewer_user_id,
    review_note = p_review_note,
    reviewed_at = v_now
  where billing_order_id = p_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_updated_order),
    'subscription', case when v_subscription.id is null then null else to_jsonb(v_subscription) end
  );
end;
$$;

create or replace function public.reject_billing_order_atomic(
  p_order_id uuid,
  p_reviewer_user_id text default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.billing_orders%rowtype;
  v_updated_order public.billing_orders%rowtype;
  v_now timestamptz := now();
begin
  select *
  into v_order
  from public.billing_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status = 'approved' then
    raise exception 'ORDER_ALREADY_APPROVED';
  end if;

  if v_order.status = 'rejected' then
    raise exception 'ORDER_ALREADY_REJECTED';
  end if;

  if v_order.status in ('cancelled', 'expired') then
    raise exception 'ORDER_NOT_REJECTABLE';
  end if;

  update public.billing_orders
  set
    status = 'rejected',
    reviewed_by = p_reviewer_user_id,
    review_note = p_review_note,
    rejected_at = v_now,
    updated_at = v_now
  where id = p_order_id
  returning * into v_updated_order;

  update public.transactions
  set
    status = 'rejected',
    reviewed_by = p_reviewer_user_id,
    review_note = p_review_note,
    reviewed_at = v_now
  where billing_order_id = p_order_id;

  return jsonb_build_object('order', to_jsonb(v_updated_order));
end;
$$;

commit;
