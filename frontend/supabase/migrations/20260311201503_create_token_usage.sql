-- Token usage tracking: captures input/output tokens per pipeline stage per project
CREATE TABLE token_usage (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  stage         text NOT NULL,
  trade         text,
  model         text NOT NULL,
  input_tokens  int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL DEFAULT 0,
  api_calls     int NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_token_usage_project ON token_usage(project_id);
CREATE INDEX idx_token_usage_user    ON token_usage(user_id);

ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own usage" ON token_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role inserts" ON token_usage FOR INSERT WITH CHECK (true);
