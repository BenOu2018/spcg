ALTER TABLE reward_ledger
  DROP CONSTRAINT IF EXISTS reward_ledger_source_check;

ALTER TABLE reward_ledger
  ADD CONSTRAINT reward_ledger_source_check
  CHECK (
    source IN (
      'level_first_ac',
      'hidden_garlic_drop',
      'repair_ac',
      'assessment_complete',
      'assessment_rank_bonus',
      'daily_review_complete',
      'leaderboard_rank_award',
      'admin_adjustment'
    )
  );

INSERT INTO inventory_items (id, name, description, algorithm_tag, rarity, icon, stackable)
VALUES
  (
    'leaderboard-top-six',
    '老六',
    '进入本级挑战榜前六时获得的排名荣誉物品。',
    'leaderboard-rank',
    'rare',
    '/assets/art/ui/rewards/leaderboard-top-six.svg',
    TRUE
  ),
  (
    'leaderboard-top-three',
    '上榜',
    '进入本级挑战榜前三时获得的排名荣誉物品。',
    'leaderboard-rank',
    'epic',
    '/assets/art/ui/rewards/leaderboard-top-three.svg',
    TRUE
  ),
  (
    'leaderboard-champion',
    '霸榜',
    '登上本级挑战榜第一时获得的排名荣誉物品。',
    'leaderboard-rank',
    'legendary',
    '/assets/art/ui/rewards/leaderboard-champion.svg',
    TRUE
  )
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  algorithm_tag = EXCLUDED.algorithm_tag,
  rarity = EXCLUDED.rarity,
  icon = EXCLUDED.icon,
  stackable = EXCLUDED.stackable,
  active = TRUE;
