CREATE TABLE IF NOT EXISTS user_admin_states (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active','suspended','deleted')),
  is_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_admin_states_status_idx
  ON user_admin_states (account_status, is_test_account);

CREATE TRIGGER user_admin_states_set_updated_at
BEFORE UPDATE ON user_admin_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION admin_set_user_status(
  p_user_id UUID,
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
  IF p_status NOT IN ('active','suspended','deleted') THEN
    RAISE EXCEPTION 'invalid user status';
  END IF;

  v_actor := require_admin('admin');

  SELECT to_jsonb(s) INTO v_before
  FROM user_admin_states s
  WHERE s.user_id = p_user_id;

  INSERT INTO user_admin_states (user_id, account_status, notes, updated_by)
  VALUES (p_user_id, p_status, p_note, v_actor)
  ON CONFLICT (user_id)
  DO UPDATE SET
    account_status = EXCLUDED.account_status,
    notes = COALESCE(EXCLUDED.notes, user_admin_states.notes),
    updated_by = EXCLUDED.updated_by;

  SELECT to_jsonb(s) INTO v_after
  FROM user_admin_states s
  WHERE s.user_id = p_user_id;

  PERFORM write_admin_audit(
    'user.set_status',
    'user',
    p_user_id::text,
    v_before,
    v_after,
    jsonb_build_object('status', p_status, 'note', p_note)
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_user_test_account(
  p_user_id UUID,
  p_is_test_account BOOLEAN,
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
  v_actor := require_admin('admin');

  SELECT to_jsonb(s) INTO v_before
  FROM user_admin_states s
  WHERE s.user_id = p_user_id;

  INSERT INTO user_admin_states (user_id, is_test_account, notes, updated_by)
  VALUES (p_user_id, p_is_test_account, p_note, v_actor)
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_test_account = EXCLUDED.is_test_account,
    notes = COALESCE(EXCLUDED.notes, user_admin_states.notes),
    updated_by = EXCLUDED.updated_by;

  SELECT to_jsonb(s) INTO v_after
  FROM user_admin_states s
  WHERE s.user_id = p_user_id;

  PERFORM write_admin_audit(
    'user.set_test_account',
    'user',
    p_user_id::text,
    v_before,
    v_after,
    jsonb_build_object('isTestAccount', p_is_test_account, 'note', p_note)
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_reset_user_progress(
  p_user_id UUID,
  p_level_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before JSONB;
BEGIN
  PERFORM require_admin('admin');

  SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO v_before
  FROM progress p
  WHERE p.user_id = p_user_id
    AND (p_level_id IS NULL OR p.level_id = p_level_id);

  DELETE FROM progress p
  WHERE p.user_id = p_user_id
    AND (p_level_id IS NULL OR p.level_id = p_level_id);

  PERFORM write_admin_audit(
    'user.reset_progress',
    'user',
    p_user_id::text,
    v_before,
    '[]'::jsonb,
    jsonb_build_object('levelId', p_level_id)
  );
END;
$$;

ALTER TABLE user_admin_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user admin states readable by admins" ON user_admin_states;
CREATE POLICY "user admin states readable by admins" ON user_admin_states
  FOR SELECT
  USING (is_admin('support'));

REVOKE ALL ON FUNCTION admin_set_user_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_set_user_test_account(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_reset_user_progress(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_user_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_user_test_account(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reset_user_progress(UUID, TEXT) TO authenticated;
