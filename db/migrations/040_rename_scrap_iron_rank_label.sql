ALTER TABLE user_wallets
  ALTER COLUMN title SET DEFAULT '黑铁晨雾算力学徒';

UPDATE user_wallets
SET
  title = '黑铁' || SUBSTRING(title FROM 3),
  updated_at = NOW()
WHERE rank = 'scrap_iron'
  AND title LIKE '烂铁%';
