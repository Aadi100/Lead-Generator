-- Lead Radar v3: game trading leads + integrations. Run AFTER schema-v2.sql. Safe to run more than once.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS trade_side  TEXT,   -- 'buyer' = wants to BUY (a customer for what you sell) | 'seller' = is SELLING (a supplier for what you want)
  ADD COLUMN IF NOT EXISTS game        TEXT,   -- e.g. Fortnite
  ADD COLUMN IF NOT EXISTS item_type   TEXT,   -- account | boosting | top-up | currency | items | keys | other
  ADD COLUMN IF NOT EXISTS trade_match TEXT;   -- e.g. "Buyer for your Fortnite OG accounts"

CREATE INDEX IF NOT EXISTS leads_game_idx  ON leads (game);
CREATE INDEX IF NOT EXISTS leads_trade_idx ON leads (lead_kind, trade_side);

INSERT INTO app_settings (key, value) VALUES
  ('trading',      '{"enabled":false,"i_sell":[],"i_want":[],"games":[],"extra_subreddits":[],"suggestions":null,"last_run":null,"last_result":null}'),
  ('integrations', '{"serper":{"enabled":false,"api_key":"","services":true,"trading":true},"x":{"enabled":false,"bearer_token":""},"reddit_api":{"enabled":false,"client_id":"","client_secret":"","username":""},"upwork_inbox":{"enabled":false},"status":{}}')
ON CONFLICT (key) DO NOTHING;
