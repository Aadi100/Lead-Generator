-- Lead Radar v8: game price tracker + stock/listing manager. Run AFTER schema-v4.sql. Safe to run more than once.

-- ---------- stock: what you currently hold to sell ----------
CREATE TABLE IF NOT EXISTS stock_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game          TEXT NOT NULL,
  item_type     TEXT NOT NULL DEFAULT 'other',      -- account | boosting | top-up | currency | items | keys | other
  title         TEXT NOT NULL,
  description   TEXT,
  quantity      INT NOT NULL DEFAULT 1,
  ask_price     NUMERIC,                            -- per unit
  currency      TEXT NOT NULL DEFAULT 'USD',
  cost          NUMERIC,                            -- per unit, what you paid (optional)
  status        TEXT NOT NULL DEFAULT 'in_stock',   -- in_stock | reserved | sold | archived
  listed_on     TEXT[] NOT NULL DEFAULT '{}',       -- platforms where it is listed
  notes         TEXT,
  sold_price    NUMERIC,                            -- per unit
  sold_at       TIMESTAMPTZ,
  buyer_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_items_status_idx ON stock_items (status);
CREATE INDEX IF NOT EXISTS stock_items_game_idx   ON stock_items (game, item_type);
CREATE INDEX IF NOT EXISTS stock_items_buyer_idx  ON stock_items (buyer_lead_id);

-- ---------- price points: sold / asking / offer prices ----------
CREATE TABLE IF NOT EXISTS price_points (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game          TEXT NOT NULL,
  item_type     TEXT NOT NULL DEFAULT 'other',
  item_key      TEXT NOT NULL DEFAULT '',           -- normalised detail: rank / level / server / amount ("diamond", "10000")
  price         NUMERIC NOT NULL,                   -- as entered
  currency      TEXT NOT NULL DEFAULT 'USD',
  price_usd     NUMERIC,                            -- estimate using the rate table in app_settings.price_rates
  kind          TEXT NOT NULL DEFAULT 'sold',       -- sold (real sale, strongest) | asking (a seller's ad) | offer (a buyer's offer)
  source        TEXT,                               -- platform: Reddit, Eldorado ...
  origin        TEXT NOT NULL DEFAULT 'manual',     -- manual | stock | deal | lead
  ref_key       TEXT UNIQUE,                        -- idempotency for automatic rows, e.g. deal:<id>
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  stock_item_id UUID REFERENCES stock_items(id) ON DELETE SET NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_points_group_idx ON price_points (game, item_type, captured_at DESC);
CREATE INDEX IF NOT EXISTS price_points_lead_idx  ON price_points (lead_id);

-- ---------- cached verdicts on trade leads (written by the worker) ----------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS price_verdict    TEXT,     -- below | fair | above | null (no market data)
  ADD COLUMN IF NOT EXISTS price_pct        REAL,     -- % difference from the market median (negative = below)
  ADD COLUMN IF NOT EXISTS market_median    NUMERIC,  -- USD
  ADD COLUMN IF NOT EXISTS market_samples   INT,
  ADD COLUMN IF NOT EXISTS market_basis     TEXT,     -- sold | asking
  ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_item_id    UUID REFERENCES stock_items(id) ON DELETE SET NULL;  -- stock reserved for this buyer
CREATE INDEX IF NOT EXISTS leads_price_checked_idx ON leads (price_checked_at);

-- ---------- security + realtime ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_items', 'price_points'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users full access') THEN
      EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END$$;

-- USD value of 1 unit of each currency. Editable; these are rough defaults, not live rates.
INSERT INTO app_settings (key, value) VALUES
  ('price_rates', '{"rates":{"USD":1,"EUR":1.08,"GBP":1.27,"CAD":0.73,"AUD":0.65,"BRL":0.18,"TRY":0.03,"PHP":0.017,"INR":0.012,"IDR":0.000062,"RUB":0.011,"PLN":0.25},"updated_at":null}'),
  ('price_market_state', '{"last_run":null,"last_result":null}')
ON CONFLICT (key) DO NOTHING;
