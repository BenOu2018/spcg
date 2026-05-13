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
  'black-iron-weapon-intro',
  'published',
  '黑铁兵器登场',
  'Black Iron Weapon',
  '黑铁兵器登场！这是段位旅程的第一把武器，陪你从基础关卡开始练算法。每次提交、通过和复盘都会让成长更清晰，拿起它挑战排行榜，把新手第一步变成真正的冒险，也为下一把兵器积蓄能量。今天就开始锻造。',
  'Black Iron arrives! First ranked blade means quests, code puzzles, growth records, and rank races.',
  '/assets/art/ui/rewards/rank-weapons/thumbnails/black-iron-weapon-thumb.webp',
  '黑铁段位兵器封面',
  'Black Iron ranked weapon cover',
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
