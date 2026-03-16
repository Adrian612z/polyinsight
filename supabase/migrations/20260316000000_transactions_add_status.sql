-- Add status and user_id columns to transactions table
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX idx_transactions_status ON transactions (status);
CREATE INDEX idx_transactions_user_id ON transactions (user_id);
