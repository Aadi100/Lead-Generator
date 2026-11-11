-- Lead Radar v5: proposal & quote builder. Run AFTER schema-v4.sql. Safe to run more than once.

CREATE TABLE IF NOT EXISTS proposal_packages (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'Other',       -- Website | App | Design | Automation | Other
  base_price    NUMERIC NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  timeline_days INTEGER,
  deliverables  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["Home page", ...]
  active        BOOLEAN NOT NULL DEFAULT true,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  deal_id       UUID REFERENCES deals(id) ON DELETE SET NULL,
  package_id    UUID REFERENCES proposal_packages(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  client_name   TEXT,
  client_email  TEXT,
  summary       TEXT,
  scope         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{label, price}] (a negative price is a discount)
  total         NUMERIC NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  timeline_days INTEGER,
  valid_until   DATE,
  terms         TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',       -- draft | sent | accepted | declined | expired
  sent_at       TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals (status);
CREATE INDEX IF NOT EXISTS proposals_lead_idx   ON proposals (lead_id);
CREATE INDEX IF NOT EXISTS proposals_deal_idx   ON proposals (deal_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposal_packages','proposals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users full access') THEN
      EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- Starter packages (only when the table is empty, so edits and deletions are never undone).
INSERT INTO proposal_packages (name, description, category, base_price, currency, timeline_days, deliverables, sort)
SELECT * FROM (VALUES
  ('Starter website', 'A clean, fast brochure site for a small business.', 'Website', 600, 'USD', 10, '["Up to 5 pages","Mobile friendly design","Contact form","Basic SEO setup","1 round of revisions"]'::jsonb, 10),
  ('Business website', 'A custom site with content management and a stronger brand feel.', 'Website', 1500, 'USD', 21, '["Up to 10 pages","Custom design","Content management","Blog or portfolio section","Analytics setup","2 rounds of revisions"]'::jsonb, 20),
  ('MVP app', 'A first working version of your app, ready to test with real users.', 'App', 4000, 'USD', 42, '["Scoped core features","Sign in and user accounts","Admin view","Deployed and tested","2 weeks of bug fixes"]'::jsonb, 30),
  ('Logo and brand kit', 'A logo with the basics you need to look consistent.', 'Design', 350, 'USD', 7, '["3 logo concepts","2 rounds of revisions","Colour palette and fonts","Logo files for web and print"]'::jsonb, 40),
  ('Social media design pack', 'A set of ready to post graphics in your brand style.', 'Design', 250, 'USD', 5, '["10 post templates","Story templates","Editable source files"]'::jsonb, 50),
  ('Workflow automation', 'Connect your tools so repeat tasks run on their own.', 'Automation', 500, 'USD', 7, '["Process review","Up to 3 connected apps","Automation build and testing","Short how-to guide"]'::jsonb, 60)
) AS v(name, description, category, base_price, currency, timeline_days, deliverables, sort)
WHERE NOT EXISTS (SELECT 1 FROM proposal_packages);
