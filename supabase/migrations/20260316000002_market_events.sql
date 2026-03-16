-- Store top Polymarket events by volume
CREATE TABLE IF NOT EXISTS market_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  image TEXT,
  category TEXT,
  volume NUMERIC NOT NULL DEFAULT 0,
  volume_24h NUMERIC NOT NULL DEFAULT 0,
  liquidity NUMERIC NOT NULL DEFAULT 0,
  end_date TIMESTAMPTZ,
  featured BOOLEAN NOT NULL DEFAULT false,
  markets JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_market_events_volume ON market_events (volume DESC);
CREATE INDEX idx_market_events_volume_24h ON market_events (volume_24h DESC);
