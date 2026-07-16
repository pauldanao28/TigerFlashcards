-- Lets a user hide the Fail/Pass buttons in StudyView and rely on swipe gestures only.
-- (The "I already know this" fast-track button for never-reviewed cards is intentionally
-- excluded from this setting, since it has no swipe-gesture equivalent.)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS swipe_only boolean NOT NULL DEFAULT false;
