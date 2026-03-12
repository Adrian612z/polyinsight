/**
 * One-time script to create wallets and chain_configs tables and seed chain data.
 * Run with: npx tsx src/scripts/seed-chain-configs.ts
 */
import { supabase } from '../services/supabase.js'

async function run() {
  // Create wallets table
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        seed TEXT NOT NULL UNIQUE,
        private_key TEXT NOT NULL,
        address TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wallets_seed ON wallets (seed);
      CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets (address);
    `
  })

  if (e1) {
    console.log('wallets table may need manual creation via SQL editor, trying direct insert approach...')
  } else {
    console.log('wallets table created')
  }

  // Create chain_configs table
  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS chain_configs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        chain_name TEXT NOT NULL UNIQUE,
        chain_id INTEGER NOT NULL,
        rpc_url TEXT NOT NULL,
        usdc_address TEXT NOT NULL,
        usdt_address TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `
  })

  if (e2) {
    console.log('chain_configs table may need manual creation, trying direct insert...')
  } else {
    console.log('chain_configs table created')
  }

  // Try inserting chain data (will work if table already exists)
  const chains = [
    { chain_name: 'ethereum', chain_id: 1, rpc_url: 'https://eth.llamarpc.com', usdc_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', usdt_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    { chain_name: 'polygon', chain_id: 137, rpc_url: 'https://polygon.llamarpc.com', usdc_address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', usdt_address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
    { chain_name: 'arbitrum', chain_id: 42161, rpc_url: 'https://arb1.arbitrum.io/rpc', usdc_address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', usdt_address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
    { chain_name: 'bnb', chain_id: 56, rpc_url: 'https://bsc-dataseed.binance.org', usdc_address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', usdt_address: '0x55d398326f99059fF775485246999027B3197955' },
  ]

  const { data, error: e3 } = await supabase
    .from('chain_configs')
    .upsert(chains, { onConflict: 'chain_name' })
    .select()

  if (e3) {
    console.error('Failed to insert chain configs:', e3.message)
    console.log('\n请先在 Supabase SQL Editor 中执行以下 SQL 创建表:')
    console.log('----------------------------------------')
    console.log(`
CREATE TABLE IF NOT EXISTS wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seed TEXT NOT NULL UNIQUE,
  private_key TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallets_seed ON wallets (seed);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets (address);

CREATE TABLE IF NOT EXISTS chain_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_name TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  rpc_url TEXT NOT NULL,
  usdc_address TEXT NOT NULL,
  usdt_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
    `)
    console.log('----------------------------------------')
    console.log('创建表后重新运行此脚本插入数据。')
  } else {
    console.log('Chain configs inserted:', data?.length, 'rows')
  }
}

run().catch(console.error)
