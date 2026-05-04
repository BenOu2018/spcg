ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES auth.users(id);

ALTER TABLE levels
  DROP CONSTRAINT IF EXISTS levels_status_valid;

ALTER TABLE levels
  ADD CONSTRAINT levels_status_valid CHECK (status IN ('draft','review','published','archived'));

UPDATE levels
SET published_at = COALESCE(published_at, created_at)
WHERE status = 'published';

CREATE TABLE IF NOT EXISTS admin_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','reviewer','support')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_name TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
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
  created_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
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
  created_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  imported_by UUID REFERENCES auth.users(id),
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
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','imported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, level_id)
);

CREATE INDEX IF NOT EXISTS levels_status_idx ON levels (status, chapter_id, "order");
CREATE INDEX IF NOT EXISTS problem_sets_status_idx ON problem_sets (status, type);
CREATE INDEX IF NOT EXISTS problem_set_items_position_idx ON problem_set_items (problem_set_id, position);
CREATE INDEX IF NOT EXISTS level_import_batches_status_idx ON level_import_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS level_import_items_batch_idx ON level_import_items (batch_id, status);
CREATE INDEX IF NOT EXISTS admin_audit_logs_resource_idx
  ON admin_audit_logs (resource_type, resource_id, created_at DESC);

CREATE TRIGGER admin_roles_set_updated_at
BEFORE UPDATE ON admin_roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER problem_sets_set_updated_at
BEFORE UPDATE ON problem_sets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER level_import_batches_set_updated_at
BEFORE UPDATE ON level_import_batches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER level_import_items_set_updated_at
BEFORE UPDATE ON level_import_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION admin_role_rank(p_role TEXT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'support' THEN 10
    WHEN 'reviewer' THEN 20
    WHEN 'editor' THEN 30
    WHEN 'admin' THEN 40
    WHEN 'owner' THEN 50
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION is_admin(p_min_role TEXT DEFAULT 'support')
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_roles ar
    WHERE ar.user_id = auth.uid()
      AND ar.active = TRUE
      AND admin_role_rank(ar.role) >= admin_role_rank(p_min_role)
  );
$$;

CREATE OR REPLACE FUNCTION require_admin(p_min_role TEXT DEFAULT 'support')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT is_admin(p_min_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '28000';
  END IF;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION current_admin_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ar.role
  FROM admin_roles ar
  WHERE ar.user_id = auth.uid()
    AND ar.active = TRUE
  ORDER BY admin_role_rank(ar.role) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION write_admin_audit(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data,
    metadata
  )
  VALUES (
    auth.uid(),
    current_admin_role(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_before_data,
    p_after_data,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_level_status(p_level_id TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF p_status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'invalid level status';
  END IF;

  v_actor := require_admin('editor');

  SELECT to_jsonb(l) INTO v_before
  FROM levels l
  WHERE l.id = p_level_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'level not found';
  END IF;

  UPDATE levels
  SET
    status = p_status,
    published_at = CASE WHEN p_status = 'published' THEN NOW() ELSE NULL END,
    published_by = CASE WHEN p_status = 'published' THEN v_actor ELSE NULL END
  WHERE id = p_level_id;

  SELECT to_jsonb(l) INTO v_after
  FROM levels l
  WHERE l.id = p_level_id;

  PERFORM write_admin_audit(
    'level.set_status',
    'level',
    p_level_id,
    v_before,
    v_after,
    jsonb_build_object('status', p_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_problem_set_status(p_problem_set_id TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF p_status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'invalid problem set status';
  END IF;

  v_actor := require_admin('editor');

  SELECT to_jsonb(ps) INTO v_before
  FROM problem_sets ps
  WHERE ps.id = p_problem_set_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'problem set not found';
  END IF;

  UPDATE problem_sets
  SET
    status = p_status,
    visibility = CASE WHEN p_status = 'published' THEN 'student' ELSE visibility END,
    published_at = CASE WHEN p_status = 'published' THEN NOW() ELSE NULL END,
    published_by = CASE WHEN p_status = 'published' THEN v_actor ELSE NULL END
  WHERE id = p_problem_set_id;

  SELECT to_jsonb(ps) INTO v_after
  FROM problem_sets ps
  WHERE ps.id = p_problem_set_id;

  PERFORM write_admin_audit(
    'problem_set.set_status',
    'problem_set',
    p_problem_set_id,
    v_before,
    v_after,
    jsonb_build_object('status', p_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_review_import_batch(
  p_batch_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF p_status NOT IN ('approved','rejected','imported') THEN
    RAISE EXCEPTION 'invalid import batch status';
  END IF;

  v_actor := require_admin('reviewer');

  SELECT to_jsonb(b) INTO v_before
  FROM level_import_batches b
  WHERE b.id = p_batch_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'import batch not found';
  END IF;

  UPDATE level_import_batches
  SET
    status = p_status,
    review_note = p_note,
    reviewed_by = CASE WHEN p_status IN ('approved','rejected') THEN v_actor ELSE reviewed_by END,
    reviewed_at = CASE WHEN p_status IN ('approved','rejected') THEN NOW() ELSE reviewed_at END,
    imported_by = CASE WHEN p_status = 'imported' THEN v_actor ELSE imported_by END,
    imported_at = CASE WHEN p_status = 'imported' THEN NOW() ELSE imported_at END
  WHERE id = p_batch_id;

  UPDATE level_import_items
  SET status = CASE
    WHEN p_status = 'approved' THEN 'approved'
    WHEN p_status = 'rejected' THEN 'rejected'
    WHEN p_status = 'imported' THEN 'imported'
    ELSE status
  END
  WHERE batch_id = p_batch_id;

  SELECT to_jsonb(b) INTO v_after
  FROM level_import_batches b
  WHERE b.id = p_batch_id;

  PERFORM write_admin_audit(
    'import_batch.review',
    'level_import_batch',
    p_batch_id::text,
    v_before,
    v_after,
    jsonb_build_object('status', p_status, 'note', p_note)
  );
END;
$$;

DROP VIEW IF EXISTS levels_public;

CREATE VIEW levels_public AS
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
  EXISTS (
    SELECT 1
    FROM progress p
    WHERE p.user_id = auth.uid()
      AND p.level_id = l.id
      AND p.passed = TRUE
  ) AS solution_unlocked,
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

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_import_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin roles readable by admins" ON admin_roles;
CREATE POLICY "admin roles readable by admins" ON admin_roles
  FOR SELECT
  USING (user_id = auth.uid() OR is_admin('support'));

DROP POLICY IF EXISTS "audit readable by admins" ON admin_audit_logs;
CREATE POLICY "audit readable by admins" ON admin_audit_logs
  FOR SELECT
  USING (is_admin('support'));

DROP POLICY IF EXISTS "problem sets readable by admins" ON problem_sets;
CREATE POLICY "problem sets readable by admins" ON problem_sets
  FOR SELECT
  USING (is_admin('support'));

DROP POLICY IF EXISTS "problem set items readable by admins" ON problem_set_items;
CREATE POLICY "problem set items readable by admins" ON problem_set_items
  FOR SELECT
  USING (is_admin('support'));

DROP POLICY IF EXISTS "import batches readable by admins" ON level_import_batches;
CREATE POLICY "import batches readable by admins" ON level_import_batches
  FOR SELECT
  USING (is_admin('support'));

DROP POLICY IF EXISTS "import items readable by admins" ON level_import_items;
CREATE POLICY "import items readable by admins" ON level_import_items
  FOR SELECT
  USING (is_admin('support'));

REVOKE ALL ON FUNCTION require_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION write_admin_audit(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION current_admin_role() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_level_status(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_problem_set_status(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_review_import_batch(UUID, TEXT, TEXT) TO authenticated;
GRANT SELECT ON levels_public TO anon, authenticated;
