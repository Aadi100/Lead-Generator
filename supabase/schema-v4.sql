-- Lead Radar v4: deals and tasks (platform modules). Run AFTER schema-v3.sql. Safe to run more than once.

CREATE TABLE IF NOT EXISTS deals (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT 'service',   -- 'service' | 'trade'
  direction      TEXT NOT NULL DEFAULT 'sell',      -- 'sell' (I sell) | 'buy' (I buy); services are always 'sell'
  stage          TEXT NOT NULL DEFAULT 'talking',   -- talking | negotiating | agreed | paid | delivered | done | cancelled | disputed
  title          TEXT NOT NULL,
  company        TEXT,
  contact        TEXT,
  game           TEXT,
  item_type      TEXT,
  platform       TEXT,                              -- Discord, Reddit, Eldorado, Upwork ...
  value          NUMERIC,                           -- what the other side pays me (sell) or what I pay (buy)
  cost           NUMERIC,                           -- what it cost me to get/deliver it (for profit)
  currency       TEXT DEFAULT 'USD',
  notes          TEXT,
  expected_close DATE,
  opened_at      TIMESTAMPTZ DEFAULT now(),
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_stage_idx ON deals (stage);
CREATE INDEX IF NOT EXISTS deals_lead_idx  ON deals (lead_id);

CREATE TABLE IF NOT EXISTS tasks (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
  deal_id    UUID REFERENCES deals(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  notes      TEXT,
  due_at     TIMESTAMPTZ,
  done       BOOLEAN DEFAULT false,
  done_at    TIMESTAMPTZ,
  priority   TEXT DEFAULT 'normal',                 -- low | normal | high
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks (done, due_at);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['deals','tasks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users full access') THEN
      EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END$$;
