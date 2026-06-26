-- 0024_app_icon.sql
-- App launcher icon, auto-extracted from each uploaded APK.
--
-- On upload, the launcher icon is pulled from the APK and stored privately in
-- R2; this column points at it. Served (with magic-byte sniffing + nosniff) so
-- the dashboard and tester app show the real icon instead of a monogram.
-- Purely additive.

ALTER TABLE apps ADD COLUMN icon_key TEXT;
