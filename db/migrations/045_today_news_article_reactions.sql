ALTER TABLE today_news_articles
  ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'today_news_like_count_nonnegative'
      AND conrelid = 'today_news_articles'::regclass
  ) THEN
    ALTER TABLE today_news_articles
      ADD CONSTRAINT today_news_like_count_nonnegative CHECK (like_count >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS today_news_article_reactions (
  article_id UUID NOT NULL REFERENCES today_news_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked BOOLEAN NOT NULL DEFAULT FALSE,
  bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (article_id, user_id)
);

CREATE INDEX IF NOT EXISTS today_news_article_reactions_liked_idx
  ON today_news_article_reactions (article_id)
  WHERE liked = TRUE;

CREATE INDEX IF NOT EXISTS today_news_article_reactions_user_bookmarks_idx
  ON today_news_article_reactions (user_id, updated_at DESC)
  WHERE bookmarked = TRUE;

UPDATE today_news_articles article
SET like_count = counted.like_count
FROM (
  SELECT article_id, COUNT(*)::int AS like_count
  FROM today_news_article_reactions
  WHERE liked = TRUE
  GROUP BY article_id
) counted
WHERE article.id = counted.article_id;
