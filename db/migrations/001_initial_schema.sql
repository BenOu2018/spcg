CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_email_present CHECK (length(trim(email)) > 3),
  CONSTRAINT users_password_hash_present CHECK (length(trim(password_hash)) > 0)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  age INT,
  parent_email TEXT,
  parent_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  "order" INT NOT NULL,
  title TEXT NOT NULL,
  knowledge_point TEXT NOT NULL,
  difficulty JSONB NOT NULL,
  description TEXT NOT NULL,
  statement_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_format TEXT NOT NULL,
  output_format TEXT NOT NULL,
  test_cases JSONB NOT NULL,
  hints JSONB NOT NULL,
  solution JSONB NOT NULL,
  official_code TEXT NOT NULL,
  solution_video_url TEXT,
  time_limit_ms INT NOT NULL DEFAULT 1000,
  memory_limit_mb INT NOT NULL DEFAULT 64,
  starter_code TEXT NOT NULL,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  sister_problem JSONB,
  import_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id),
  guardian_id TEXT,
  story TEXT,
  pass_out_problem_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT levels_status_valid CHECK (status IN ('draft','review','published','archived')),
  CONSTRAINT levels_test_cases_count CHECK (
    jsonb_typeof(test_cases) = 'array'
    AND jsonb_array_length(test_cases) = 20
  ),
  CONSTRAINT levels_hints_count CHECK (
    jsonb_typeof(hints) = 'array'
    AND jsonb_array_length(hints) = 3
  ),
  CONSTRAINT levels_difficulty_object CHECK (
    jsonb_typeof(difficulty) = 'object'
    AND (difficulty->>'spcgLevel') IS NOT NULL
    AND (difficulty->>'levelLabel') IS NOT NULL
    AND (difficulty->>'stars') IS NOT NULL
    AND (difficulty->>'label') IS NOT NULL
    AND difficulty ? 'lglevel'
    AND jsonb_typeof(difficulty->'spcgLevel') = 'number'
    AND jsonb_typeof(difficulty->'levelLabel') = 'string'
    AND jsonb_typeof(difficulty->'stars') = 'number'
    AND jsonb_typeof(difficulty->'label') = 'string'
    AND (
      difficulty->'lglevel' = 'null'::jsonb
      OR jsonb_typeof(difficulty->'lglevel') = 'string'
    )
    AND CASE
      WHEN (difficulty->>'spcgLevel') ~ '^[0-9]+$'
      THEN (difficulty->>'spcgLevel')::int BETWEEN 1 AND 10
      ELSE FALSE
    END
    AND difficulty->>'levelLabel' = ('SPCG ' || (difficulty->>'spcgLevel') || '级')
    AND (difficulty->>'stars') ~ '^[1-5]$'
    AND difficulty->>'label' IN ('入门','基础','提高','挑战','综合')
  ),
  CONSTRAINT levels_statement_assets_array CHECK (jsonb_typeof(statement_assets) = 'array'),
  CONSTRAINT levels_sister_problem_object CHECK (
    sister_problem IS NULL
    OR (
      jsonb_typeof(sister_problem) = 'object'
      AND sister_problem ? 'levelId'
      AND sister_problem ? 'title'
      AND sister_problem ? 'relation'
      AND sister_problem ? 'note'
      AND jsonb_typeof(sister_problem->'levelId') = 'string'
      AND jsonb_typeof(sister_problem->'title') = 'string'
      AND jsonb_typeof(sister_problem->'relation') = 'string'
      AND (
        sister_problem->'note' = 'null'::jsonb
        OR jsonb_typeof(sister_problem->'note') = 'string'
      )
      AND length(trim(sister_problem->>'levelId')) > 0
      AND length(trim(sister_problem->>'title')) > 0
      AND sister_problem->>'relation' IN ('same-pattern','same-knowledge','review')
    )
  ),
  CONSTRAINT levels_official_code_present CHECK (length(trim(official_code)) > 0)
);

CREATE INDEX IF NOT EXISTS levels_chapter_order_idx ON levels (chapter_id, "order");
CREATE INDEX IF NOT EXISTS levels_status_idx ON levels (status);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  code TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'auto'
    CHECK (language IN ('auto','c','cpp11','cpp14','cpp17','cpp20','cpp23','python3')),
  resolved_language TEXT
    CHECK (resolved_language IS NULL OR resolved_language IN ('c','cpp11','cpp14','cpp17','cpp20','cpp23','python3')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','judging','done','error')),
  verdict JSONB,
  is_pass_out BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS submissions_user_level_idx
  ON submissions (user_id, level_id, created_at DESC);

CREATE INDEX IF NOT EXISTS submissions_status_created_idx
  ON submissions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INT NOT NULL DEFAULT 0,
  best_runtime_ms INT,
  last_submitted_at TIMESTAMPTZ,
  passed_out BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, level_id)
);

CREATE TABLE IF NOT EXISTS admin_roles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','reviewer','support')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_name TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'practice'
    CHECK (type IN ('chapter','practice','review','challenge','import-review')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','published','archived')),
  visibility TEXT NOT NULL DEFAULT 'admin'
    CHECK (visibility IN ('admin','student')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_set_items (
  problem_set_id TEXT NOT NULL REFERENCES problem_sets(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  position INT NOT NULL,
  label TEXT,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (problem_set_id, level_id),
  UNIQUE (problem_set_id, position)
);

CREATE TABLE IF NOT EXISTS level_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_key TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'problem-bank',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validated','approved','rejected','imported')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_note TEXT,
  created_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  imported_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS level_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES level_import_batches(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending','passed','failed')),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','imported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS level_import_items_batch_idx
  ON level_import_items (batch_id, status);

CREATE TABLE IF NOT EXISTS user_admin_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active','suspended','deleted')),
  is_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS levels_set_updated_at ON levels;
CREATE TRIGGER levels_set_updated_at
BEFORE UPDATE ON levels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS submissions_set_updated_at ON submissions;
CREATE TRIGGER submissions_set_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS progress_set_updated_at ON progress;
CREATE TRIGGER progress_set_updated_at
BEFORE UPDATE ON progress
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS admin_roles_set_updated_at ON admin_roles;
CREATE TRIGGER admin_roles_set_updated_at
BEFORE UPDATE ON admin_roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS problem_sets_set_updated_at ON problem_sets;
CREATE TRIGGER problem_sets_set_updated_at
BEFORE UPDATE ON problem_sets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS level_import_batches_set_updated_at ON level_import_batches;
CREATE TRIGGER level_import_batches_set_updated_at
BEFORE UPDATE ON level_import_batches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_admin_states_set_updated_at ON user_admin_states;
CREATE TRIGGER user_admin_states_set_updated_at
BEFORE UPDATE ON user_admin_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW levels_public AS
SELECT
  l.id,
  l.chapter_id,
  l."order",
  l.title,
  l.knowledge_point,
  l.difficulty,
  l.sister_problem,
  l.description,
  l.statement_assets,
  l.input_format,
  l.output_format,
  COALESCE(public_cases.value, '[]'::jsonb) AS public_cases,
  COALESCE(hidden_cases.hidden_count, 0) AS hidden_count,
  l.hints,
  FALSE AS solution_unlocked,
  l.time_limit_ms,
  l.memory_limit_mb,
  l.starter_code,
  l.source,
  l.guardian_id,
  l.story,
  l.pass_out_problem_id
FROM levels l
LEFT JOIN LATERAL (
  SELECT jsonb_agg(tc.elem ORDER BY tc.ord) AS value
  FROM jsonb_array_elements(l.test_cases) WITH ORDINALITY AS tc(elem, ord)
  WHERE tc.elem->>'visibility' = 'public'
) public_cases ON TRUE
LEFT JOIN LATERAL (
  SELECT count(*)::int AS hidden_count
  FROM jsonb_array_elements(l.test_cases) AS tc(elem)
  WHERE tc.elem->>'visibility' = 'hidden'
) hidden_cases ON TRUE
WHERE l.status = 'published';
