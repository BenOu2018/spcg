ALTER TABLE today_news_articles
  ADD COLUMN IF NOT EXISTS show_in_today_news BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 1000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'today_news_display_order_positive'
      AND conrelid = 'today_news_articles'::regclass
  ) THEN
    ALTER TABLE today_news_articles
      ADD CONSTRAINT today_news_display_order_positive CHECK (display_order > 0);
  END IF;
END $$;

UPDATE today_news_articles
SET
  show_in_today_news = TRUE,
  display_order = CASE slug
    WHEN 'black-iron-weapon-intro' THEN 1
    WHEN 'spcg-online-launch' THEN 2
    ELSE display_order
  END,
  updated_at = NOW()
WHERE slug IN ('black-iron-weapon-intro', 'spcg-online-launch');

CREATE INDEX IF NOT EXISTS today_news_articles_visible_idx
  ON today_news_articles (show_in_today_news, status, display_order, published_at DESC)
  WHERE show_in_today_news = TRUE;
