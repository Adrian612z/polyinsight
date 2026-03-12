CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  from_address TEXT,
  to_address TEXT,
  chain_name TEXT,
  token_symbol TEXT,
  amount TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_tx_hash ON transactions (tx_hash);
CREATE INDEX idx_transactions_from_address ON transactions (from_address);
CREATE INDEX idx_transactions_to_address ON transactions (to_address);
