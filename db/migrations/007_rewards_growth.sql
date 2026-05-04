CREATE TABLE IF NOT EXISTS user_wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coin_total INT NOT NULL DEFAULT 0 CHECK (coin_total >= 0),
  garlic_balance INT NOT NULL DEFAULT 0 CHECK (garlic_balance >= 0),
  rank TEXT NOT NULL DEFAULT 'bronze'
    CHECK (rank IN ('bronze','silver','gold','platinum','diamond','stellar')),
  title TEXT NOT NULL DEFAULT '晨雾算力学徒',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  algorithm_tag TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  icon TEXT,
  stackable BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_inventory (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  first_acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN ('level_first_ac','hidden_garlic_drop','assessment_complete','assessment_rank_bonus','admin_adjustment')),
  source_ref TEXT NOT NULL,
  coin_delta INT NOT NULL DEFAULT 0,
  garlic_delta INT NOT NULL DEFAULT 0,
  item_id TEXT REFERENCES inventory_items(id),
  item_quantity INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reward_ledger_nonzero CHECK (
    coin_delta <> 0 OR garlic_delta <> 0 OR item_quantity <> 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_ledger_once_idx
  ON reward_ledger (user_id, source, source_ref);

CREATE INDEX IF NOT EXISTS reward_ledger_user_created_idx
  ON reward_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assessment_sessions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('exam','contest')),
  title TEXT NOT NULL,
  problem_set_id TEXT REFERENCES problem_sets(id),
  duration_seconds INT NOT NULL CHECK (duration_seconds > 0),
  coin_reward INT NOT NULL DEFAULT 0 CHECK (coin_reward >= 0),
  garlic_reward INT NOT NULL DEFAULT 0 CHECK (garlic_reward >= 0),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','published','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES assessment_sessions(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','expired','abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  accepted_count INT NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  total_count INT NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  reward JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessment_attempts_user_created_idx
  ON assessment_attempts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assessment_attempts_session_user_idx
  ON assessment_attempts (session_id, user_id, created_at DESC);

DROP TRIGGER IF EXISTS user_wallets_set_updated_at ON user_wallets;
CREATE TRIGGER user_wallets_set_updated_at
BEFORE UPDATE ON user_wallets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS inventory_items_set_updated_at ON inventory_items;
CREATE TRIGGER inventory_items_set_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS assessment_sessions_set_updated_at ON assessment_sessions;
CREATE TRIGGER assessment_sessions_set_updated_at
BEFORE UPDATE ON assessment_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS assessment_attempts_set_updated_at ON assessment_attempts;
CREATE TRIGGER assessment_attempts_set_updated_at
BEFORE UPDATE ON assessment_attempts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO inventory_items (id, name, description, algorithm_tag, rarity, icon, stackable)
VALUES
  ('loop-charm', '循环护符', '记录你把重复步骤交给循环的第一次胜利。', '循环', 'common', null, true),
  ('branch-badge', '分支徽章', '在选择与判断中保持清醒的小徽章。', '分支', 'common', null, true),
  ('binary-scope', '二分望远镜', '把搜索范围一次次折半的星尘望远镜。', '二分', 'rare', null, true),
  ('recursion-cloak', '递归披风', '适合进入自相似迷宫时披上的轻披风。', '递归', 'epic', null, true),
  ('exam-garlic-core', '蒜力核心', '完成段位赛后凝成的一枚算力核心。', '段位赛', 'rare', null, true)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  algorithm_tag = EXCLUDED.algorithm_tag,
  rarity = EXCLUDED.rarity,
  icon = EXCLUDED.icon,
  stackable = EXCLUDED.stackable,
  active = TRUE;

INSERT INTO assessment_sessions (id, type, title, problem_set_id, duration_seconds, coin_reward, garlic_reward, status, metadata)
VALUES (
  'spcg-level-1',
  'exam',
  'SPCG 段位赛',
  null,
  5400,
  30,
  3,
  'published',
  '{"description":"SPCG Level 1 ranked match"}'::jsonb
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  duration_seconds = EXCLUDED.duration_seconds,
  coin_reward = EXCLUDED.coin_reward,
  garlic_reward = EXCLUDED.garlic_reward,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata;
