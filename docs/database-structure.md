# Database Structure

Current production data lives in one Supabase Postgres database. The project does not use multiple databases; it uses multiple tables with different roles.

## Core Tables

### Users

- `users`
  - Primary user record
  - Stores profile, role, current credit balance, referral code, and `referred_by`

### Analysis

- `analysis_records`
  - User-facing analysis history
  - Final status and rendered analysis result live here

- `analysis_jobs`
  - Worker queue table
  - Tracks retries, worker locks, heartbeats, and queue status
  - This is runtime infrastructure, not user-facing history

- `featured_analyses`
  - Discovery-page curated/derived content
  - Derived from completed analyses, but intentionally separate because it acts like a cache plus admin-managed content

### Payments

- `chain_configs`
  - Static chain metadata for supported payment rails
  - Currently four rows: `ethereum`, `polygon`, `arbitrum`, `bnb`

- `wallets`
  - Deposit wallets used by users
  - New schema uses explicit `user_id`
  - Legacy rows may still have `seed = user:<id>`; the server keeps backward compatibility

- `transactions`
  - Raw on-chain payment submissions
  - Tracks tx hash, chain, token, review state, and optional order linkage

- `billing_orders`
  - Payment intent / expected charge
  - Represents what the app expects the user to pay for

- `user_subscriptions`
  - Active or expired monthly/unlimited access windows

### Credits

- `credit_transactions`
  - Credit ledger
  - Every spend, refund, referral commission, subscription credit, top-up, and admin grant is an immutable ledger row

## Relationship Map

- `users.id -> analysis_records.user_id`
- `analysis_records.id -> analysis_jobs.analysis_record_id`
- `analysis_records.id -> featured_analyses.analysis_record_id`
- `users.id -> credit_transactions.user_id`
- `users.id -> billing_orders.user_id`
- `billing_orders.id -> transactions.billing_order_id`
- `billing_orders.id -> user_subscriptions.source_order_id`
- `users.id -> wallets.user_id`
- `users.id -> users.referred_by`

## Why Some Tables Are Separate

- `analysis_records` and `analysis_jobs` should stay separate if the worker queue remains
- `billing_orders` and `transactions` are different concepts: payment intent vs on-chain fact
- `credit_transactions` should not be merged into `users` because it is a ledger, not profile state

## Tables That Could Be Simplified Later

- `chain_configs`
  - Good candidate to move from database to static server config

- `featured_analyses`
  - Could be replaced by a derived view if manual curation is no longer needed

- `user_subscriptions`
  - Could be collapsed into `users` only if the product only needs current subscription state and does not care about history

## Recent Hardening

- Added `wallets.user_id` as the explicit long-term relation to users
- Added `apply_credit_transaction(...)` SQL function for atomic balance update + ledger insert
- Added atomic billing review SQL functions for order approve/reject paths
- Kept server fallback logic so older environments still work before the migration is applied
