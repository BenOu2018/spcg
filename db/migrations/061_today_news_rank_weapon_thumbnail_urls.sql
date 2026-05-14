WITH weapon_thumbnail_urls AS (
  SELECT *
  FROM (
    VALUES
      ('black-iron-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/black-iron-weapon-thumb.webp'),
      ('bronze-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/bronze-weapon-thumb.webp'),
      ('silver-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/silver-weapon-thumb.webp'),
      ('gold-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/gold-weapon-thumb.webp'),
      ('platinum-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/platinum-weapon-thumb.webp'),
      ('diamond-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/diamond-weapon-thumb.webp'),
      ('master-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/master-weapon-thumb.webp'),
      ('grandmaster-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/grandmaster-weapon-thumb.webp'),
      ('king-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/king-weapon-thumb.webp'),
      ('legend-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/legend-weapon-thumb.webp'),
      ('star-glory-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/star-glory-weapon-thumb.webp'),
      ('server-weapon-intro', '/assets/art/ui/rewards/rank-weapons/thumbnails/server-weapon-thumb.webp')
  ) AS rows(slug, image_url)
)
UPDATE today_news_articles article
SET
  image_url = weapon_thumbnail_urls.image_url,
  updated_at = NOW()
FROM weapon_thumbnail_urls
WHERE article.slug = weapon_thumbnail_urls.slug
  AND article.image_url <> weapon_thumbnail_urls.image_url;
