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
  '雾铁初刃',
  'Mist-Iron First Blade',
  '名称：雾铁初刃。由雾镇旧矿的黑铁锻成，刃纹会记录每次提交与复盘。它没有耀眼光芒，却能把失败化成稳定力量，帮助新手斩开基础关卡，开启自己的段位传说。据说第一位通关者曾用它点亮第一盏雾灯。',
  'Mist-Iron First Blade: forged from Mist Town ore; marks turn failures into force and begin legend.',
  '/assets/art/ui/rewards/rank-weapons/thumbnails/black-iron-weapon-thumb.webp',
  '雾铁初刃黑铁兵器封面',
  'Mist-Iron First Blade cover',
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
