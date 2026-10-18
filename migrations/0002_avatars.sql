-- A copy of the person's Nova profile picture, fetched with their own token (the `avatar` scope).
-- avatar_key is random and public (it is what appears in /api/avatars/<key>); it is not the Nova id.
-- The picture is only ever linked from content whose author chose to show their name.
ALTER TABLE profiles ADD COLUMN avatar_key  TEXT;
ALTER TABLE profiles ADD COLUMN avatar_b64  TEXT;
ALTER TABLE profiles ADD COLUMN avatar_type TEXT;
ALTER TABLE profiles ADD COLUMN avatar_etag TEXT;
CREATE UNIQUE INDEX profiles_by_avatar_key ON profiles (avatar_key) WHERE avatar_key IS NOT NULL;
