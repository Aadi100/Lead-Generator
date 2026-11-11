-- Lead Radar v6: duplicate detection, learning from outcomes, reply assistant.
-- Run AFTER schema-v4.sql. Safe to run more than once.

-- ---------- A) identity: the same person or ad on several sources ----------
-- Duplicates are never deleted. A link says "these two leads belong together" (or "same text, different people").
CREATE TABLE IF NOT EXISTS lead_links (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_a     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,   -- always the smaller uuid
  lead_b     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  relation   TEXT NOT NULL DEFAULT 'same_contact',                   -- same_contact | cross_post | text_blast
  state      TEXT NOT NULL DEFAULT 'auto',                           -- auto | suspected | confirmed | split
  strength   REAL DEFAULT 0,
  reasons    JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (lead_a, lead_b),
  CHECK (lead_a < lead_b)
);
CREATE INDEX IF NOT EXISTS lead_links_a_idx ON lead_links (lead_a);
CREATE INDEX IF NOT EXISTS lead_links_b_idx ON lead_links (lead_b);

CREATE TABLE IF NOT EXISTS lead_identity_keys (
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,                                             -- email | handle | phone | domain | text | body
  value   TEXT NOT NULL,
  PRIMARY KEY (lead_id, kind, value)
);
CREATE INDEX IF NOT EXISTS lead_identity_keys_lookup_idx ON lead_identity_keys (kind, value);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS dedupe_at      TIMESTAMPTZ,                -- when matching last ran for this lead
  ADD COLUMN IF NOT EXISTS dedupe_signals JSONB DEFAULT '{}'::jsonb,  -- what the matching added to trust / flags (so it can be undone)
  -- ---------- B) learned score ----------
  ADD COLUMN IF NOT EXISTS learned_score   INT,                       -- 0-100, from your own outcomes; null until there is enough data
  ADD COLUMN IF NOT EXISTS learned_reasons JSONB DEFAULT '[]'::jsonb, -- [{text, effect: up|down, n, label}]
  ADD COLUMN IF NOT EXISTS learned_weight  REAL,                      -- how much "Best match" trusts learned_score (0 to 0.5)
  ADD COLUMN IF NOT EXISTS learned_at      TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS leads_dedupe_idx ON leads (dedupe_at);

-- ---------- B) outcome events: every status change that matters, recorded at the database ----------
-- The dashboard changes lead status directly, so a trigger is the one place that always sees it.
CREATE OR REPLACE FUNCTION lr_record_lead_outcome() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Replied', 'Won', 'Lost', 'Ignored') THEN
    INSERT INTO learning_events (kind, lead_id, data)
    VALUES ('lead_outcome', NEW.id, jsonb_build_object(
      'status', NEW.status, 'from', OLD.status, 'source', NEW.source, 'category', NEW.category,
      'budget_amount', NEW.budget_amount, 'trust_score', NEW.trust_score, 'has_email', (NEW.best_email IS NOT NULL),
      'fit_score', NEW.fit_score, 'learned_score', NEW.learned_score));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lr_leads_outcome') THEN
    CREATE TRIGGER lr_leads_outcome AFTER UPDATE OF status ON leads FOR EACH ROW EXECUTE FUNCTION lr_record_lead_outcome();
  END IF;
END$$;

CREATE OR REPLACE FUNCTION lr_record_deal_outcome() RETURNS trigger AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.lead_id IS NOT NULL
     AND NEW.stage IN ('agreed', 'paid', 'delivered', 'done', 'cancelled', 'disputed') THEN
    INSERT INTO learning_events (kind, lead_id, data)
    VALUES ('deal_outcome', NEW.lead_id, jsonb_build_object(
      'stage', NEW.stage, 'won', NEW.stage IN ('agreed', 'paid', 'delivered', 'done'), 'value', NEW.value, 'deal_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.deals') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lr_deals_outcome') THEN
    CREATE TRIGGER lr_deals_outcome AFTER UPDATE OF stage ON deals FOR EACH ROW EXECUTE FUNCTION lr_record_deal_outcome();
  END IF;
END$$;

-- ---------- C) reply assistant ----------
-- replies.assist: {classification, summary, next_step, actions[], task, draft_outreach_id, mode, generated_at}
ALTER TABLE replies
  ADD COLUMN IF NOT EXISTS assist_status TEXT,            -- null (not yet) | pending | done | failed | skipped
  ADD COLUMN IF NOT EXISTS assist        JSONB;
CREATE INDEX IF NOT EXISTS replies_assist_idx ON replies (assist_status);

-- An answer draft belongs to a reply. Steps 1 to 3 stay the cold sequence; answers use step 10 and up,
-- which keeps UNIQUE (lead_id, step) safe and keeps them out of the follow-up logic.
ALTER TABLE outreach
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES replies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS outreach_reply_to_idx ON outreach (reply_to_id);

-- ---------- security + realtime ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_links', 'lead_identity_keys'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users full access') THEN
      EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'lead_links') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lead_links;
  END IF;
END$$;

INSERT INTO app_settings (key, value) VALUES
  ('outcome_model', '{"status":"insufficient","examples":0,"positives":0,"negatives":0,"top_positive":[],"top_negative":[],"note":"Not enough data yet."}')
ON CONFLICT (key) DO NOTHING;
