ALTER TABLE today_news_articles
  DROP CONSTRAINT IF EXISTS today_news_body_zh_length,
  DROP CONSTRAINT IF EXISTS today_news_body_en_length;

ALTER TABLE today_news_articles
  ADD CONSTRAINT today_news_body_zh_length CHECK (char_length(btrim(body_zh)) BETWEEN 1 AND 100),
  ADD CONSTRAINT today_news_body_en_length CHECK (char_length(btrim(body_en)) BETWEEN 1 AND 100);
