-- Normalize legacy wallet seeds that still use user email/display_name.
-- Only migrate rows that can be mapped to exactly one user and do not collide
-- with an existing canonical user-scoped wallet seed.

BEGIN;

WITH candidate_matches AS (
  SELECT
    w.id AS wallet_id,
    w.seed AS old_seed,
    MIN(u.id) AS user_id,
    COUNT(DISTINCT u.id) AS user_match_count
  FROM public.wallets w
  JOIN public.users u
    ON (
      (COALESCE(u.email, '') <> '' AND w.seed = u.email)
      OR (COALESCE(u.display_name, '') <> '' AND w.seed = u.display_name)
    )
  WHERE w.seed NOT LIKE 'user:%'
  GROUP BY w.id, w.seed
),
safe_candidates AS (
  SELECT
    c.wallet_id,
    c.old_seed,
    'user:' || c.user_id AS new_seed
  FROM candidate_matches c
  WHERE c.user_match_count = 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallets w2
      WHERE w2.seed = 'user:' || c.user_id
    )
)
UPDATE public.wallets w
SET seed = s.new_seed
FROM safe_candidates s
WHERE w.id = s.wallet_id
  AND w.seed = s.old_seed;

COMMIT;
