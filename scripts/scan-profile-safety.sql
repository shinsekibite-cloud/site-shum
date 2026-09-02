-- Flag suspicious display names for moderation review
WITH suspects AS (
  SELECT id, email, name,
    CASE
      WHEN name ~* '(хуй|пизд|бля|ебан|сука|fuck|shit|пидор)' THEN 'lexicon'
      WHEN length(name) > 60 THEN 'long'
      WHEN name ~* '(ytyt|tytyty|asdfgh|qwerty)' THEN 'gibberish'
      WHEN array_length(regexp_split_to_array(trim(name), '\s+'), 1) > 5 THEN 'words'
      ELSE NULL
    END AS reason
  FROM "User"
  WHERE "deletedAt" IS NULL
),
new_flags AS (
  SELECT s.id AS user_id, s.name, s.reason
  FROM suspects s
  WHERE s.reason IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "ContentFlag" f
      WHERE f."actorUserId" = s.id
        AND f."sourceType" = 'PROFILE_TEXT'
        AND f.status = 'OPEN'
    )
)
INSERT INTO "ContentFlag" (
  id, category, categories, severity, "sourceType", "sourceId",
  "actorUserId", "originalText", "maskedText", matches, status,
  "reliabilityDelta", "warnIssued", "createdAt"
)
SELECT
  'cf_prof_' || substr(md5(random()::text || clock_timestamp()::text || user_id), 1, 20),
  'PROFILE_TEXT',
  '["PROFILE_TEXT"]',
  1,
  'PROFILE_TEXT',
  user_id,
  user_id,
  left(coalesce(name, ''), 400),
  left('name:' || reason, 400),
  json_build_array(reason)::text,
  'OPEN',
  0,
  false,
  NOW()
FROM new_flags
RETURNING "actorUserId", "originalText", "maskedText";
