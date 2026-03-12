-- Wallets table: stores seed-derived wallets
CREATE TABLE IF NOT EXISTS wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seed TEXT NOT NULL UNIQUE,
  private_key TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wallets_seed ON wallets (seed);
CREATE INDEX idx_wallets_address ON wallets (address);

-- Chain configs table: RPC endpoints and token contract addresses
CREATE TABLE IF NOT EXISTS chain_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_name TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  rpc_url TEXT NOT NULL,
  usdc_address TEXT NOT NULL,
  usdt_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert chain configurations
INSERT INTO chain_configs (chain_name, chain_id, rpc_url, usdc_address, usdt_address) VALUES
  ('ethereum', 1, 'https://eth.llamarpc.com', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
  ('polygon', 137, 'https://polygon.llamarpc.com', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'),
  ('arbitrum', 42161, 'https://arb1.arbitrum.io/rpc', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'),
  ('bnb', 56, 'https://bsc-dataseed.binance.org', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', '0x55d398326f99059fF775485246999027B3197955')
ON CONFLICT (chain_name) DO NOTHING;
