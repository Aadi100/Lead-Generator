-- Lead Radar: run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS leads (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT        NOT NULL,
  description   TEXT,
  budget        TEXT        DEFAULT 'TBD',
  url           TEXT        UNIQUE NOT NULL,          -- natural dedupe key
  source        TEXT        NOT NULL,                 -- Reddit, Freelancer, Hacker News, Web Form...
  type          TEXT        NOT NULL,                 -- 'Inbound' | 'Outbound'
  status        TEXT        DEFAULT 'New',            -- New | Pitched | Replied | Closed | Ignored
  created_at    TIMESTAMPTZ DEFAULT now(),

  source_detail TEXT,                                 -- e.g. r/forhire
  category      TEXT,                                 -- Website | App | Design | Automation
  categories    JSONB       DEFAULT '[]'::jsonb,
  tags          JSONB       DEFAULT '[]'::jsonb,
  author        TEXT,
  author_info   TEXT,
  contact       TEXT,                                 -- items separated by ' · '
  budget_amount NUMERIC,                              -- best guess in USD
  posted_at     TIMESTAMPTZ,
  trust_score   INT,                                  -- 5..98
  trust_level   TEXT,                                 -- High | Medium | Low
  is_suspicious BOOLEAN     DEFAULT false,
  flags         JSONB       DEFAULT '[]'::jsonb,      -- human-readable reasons
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_category_idx   ON leads (category);

-- Realtime for the dashboard (ignore the error if it is already added)
ALTER PUBLICATION supabase_realtime ADD TABLE leads;

-- Only signed-in dashboard users can read or change leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Authenticated users full access') THEN
    CREATE POLICY "Authenticated users full access" ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END$$;
