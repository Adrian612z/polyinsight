DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND constraint_name = 'credit_transactions_type_check'
  ) THEN
    ALTER TABLE public.credit_transactions
      DROP CONSTRAINT credit_transactions_type_check;
  END IF;
END $$;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (
    type IN (
      'topup',
      'analysis_spend',
      'referral_commission',
      'admin_grant',
      'refund',
      'signup_bonus',
      'subscription_credit'
    )
  );
