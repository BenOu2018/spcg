ALTER TABLE user_wallets
  ALTER COLUMN rank SET DEFAULT 'scrap_iron',
  ALTER COLUMN title SET DEFAULT '烂铁晨雾算力学徒';

ALTER TABLE user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_rank_check;

ALTER TABLE user_wallets
  ADD CONSTRAINT user_wallets_rank_check
  CHECK (
    rank IN (
      'scrap_iron',
      'bronze',
      'silver',
      'gold',
      'platinum',
      'diamond',
      'stellar',
      'king',
      'master',
      'grandmaster',
      'legend',
      'server'
    )
  );

WITH recalculated AS (
  SELECT
    user_id,
    garlic_balance,
    CASE
      WHEN coin_total >= 8000 THEN 'server'
      WHEN coin_total >= 6500 THEN 'legend'
      WHEN coin_total >= 5500 THEN 'grandmaster'
      WHEN coin_total >= 4500 THEN 'master'
      WHEN coin_total >= 3500 THEN 'king'
      WHEN coin_total >= 2200 THEN 'stellar'
      WHEN coin_total >= 1300 THEN 'diamond'
      WHEN coin_total >= 700 THEN 'platinum'
      WHEN coin_total >= 320 THEN 'gold'
      WHEN coin_total >= 200 THEN 'silver'
      WHEN coin_total >= 72 THEN 'bronze'
      ELSE 'scrap_iron'
    END AS next_rank,
    CASE
      WHEN coin_total >= 8000 THEN '服务器'
      WHEN coin_total >= 6500 THEN '传奇'
      WHEN coin_total >= 5500 THEN '宗师'
      WHEN coin_total >= 4500 THEN '大师'
      WHEN coin_total >= 3500 THEN '王者'
      WHEN coin_total >= 2200 THEN '星耀'
      WHEN coin_total >= 1300 THEN '钻石'
      WHEN coin_total >= 700 THEN '铂金'
      WHEN coin_total >= 320 THEN '黄金'
      WHEN coin_total >= 200 THEN '白银'
      WHEN coin_total >= 72 THEN '青铜'
      ELSE '烂铁'
    END AS next_rank_label
  FROM user_wallets
)
UPDATE user_wallets AS wallet
SET
  rank = recalculated.next_rank,
  title = CASE
    WHEN recalculated.garlic_balance >= 30 THEN recalculated.next_rank_label || '蒜力星尘守卫'
    WHEN recalculated.garlic_balance >= 12 THEN recalculated.next_rank_label || '二分星尘守卫'
    WHEN recalculated.garlic_balance >= 5 THEN recalculated.next_rank_label || '蒜粒收集家'
    ELSE recalculated.next_rank_label || '晨雾算力学徒'
  END,
  updated_at = NOW()
FROM recalculated
WHERE wallet.user_id = recalculated.user_id;
