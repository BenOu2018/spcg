CREATE TABLE IF NOT EXISTS submission_error_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'minimax'
    CHECK (provider IN ('minimax')),
  model TEXT NOT NULL,
  verdict_result TEXT NOT NULL
    CHECK (verdict_result IN ('WA','TLE','RE','CE','Judge Error')),
  analysis JSONB NOT NULL,
  raw_error TEXT,
  prompt_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_error_analyses_analysis_object CHECK (
    jsonb_typeof(analysis) = 'object'
    AND jsonb_typeof(analysis->'summary') = 'string'
    AND jsonb_typeof(analysis->'likelyCause') = 'string'
    AND jsonb_typeof(analysis->'lineHints') = 'array'
    AND jsonb_typeof(analysis->'nextSteps') = 'array'
    AND jsonb_typeof(analysis->'fixedConcept') = 'string'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS submission_error_analyses_cache_idx
  ON submission_error_analyses (submission_id, provider, model, prompt_hash);

CREATE INDEX IF NOT EXISTS submission_error_analyses_submission_created_idx
  ON submission_error_analyses (submission_id, created_at DESC);
