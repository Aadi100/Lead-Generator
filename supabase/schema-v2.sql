-- Lead Radar v2: enrichment, outreach, replies, settings, learning.
-- Run AFTER schema.sql. Safe to run more than once.

-- ---------- leads: new columns ----------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_kind         TEXT DEFAULT 'request',   -- 'request' (they asked) | 'prospect' (we found them)
  ADD COLUMN IF NOT EXISTS enrich_status     TEXT DEFAULT 'pending',   -- pending | running | done | failed | skipped
  ADD COLUMN IF NOT EXISTS enriched_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrich_error      TEXT,
  ADD COLUMN IF NOT EXISTS website           TEXT,
  ADD COLUMN IF NOT EXISTS company_name      TEXT,
  ADD COLUMN IF NOT EXISTS owner_name        TEXT,
  ADD COLUMN IF NOT EXISTS owner_title       TEXT,
  ADD COLUMN IF NOT EXISTS emails            JSONB DEFAULT '[]'::jsonb,  -- [{email, status, kind, source}]
  ADD COLUMN IF NOT EXISTS phones            JSONB DEFAULT '[]'::jsonb,  -- [string]
  ADD COLUMN IF NOT EXISTS socials           JSONB DEFAULT '{}'::jsonb,  -- {linkedin:url, facebook:url, ...}
  ADD COLUMN IF NOT EXISTS site_signals      JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS opportunity       TEXT,
  ADD COLUMN IF NOT EXISTS best_email        TEXT,
  ADD COLUMN IF NOT EXISTS best_email_status TEXT,
  ADD COLUMN IF NOT EXISTS fit_score         INT,
  ADD COLUMN IF NOT EXISTS fit_reasons       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alerted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pitched_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_note      TEXT;

-- 'Closed' becomes 'Won'; 'Lost' is new. Statuses: New | Pitched | Replied | Won | Lost | Ignored
UPDATE leads SET status = 'Won' WHERE status = 'Closed';

CREATE INDEX IF NOT EXISTS leads_enrich_idx  ON leads (enrich_status);
CREATE INDEX IF NOT EXISTS leads_alerted_idx ON leads (alerted_at);
CREATE INDEX IF NOT EXISTS leads_kind_idx    ON leads (lead_kind);

-- ---------- settings (one row per key) ----------
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- job queue: the dashboard asks, the local worker does ----------
CREATE TABLE IF NOT EXISTS jobs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type        TEXT NOT NULL,
  payload     JSONB DEFAULT '{}'::jsonb,
  status      TEXT DEFAULT 'queued',          -- queued | running | done | failed
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, created_at);

-- ---------- outreach: drafts, queued sends, follow-ups ----------
CREATE TABLE IF NOT EXISTS outreach (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step                  INT  NOT NULL DEFAULT 1,           -- 1 first message, 2 and 3 follow-ups
  channel               TEXT NOT NULL DEFAULT 'email',     -- 'email' (we send) | 'manual' (you paste it into a DM or bid)
  to_email              TEXT,
  to_name               TEXT,
  subject               TEXT,
  body                  TEXT,
  original_subject      TEXT,                              -- what the AI wrote, kept for learning
  original_body         TEXT,
  status                TEXT NOT NULL DEFAULT 'draft',     -- draft | queued | sending | scheduled | sent | failed | cancelled | replied
  due_at                TIMESTAMPTZ,                       -- when a scheduled follow-up should go out
  sent_at               TIMESTAMPTZ,
  message_id            TEXT,
  provider              TEXT,
  error                 TEXT,
  warnings              JSONB DEFAULT '[]'::jsonb,         -- safety-check findings
  confirmed_suspicious  BOOLEAN DEFAULT false,             -- user said "I checked this lead, send anyway"
  override_warnings     BOOLEAN DEFAULT false,             -- user said "send despite the safety warnings"
  rating                TEXT,                              -- 'good' | 'bad' (optional thumbs)
  feedback_note         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (lead_id, step)
);
CREATE INDEX IF NOT EXISTS outreach_status_idx ON outreach (status, due_at);
CREATE INDEX IF NOT EXISTS outreach_lead_idx   ON outreach (lead_id);

-- ---------- replies we detect in your inbox ----------
CREATE TABLE IF NOT EXISTS replies (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outreach_id UUID REFERENCES outreach(id) ON DELETE SET NULL,
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_email  TEXT,
  from_name   TEXT,
  subject     TEXT,
  body        TEXT,
  message_id  TEXT UNIQUE,
  received_at TIMESTAMPTZ,
  category    TEXT,                                        -- interested | question | not_interested | out_of_office | bounce | other
  summary     TEXT,
  handled     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS replies_lead_idx ON replies (lead_id);

-- ---------- never contact again ----------
CREATE TABLE IF NOT EXISTS suppressions (
  email      TEXT PRIMARY KEY,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- what the system learns from you ----------
CREATE TABLE IF NOT EXISTS learning_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind        TEXT NOT NULL,                               -- draft_edit | rating | rewrite_instruction | reply | outcome
  lead_id     UUID,
  outreach_id UUID,
  data        JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------- security + realtime ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_settings','jobs','outreach','replies','suppressions','learning_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users full access') THEN
      EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['jobs','outreach','replies'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END$$;

-- ---------- defaults ----------
INSERT INTO app_settings (key, value) VALUES
  ('profile',       '{"your_name":"","business_name":"","headline":"","email":"","websites":[],"links":[],"services":[],"location":"","notes":"","signature":""}'),
  ('sending',       '{"provider":"none","paused":false,"daily_limit":20,"auto_followups":true,"followup_days":[4,9],"from_name":"","from_email":"","reply_to":"","footer":"If this is not relevant, just reply \"no thanks\" and I will not contact you again.","require_confirm_suspicious":true,"auto_draft":true,"auto_draft_per_hour":6,"min_trust_for_auto_draft":70,"owned_domains":[]}'),
  ('smtp',          '{"host":"","port":587,"secure":false,"user":"","pass":""}'),
  ('resend',        '{"api_key":""}'),
  ('imap',          '{"enabled":false,"host":"","port":993,"secure":true,"user":"","pass":"","folder":"INBOX"}'),
  ('alerts',        '{"enabled":false,"min_trust":70,"only_non_suspicious":true,"on_reply":true,"email":{"to":""},"whatsapp":{"phone":"","apikey":""}}'),
  ('targeting',     '{"keywords":[],"topics":[],"exclude":[],"min_budget":null,"work_description":"","job_description":"","suggested":null,"updated_at":null}'),
  ('prospecting',   '{"enabled":false,"cities":[],"business_types":["restaurant","cafe","bakery","hairdresser","beauty","dentist","gym","clothes","florist","car_repair"],"per_run_limit":30,"interval_hours":24}'),
  ('writing_rules', '{"source":"default","updated_at":null,"markdown":"# Writing rules\n- Open with something specific from their post or website, never a generic compliment.\n- Under 120 words. Plain words. No hype and no buzzwords.\n- One clear offer and one easy next step (a short reply or a 15-minute call).\n- Mention one concrete thing you can do for them and, when it is true, one problem you noticed on their site.\n- Never invent facts, clients, prices or results.\n- Link only to the sender''s own website. No attachments.\n- Sign off with the sender''s name from the profile.","history":[]}')
ON CONFLICT (key) DO NOTHING;

-- Existing leads were already seen: do not alert about them.
UPDATE leads SET alerted_at = now() WHERE alerted_at IS NULL;
