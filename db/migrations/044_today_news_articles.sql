CREATE TABLE IF NOT EXISTS today_news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  topic_zh TEXT NOT NULL,
  topic_en TEXT NOT NULL,
  body_zh TEXT NOT NULL,
  body_en TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_alt_zh TEXT NOT NULL,
  image_alt_en TEXT NOT NULL,
  author_key TEXT NOT NULL,
  author_name_zh TEXT NOT NULL,
  author_name_en TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT today_news_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT today_news_topic_zh_length CHECK (char_length(btrim(topic_zh)) BETWEEN 1 AND 40),
  CONSTRAINT today_news_topic_en_length CHECK (char_length(btrim(topic_en)) BETWEEN 1 AND 40),
  CONSTRAINT today_news_body_zh_length CHECK (char_length(btrim(body_zh)) BETWEEN 90 AND 100),
  CONSTRAINT today_news_body_en_length CHECK (char_length(btrim(body_en)) BETWEEN 90 AND 100),
  CONSTRAINT today_news_image_url_webp CHECK (image_url ~ '^/(assets|uploads/today-news)/.+\.webp$'),
  CONSTRAINT today_news_image_alt_zh_present CHECK (char_length(btrim(image_alt_zh)) BETWEEN 1 AND 80),
  CONSTRAINT today_news_image_alt_en_present CHECK (char_length(btrim(image_alt_en)) BETWEEN 1 AND 80),
  CONSTRAINT today_news_author_key_present CHECK (char_length(btrim(author_key)) BETWEEN 1 AND 40),
  CONSTRAINT today_news_author_name_zh_present CHECK (char_length(btrim(author_name_zh)) BETWEEN 1 AND 40),
  CONSTRAINT today_news_author_name_en_present CHECK (char_length(btrim(author_name_en)) BETWEEN 1 AND 40),
  CONSTRAINT today_news_published_at_required CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS today_news_articles_status_published_idx
  ON today_news_articles (status, published_at DESC, created_at DESC);

WITH author_pool AS (
  SELECT *
  FROM (
    VALUES
      ('xingyin-desk', '星隐编辑部', 'SPCG Desk'),
      ('mist-town-wire', '雾镇通讯社', 'Mist Town Wire'),
      ('algorithm-herald', '算法先导报', 'Algorithm Herald')
  ) AS authors(author_key, author_name_zh, author_name_en)
  ORDER BY random()
  LIMIT 1
)
INSERT INTO today_news_articles (
  slug,
  status,
  topic_zh,
  topic_en,
  body_zh,
  body_en,
  image_url,
  image_alt_zh,
  image_alt_en,
  author_key,
  author_name_zh,
  author_name_en,
  published_at
)
SELECT
  'spcg-online-launch',
  'published',
  'spcg online 上线',
  'SPCG Online Launch',
  'SPCG Online上线啦！从地图进入算法冒险，在关卡里写代码解谜，用成长记录看见每次进步，再到排行榜挑战同学。适合零基础慢慢升级，也能让高手刷题冲榜，今天就从第一关出发，马上体验吧。',
  'SPCG Online is live! Enter map quests, solve code puzzles, track growth, and race the leaderboard.',
  '/assets/art/ui/today-news/spcg-online-launch-thumb.webp',
  'SPCG Online 上线主视觉',
  'SPCG Online launch hero',
  author_key,
  author_name_zh,
  author_name_en,
  NOW()
FROM author_pool
ON CONFLICT (slug) DO UPDATE
SET
  status = EXCLUDED.status,
  topic_zh = EXCLUDED.topic_zh,
  topic_en = EXCLUDED.topic_en,
  body_zh = EXCLUDED.body_zh,
  body_en = EXCLUDED.body_en,
  image_url = EXCLUDED.image_url,
  image_alt_zh = EXCLUDED.image_alt_zh,
  image_alt_en = EXCLUDED.image_alt_en,
  published_at = COALESCE(today_news_articles.published_at, EXCLUDED.published_at),
  updated_at = NOW();

ALTER TABLE today_news_articles
  DROP CONSTRAINT IF EXISTS today_news_body_zh_length,
  DROP CONSTRAINT IF EXISTS today_news_body_en_length;

ALTER TABLE today_news_articles
  ADD CONSTRAINT today_news_body_zh_length CHECK (char_length(btrim(body_zh)) BETWEEN 90 AND 100),
  ADD CONSTRAINT today_news_body_en_length CHECK (char_length(btrim(body_en)) BETWEEN 90 AND 100);
